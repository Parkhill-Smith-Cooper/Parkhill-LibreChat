import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { NextFunction, Response } from 'express';
import type { ConversationProjectStore } from './store';
import type { CaptureRequest } from './middleware';
import type { ProjectSource } from './fabric';
import { getFabricConfig, createProjectCatalog, compareProjectNumbers } from './fabric';
import { createConversationProjectCapture, PARKHILL_PROJECT_FIELD } from './middleware';
import { createParkhillProjectHandlers } from './handlers';
import { createConversationProjectStore } from './store';

const PROJECTS = [
  { number: '2401.00', name: 'Main St Bridge' },
  { number: '2402.00', name: 'Harbor Park' },
];

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('getFabricConfig', () => {
  it('is disabled without a server', () => {
    expect(getFabricConfig({ FABRIC_SQL_DATABASE: 'db' })).toBeNull();
  });

  it('rejects a table name that is not schema.table', () => {
    expect(
      getFabricConfig({
        FABRIC_SQL_SERVER: 's',
        FABRIC_SQL_DATABASE: 'db',
        FABRIC_PROJECTS_TABLE: 'x]; DROP TABLE y;--',
      }),
    ).toBeNull();
  });

  it('applies defaults', () => {
    expect(getFabricConfig({ FABRIC_SQL_SERVER: 's', FABRIC_SQL_DATABASE: 'db' })).toEqual({
      server: 's',
      database: 'db',
      table: 'DT_BRZ.project',
      cacheTtlMs: 15 * 60 * 1000,
      managedIdentityClientId: undefined,
    });
  });
});

describe('compareProjectNumbers', () => {
  it('sorts dotted segments numerically', () => {
    expect(['2.10', '2.9', '10.1', '2.9.1'].sort(compareProjectNumbers)).toEqual([
      '2.9',
      '2.9.1',
      '2.10',
      '10.1',
    ]);
  });
});

describe('createProjectCatalog', () => {
  it('shares one in-flight load and caches within the TTL', async () => {
    const load = jest.fn().mockResolvedValue(PROJECTS);
    const catalog = createProjectCatalog({ load }, 1000, () => 0);
    const [a, b] = await Promise.all([catalog.getProjects(), catalog.getProjects()]);
    await catalog.findProject('2401.00');
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('serves the stale list when a refresh fails', async () => {
    let time = 0;
    const load = jest
      .fn()
      .mockResolvedValueOnce(PROJECTS)
      .mockRejectedValue(new Error('fabric down'));
    const catalog = createProjectCatalog({ load }, 1000, () => time);
    await catalog.getProjects();
    time = 5000;
    await expect(catalog.getProjects()).resolves.toEqual(PROJECTS);
    await flush();
    await expect(catalog.findProject('2402.00')).resolves.toEqual(PROJECTS[1]);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('throws when nothing was ever loaded', async () => {
    const source: ProjectSource = { load: jest.fn().mockRejectedValue(new Error('down')) };
    await expect(createProjectCatalog(source, 1000).getProjects()).rejects.toThrow('down');
  });
});

describe('createParkhillProjectHandlers', () => {
  const makeRes = () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
  };

  it('reports disabled without a catalog', async () => {
    const res = makeRes();
    await createParkhillProjectHandlers({ catalog: null }).listProjects({} as never, res);
    expect(res.json).toHaveBeenCalledWith({ enabled: false, projects: [] });
  });

  it('returns 503 with a stable code and no error text', async () => {
    const res = makeRes();
    const catalog = createProjectCatalog(
      { load: () => Promise.reject(new Error('secret host')) },
      1,
    );
    await createParkhillProjectHandlers({ catalog }).listProjects({} as never, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ enabled: true, error: 'PROJECTS_UNAVAILABLE' });
  });
});

describe('createConversationProjectCapture', () => {
  const makeStore = () => ({ record: jest.fn().mockResolvedValue(undefined), get: jest.fn() });

  const run = (
    body: Record<string, unknown>,
    opts: {
      store?: ConversationProjectStore;
      catalog?: ReturnType<typeof createProjectCatalog> | null;
      statusCode?: number;
    } = {},
  ) => {
    const store = opts.store ?? makeStore();
    const catalog =
      opts.catalog === undefined
        ? createProjectCatalog({ load: async () => PROJECTS }, 1000)
        : opts.catalog;
    const res = Object.assign(new EventEmitter(), { statusCode: opts.statusCode ?? 200 });
    const req = { method: 'POST', body, user: { id: 'user-1' } } as unknown as CaptureRequest;
    const next: NextFunction = jest.fn();
    createConversationProjectCapture({ catalog, store })(req, res as unknown as Response, next);
    /** Simulates the controller assigning the server-side id, then the response ending. */
    const finish = async (conversationId = 'convo-1') => {
      body.conversationId = conversationId;
      res.emit('finish');
      res.emit('close');
      await flush();
    };
    return { store, next, finish, body };
  };

  it('records the official name for a new conversation after the response finishes', async () => {
    const { store, next, finish, body } = run({
      conversationId: 'new',
      [PARKHILL_PROJECT_FIELD]: '2401.00',
    });
    expect(next).toHaveBeenCalled();
    expect(body).not.toHaveProperty(PARKHILL_PROJECT_FIELD);
    expect(store.record).not.toHaveBeenCalled();
    await finish();
    expect(store.record).toHaveBeenCalledTimes(1);
    expect(store.record).toHaveBeenCalledWith({
      conversationId: 'convo-1',
      user: 'user-1',
      projectNumber: '2401.00',
      projectName: 'Main St Bridge',
      noProject: false,
    });
  });

  it('records an explicit "No project"', async () => {
    const { store, finish } = run({ [PARKHILL_PROJECT_FIELD]: 'none' });
    await finish();
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({ projectNumber: null, noProject: true }),
    );
  });

  it('ignores existing conversations but still strips the field', async () => {
    const { store, finish, body } = run({
      conversationId: 'existing',
      [PARKHILL_PROJECT_FIELD]: '2401.00',
    });
    expect(body).not.toHaveProperty(PARKHILL_PROJECT_FIELD);
    await finish('existing');
    expect(store.record).not.toHaveBeenCalled();
  });

  it('ignores unknown project numbers', async () => {
    const { store, finish } = run({ [PARKHILL_PROJECT_FIELD]: '9999' });
    await finish();
    expect(store.record).not.toHaveBeenCalled();
  });

  it('skips failed requests', async () => {
    const { store, finish } = run({ [PARKHILL_PROJECT_FIELD]: '2401.00' }, { statusCode: 429 });
    await finish();
    expect(store.record).not.toHaveBeenCalled();
  });

  it('only strips the field when the feature is disabled', async () => {
    const { store, finish, body } = run({ [PARKHILL_PROJECT_FIELD]: '2401.00' }, { catalog: null });
    expect(body).not.toHaveProperty(PARKHILL_PROJECT_FIELD);
    await finish();
    expect(store.record).not.toHaveBeenCalled();
  });

  it('keeps the number unverified when Fabric is unreachable', async () => {
    const catalog = createProjectCatalog({ load: () => Promise.reject(new Error('down')) }, 1000);
    const { store, finish } = run({ [PARKHILL_PROJECT_FIELD]: '2401.00' }, { catalog });
    await finish();
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({ projectNumber: '2401.00', projectName: null, noProject: false }),
    );
  });

  it('never fails the chat when the store throws', async () => {
    const store = { record: jest.fn().mockRejectedValue(new Error('db down')), get: jest.fn() };
    const { next, finish } = run({ [PARKHILL_PROJECT_FIELD]: '2401.00' }, { store });
    await expect(finish()).resolves.toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('createConversationProjectStore', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('keeps the first choice and returns null for absence', async () => {
    const store = createConversationProjectStore(mongoose);
    const base = {
      conversationId: 'c1',
      user: 'u1',
      projectName: 'Main St Bridge',
      noProject: false,
    };
    await store.record({ ...base, projectNumber: '2401.00' });
    await store.record({ ...base, projectNumber: '2402.00' });
    await expect(store.get('c1')).resolves.toEqual(
      expect.objectContaining({ projectNumber: '2401.00', projectName: 'Main St Bridge' }),
    );
    await expect(store.get('missing')).resolves.toBeNull();
    expect(createConversationProjectStore(mongoose)).toBeDefined();
  });
});
