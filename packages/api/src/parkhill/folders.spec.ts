import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { NextFunction, Response } from 'express';
import type { FolderChatProjectMethods, ProjectFolders } from './folders';
import type { CaptureRequest } from './middleware';
import { createConversationProjectCapture, PARKHILL_PROJECT_FIELD } from './middleware';
import { createProjectFolders, folderName } from './folders';
import { createParkhillProjectHandlers } from './handlers';
import { createProjectCatalog } from './fabric';

const PROJECTS = [
  { number: '2401.00', name: 'Main St Bridge' },
  { number: '2402.00', name: 'Harbor Park' },
];

let mongo: MongoMemoryServer;
let methods: ReturnType<typeof createMethods>;
let chatProjects: FolderChatProjectMethods;
let folders: ProjectFolders;
let userSeq = 0;
const nextUser = () => `user-${++userSeq}`;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
  chatProjects = {
    getChatProject: methods.getChatProject,
    createChatProject: methods.createChatProject,
    deleteChatProject: methods.deleteChatProject,
  };
  folders = createProjectFolders({ mongoose, methods: chatProjects });
  await mongoose.models.ParkhillProjectFolder.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const listFolders = async (user: string) =>
  (await methods.listChatProjects(user, { limit: 100 })).projects;

describe('createProjectFolders', () => {
  it('creates the folder the first time and reuses it after', async () => {
    const user = nextUser();
    const first = await folders.ensureFolder(user, PROJECTS[0]);
    const second = await folders.ensureFolder(user, PROJECTS[0]);
    expect(second).toBe(first);
    const projects = await listFolders(user);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('2401.00 · Main St Bridge');
    await expect(folders.findNumberForFolder(user, first)).resolves.toBe('2401.00');
  });

  it('keeps folders per user and per project', async () => {
    const [alice, bob] = [nextUser(), nextUser()];
    const a1 = await folders.ensureFolder(alice, PROJECTS[0]);
    const a2 = await folders.ensureFolder(alice, PROJECTS[1]);
    const b1 = await folders.ensureFolder(bob, PROJECTS[0]);
    expect(new Set([a1, a2, b1]).size).toBe(3);
    await expect(folders.findNumberForFolder(bob, a1)).resolves.toBeNull();
  });

  it('keeps the link after a rename and recreates a deleted folder', async () => {
    const user = nextUser();
    const id = await folders.ensureFolder(user, PROJECTS[0]);
    await methods.updateChatProject(user, id, { name: 'My bridge' });
    await expect(folders.ensureFolder(user, PROJECTS[0])).resolves.toBe(id);

    await methods.deleteChatProject(user, id);
    const recreated = await folders.ensureFolder(user, PROJECTS[0]);
    expect(recreated).not.toBe(id);
    await expect(folders.findNumberForFolder(user, recreated)).resolves.toBe('2401.00');
    await expect(listFolders(user)).resolves.toHaveLength(1);
  });

  it('settles concurrent first messages on one folder', async () => {
    const user = nextUser();
    const ids = await Promise.all(
      Array.from({ length: 4 }, () => folders.ensureFolder(user, PROJECTS[1])),
    );
    expect(new Set(ids).size).toBe(1);
    await expect(listFolders(user)).resolves.toHaveLength(1);
  });

  it('names a folder by number when the official name is unknown', () => {
    expect(folderName({ number: '2401.00', name: null })).toBe('2401.00');
  });
});

describe('capture middleware with folders', () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const run = async (
    user: string,
    body: Record<string, unknown>,
    deps: { folders?: ProjectFolders } = { folders },
  ) => {
    const store = { record: jest.fn().mockResolvedValue(undefined), get: jest.fn() };
    const catalog = createProjectCatalog({ load: async () => PROJECTS }, 1000);
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    const req = { method: 'POST', body, user: { id: user } } as unknown as CaptureRequest;
    let resolveNext: () => void = () => undefined;
    const nextCalled = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
    const next = jest.fn(() => resolveNext()) as unknown as NextFunction;
    createConversationProjectCapture({ catalog, store, ...deps })(
      req,
      res as unknown as Response,
      next,
    );
    await nextCalled;
    body.conversationId = 'convo-1';
    res.emit('finish');
    await flush();
    return { body, store };
  };

  it('files a new conversation into the project folder before the chat continues', async () => {
    const user = nextUser();
    const { body, store } = await run(user, { [PARKHILL_PROJECT_FIELD]: '2401.00' });
    expect(typeof body.chatProjectId).toBe('string');
    await expect(folders.findNumberForFolder(user, body.chatProjectId as string)).resolves.toBe(
      '2401.00',
    );
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({ projectNumber: '2401.00', conversationId: 'convo-1' }),
    );
  });

  it('keeps a folder the user made themselves', async () => {
    const user = nextUser();
    const own = await methods.createChatProject(user, { name: 'Mine' });
    const ownId = own._id?.toString();
    const { body } = await run(user, { chatProjectId: ownId, [PARKHILL_PROJECT_FIELD]: '2401.00' });
    expect(body.chatProjectId).toBe(ownId);
  });

  it('moves a chat started in another project folder to the chosen project', async () => {
    const user = nextUser();
    const other = await folders.ensureFolder(user, PROJECTS[1]);
    const { body } = await run(user, { chatProjectId: other, [PARKHILL_PROJECT_FIELD]: '2401.00' });
    expect(body.chatProjectId).not.toBe(other);
    await expect(folders.findNumberForFolder(user, body.chatProjectId as string)).resolves.toBe(
      '2401.00',
    );
  });

  it('leaves the folder alone for "No project" and unknown numbers', async () => {
    const user = nextUser();
    const none = await run(user, { [PARKHILL_PROJECT_FIELD]: 'none' });
    expect(none.body).not.toHaveProperty('chatProjectId');
    const unknown = await run(user, { [PARKHILL_PROJECT_FIELD]: '9999' });
    expect(unknown.body).not.toHaveProperty('chatProjectId');
    await expect(listFolders(user)).resolves.toHaveLength(0);
  });

  it('continues the chat when the folder cannot be created', async () => {
    const broken: ProjectFolders = {
      findNumberForFolder: jest.fn().mockResolvedValue(null),
      ensureFolder: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const { body, store } = await run(
      nextUser(),
      { [PARKHILL_PROJECT_FIELD]: '2401.00' },
      { folders: broken },
    );
    expect(body).not.toHaveProperty('chatProjectId');
    expect(store.record).toHaveBeenCalled();
  });
});

describe('getFolderProject handler', () => {
  const makeRes = () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
  };
  const catalog = createProjectCatalog({ load: async () => PROJECTS }, 1000);
  const call = (user: string, chatProjectId: string, deps = { catalog, folders }) => {
    const res = makeRes();
    const req = { params: { chatProjectId }, user: { id: user } } as never;
    return createParkhillProjectHandlers(deps)
      .getFolderProject(req, res)
      .then(() => res);
  };

  it("returns the folder's project number only to its owner", async () => {
    const user = nextUser();
    const id = await folders.ensureFolder(user, PROJECTS[0]);
    expect((await call(user, id)).json).toHaveBeenCalledWith({ projectNumber: '2401.00' });
    expect((await call(nextUser(), id)).json).toHaveBeenCalledWith({ projectNumber: null });
    expect((await call(user, 'not-an-id')).json).toHaveBeenCalledWith({ projectNumber: null });
  });

  it('answers with a stable code when the lookup fails', async () => {
    const broken: ProjectFolders = {
      findNumberForFolder: jest.fn().mockRejectedValue(new Error('secret host')),
      ensureFolder: jest.fn(),
    };
    const res = await call(nextUser(), '507f1f77bcf86cd799439011', {
      catalog,
      folders: broken,
    });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'FOLDER_LOOKUP_FAILED' });
  });
});
