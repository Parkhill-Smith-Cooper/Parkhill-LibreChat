import { logger } from '@librechat/data-schemas';
import { FileContext } from 'librechat-data-provider';

import type { Request, Response } from 'express';
import type { Mongoose } from 'mongoose';

import { getSafeErrorMetadata } from '~/utils/errors';

export interface ImageDownloadInput {
  file_id: string;
  user: string;
  filepath: string;
}

export interface ImageDownloadRecord extends ImageDownloadInput {
  downloadCount: number;
  firstDownloadedAt: Date;
  lastDownloadedAt: Date;
}

export interface ImageDownloadStore {
  /** Creates the record on the first download and bumps the count on every later one. */
  record(input: ImageDownloadInput): Promise<void>;
  get(file_id: string): Promise<ImageDownloadRecord | null>;
}

/** Resolves a generated image the user owns by its stored `filepath`; `null` when there is none. */
export type FindGeneratedFile = (query: {
  filepath: string;
  user: string;
}) => Promise<{ file_id: string } | null>;

const MODEL_NAME = 'ParkhillImageDownload';
const COLLECTION = 'parkhillimagedownloads';
const MAX_FILEPATH_LENGTH = 2048;

export const INVALID_FILEPATH = 'INVALID_FILEPATH';
export const DOWNLOAD_NOT_RECORDED = 'DOWNLOAD_NOT_RECORDED';

/**
 * Parkhill-only collection of generated images users have downloaded, read by the
 * Tech Hub gallery to show only kept results. Kept outside `@librechat/data-schemas`
 * so the fork adds no edits to upstream model registration.
 */
export function createImageDownloadStore(mongoose: Mongoose): ImageDownloadStore {
  const existing = mongoose.models[MODEL_NAME];
  const Model =
    existing ??
    mongoose.model(
      MODEL_NAME,
      new mongoose.Schema(
        {
          file_id: { type: String, required: true, unique: true },
          user: { type: String, required: true, index: true },
          filepath: { type: String, required: true },
          downloadCount: { type: Number, default: 0 },
          firstDownloadedAt: { type: Date, required: true },
          lastDownloadedAt: { type: Date, required: true, index: true },
        },
        { timestamps: true, collection: COLLECTION },
      ),
    );

  return {
    async record(input) {
      const now = new Date();
      await Model.updateOne(
        { file_id: input.file_id },
        {
          $setOnInsert: { ...input, firstDownloadedAt: now },
          $set: { lastDownloadedAt: now },
          $inc: { downloadCount: 1 },
        },
        { upsert: true },
      );
    },
    async get(file_id) {
      const doc = await Model.findOne({ file_id }).lean<ImageDownloadRecord>();
      if (!doc) {
        return null;
      }
      return {
        file_id: doc.file_id,
        user: doc.user,
        filepath: doc.filepath,
        downloadCount: doc.downloadCount,
        firstDownloadedAt: doc.firstDownloadedAt,
        lastDownloadedAt: doc.lastDownloadedAt,
      };
    },
  };
}

interface DownloadRequest extends Request {
  user?: { id?: string; _id?: { toString(): string } };
}

export function createImageDownloadHandlers(deps: {
  store: ImageDownloadStore;
  findGeneratedFile: FindGeneratedFile;
}): {
  recordImageDownload: (req: DownloadRequest, res: Response) => Promise<Response>;
} {
  /**
   * Answers 204 whether or not a matching generated image exists, so the route
   * cannot be used to probe for other files.
   */
  async function recordImageDownload(req: DownloadRequest, res: Response): Promise<Response> {
    const body = req.body as { filepath?: unknown } | undefined;
    const filepath = typeof body?.filepath === 'string' ? body.filepath.trim() : '';
    if (!filepath || filepath.length > MAX_FILEPATH_LENGTH) {
      return res.status(400).json({ error: INVALID_FILEPATH });
    }
    const user = req.user?.id ?? req.user?._id?.toString();
    if (!user) {
      return res.status(204).end();
    }
    try {
      const file = await deps.findGeneratedFile({ filepath, user });
      if (file) {
        await deps.store.record({ file_id: file.file_id, user, filepath });
      }
      return res.status(204).end();
    } catch (error) {
      logger.error('[parkhill] Failed to record image download', getSafeErrorMetadata(error));
      return res.status(500).json({ error: DOWNLOAD_NOT_RECORDED });
    }
  }

  return { recordImageDownload };
}

/** The slice of the data-schemas `getFiles` method the lookup needs. */
export type GetGeneratedFiles = (
  filter: { filepath: string; user: string; context: string },
  sortOptions: null,
  selectFields: { file_id: 1 },
) => Promise<Array<{ file_id: string }> | null>;

export function createGeneratedFileFinder(getFiles: GetGeneratedFiles): FindGeneratedFile {
  return async ({ filepath, user }) => {
    const files = await getFiles({ filepath, user, context: FileContext.image_generation }, null, {
      file_id: 1,
    });
    return files?.[0] ?? null;
  };
}

/** Parkhill fork: wires the download store and handler for the `/api/parkhill` router. */
export function createParkhillImageDownloads(deps: {
  mongoose: Mongoose;
  getFiles: GetGeneratedFiles;
}): ReturnType<typeof createImageDownloadHandlers> {
  return createImageDownloadHandlers({
    store: createImageDownloadStore(deps.mongoose),
    findGeneratedFile: createGeneratedFileFinder(deps.getFiles),
  });
}
