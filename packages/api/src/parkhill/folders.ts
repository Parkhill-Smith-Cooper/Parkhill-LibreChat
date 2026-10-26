import type { Mongoose } from 'mongoose';

/** The slice of an upstream chat project (Projects section folder) this module reads. */
export interface ChatProjectRef {
  _id?: { toString(): string };
}

/** Upstream chat project methods, supplied by the caller (`~/models`). */
export interface FolderChatProjectMethods {
  getChatProject(user: string, projectId: string): Promise<ChatProjectRef | null>;
  createChatProject(
    user: string,
    input: { name: string; description?: string | null },
  ): Promise<ChatProjectRef>;
  deleteChatProject(user: string, projectId: string): Promise<unknown>;
}

export interface ProjectFolders {
  /** Official project number a folder was created for; `null` when it is a user-made folder. */
  findNumberForFolder(user: string, chatProjectId: string): Promise<string | null>;
  /** Returns the user's folder for the project, creating it (and the link) the first time. */
  ensureFolder(user: string, project: { number: string; name: string | null }): Promise<string>;
}

interface FolderLink {
  user: string;
  projectNumber: string;
  chatProjectId: string;
}

const MODEL_NAME = 'ParkhillProjectFolder';
const COLLECTION = 'parkhillprojectfolders';

export const folderName = (project: { number: string; name: string | null }): string =>
  project.name ? `${project.number} · ${project.name}` : project.number;

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error != null && 'code' in error && error.code === 11000;

/**
 * Parkhill-only links from an official project to the user's folder in the
 * upstream Projects section. The folder itself is an ordinary chat project, so
 * upstream owns its listing, stats and membership; the link only remembers which
 * folder stands for which project number, by id, so a rename keeps it.
 */
export function createProjectFolders(deps: {
  mongoose: Mongoose;
  methods: FolderChatProjectMethods;
}): ProjectFolders {
  const { mongoose, methods } = deps;
  const existing = mongoose.models[MODEL_NAME];
  const Model =
    existing ??
    mongoose.model(
      MODEL_NAME,
      new mongoose.Schema(
        {
          user: { type: String, required: true },
          projectNumber: { type: String, required: true },
          chatProjectId: { type: String, required: true },
        },
        { timestamps: true, collection: COLLECTION },
      )
        .index({ user: 1, projectNumber: 1 }, { unique: true })
        .index({ user: 1, chatProjectId: 1 }),
    );

  const findLink = (filter: Partial<FolderLink>) => Model.findOne(filter).lean<FolderLink>();

  /** Stores `chatProjectId` as the link unless another request linked one first. */
  async function claimLink(
    user: string,
    projectNumber: string,
    chatProjectId: string,
    staleId: string | null,
  ): Promise<boolean> {
    if (staleId) {
      const replaced = await Model.findOneAndUpdate(
        { user, projectNumber, chatProjectId: staleId },
        { $set: { chatProjectId } },
        { new: true },
      ).lean<FolderLink>();
      return replaced != null;
    }
    try {
      const link = await Model.findOneAndUpdate(
        { user, projectNumber },
        { $setOnInsert: { user, projectNumber, chatProjectId } },
        { upsert: true, new: true },
      ).lean<FolderLink>();
      return link?.chatProjectId === chatProjectId;
    } catch (error) {
      if (isDuplicateKey(error)) {
        return false;
      }
      throw error;
    }
  }

  return {
    async findNumberForFolder(user, chatProjectId) {
      const link = await findLink({ user, chatProjectId });
      return link?.projectNumber ?? null;
    },

    async ensureFolder(user, project) {
      const projectNumber = project.number;
      const link = await findLink({ user, projectNumber });
      if (link && (await methods.getChatProject(user, link.chatProjectId))) {
        return link.chatProjectId;
      }

      const created = await methods.createChatProject(user, {
        name: folderName(project),
        description: `Parkhill project ${projectNumber}`,
      });
      const chatProjectId = created._id?.toString();
      if (!chatProjectId) {
        throw new Error('Created chat project has no id');
      }
      if (await claimLink(user, projectNumber, chatProjectId, link?.chatProjectId ?? null)) {
        return chatProjectId;
      }

      /** A concurrent first message linked its own folder: drop ours and join that one. */
      await methods.deleteChatProject(user, chatProjectId);
      const winner = await findLink({ user, projectNumber });
      if (!winner) {
        throw new Error('Project folder link disappeared during creation');
      }
      return winner.chatProjectId;
    },
  };
}
