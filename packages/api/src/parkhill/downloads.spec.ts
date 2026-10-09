import mongoose from 'mongoose';
import { FileContext } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { FindGeneratedFile, ImageDownloadStore } from './downloads';
import {
  INVALID_FILEPATH,
  DOWNLOAD_NOT_RECORDED,
  createImageDownloadStore,
  createGeneratedFileFinder,
  createImageDownloadHandlers,
} from './downloads';

const USER = new mongoose.Types.ObjectId().toString();
const OTHER_USER = new mongoose.Types.ObjectId().toString();
const FILEPATH = 'https://blob.example/images/u1/gen.png';

function mockRes() {
  const res = { status: jest.fn(), json: jest.fn(), end: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.end.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock; end: jest.Mock };
}

const makeStore = (): ImageDownloadStore & { record: jest.Mock } => ({
  record: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
});

describe('createImageDownloadHandlers', () => {
  const run = (
    body: unknown,
    deps: { store?: ImageDownloadStore; findGeneratedFile?: FindGeneratedFile } = {},
    user: { id?: string } = { id: USER },
  ) => {
    const store = deps.store ?? makeStore();
    const findGeneratedFile =
      deps.findGeneratedFile ?? jest.fn().mockResolvedValue({ file_id: 'f1' });
    const { recordImageDownload } = createImageDownloadHandlers({ store, findGeneratedFile });
    const res = mockRes();
    const req = { body, user } as Parameters<typeof recordImageDownload>[0];
    return { res, store, findGeneratedFile, done: recordImageDownload(req, res) };
  };

  it('records a download of the user’s generated image', async () => {
    const { res, store, findGeneratedFile, done } = run({ filepath: ` ${FILEPATH} ` });
    await done;
    expect(findGeneratedFile).toHaveBeenCalledWith({ filepath: FILEPATH, user: USER });
    expect(store.get).not.toHaveBeenCalled();
    expect(store.record).toHaveBeenCalledWith({ file_id: 'f1', user: USER, filepath: FILEPATH });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it.each([{}, { filepath: '' }, { filepath: 42 }, { filepath: 'x'.repeat(2049) }, undefined])(
    'rejects an invalid body %#',
    async (body) => {
      const { res, store, done } = run(body);
      await done;
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: INVALID_FILEPATH });
      expect(store.record).not.toHaveBeenCalled();
    },
  );

  it('answers 204 without writing when no generated image matches', async () => {
    const store = makeStore();
    const { res, done } = run(
      { filepath: FILEPATH },
      { store, findGeneratedFile: jest.fn().mockResolvedValue(null) },
    );
    await done;
    expect(res.status).toHaveBeenCalledWith(204);
    expect(store.record).not.toHaveBeenCalled();
  });

  it('answers 204 without looking up files when there is no user', async () => {
    const { res, store, findGeneratedFile, done } = run({ filepath: FILEPATH }, {}, {});
    await done;
    expect(res.status).toHaveBeenCalledWith(204);
    expect(findGeneratedFile).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
  });

  it('maps a database failure to a coded 500 without leaking the error', async () => {
    const store = makeStore();
    store.record.mockRejectedValue(new Error('connection to 10.0.0.5 refused'));
    const { res, done } = run({ filepath: FILEPATH }, { store });
    await done;
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: DOWNLOAD_NOT_RECORDED });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('10.0.0.5');
  });
});

describe('image download persistence', () => {
  let mongo: MongoMemoryServer;
  let methods: ReturnType<typeof createMethods>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    createModels(mongoose);
    methods = createMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('creates the record once and counts later downloads', async () => {
    const store = createImageDownloadStore(mongoose);
    const input = { file_id: 'f-count', user: USER, filepath: FILEPATH };
    await store.record(input);
    const first = await store.get('f-count');
    await store.record(input);
    const second = await store.get('f-count');

    expect(first).toEqual(expect.objectContaining({ ...input, downloadCount: 1 }));
    expect(second?.downloadCount).toBe(2);
    expect(second?.firstDownloadedAt).toEqual(first?.firstDownloadedAt);
    expect(second!.lastDownloadedAt.getTime()).toBeGreaterThanOrEqual(
      first!.lastDownloadedAt.getTime(),
    );
    await expect(store.get('missing')).resolves.toBeNull();
    expect(createImageDownloadStore(mongoose)).toBeDefined();
  });

  it('finds only generated images owned by the user', async () => {
    const base = { type: 'image/png', bytes: 1, object: 'file' as const };
    await methods.createFile(
      {
        ...base,
        file_id: 'gen',
        user: new mongoose.Types.ObjectId(USER),
        filename: 'gen.png',
        filepath: FILEPATH,
        context: FileContext.image_generation,
      },
      true,
    );
    await methods.createFile(
      {
        ...base,
        file_id: 'upload',
        user: new mongoose.Types.ObjectId(USER),
        filename: 'upload.png',
        filepath: 'https://blob.example/images/u1/upload.png',
        context: FileContext.message_attachment,
      },
      true,
    );
    const find = createGeneratedFileFinder(methods.getFiles);

    await expect(find({ filepath: FILEPATH, user: USER })).resolves.toEqual(
      expect.objectContaining({ file_id: 'gen' }),
    );
    await expect(find({ filepath: FILEPATH, user: OTHER_USER })).resolves.toBeNull();
    await expect(
      find({ filepath: 'https://blob.example/images/u1/upload.png', user: USER }),
    ).resolves.toBeNull();
  });
});
