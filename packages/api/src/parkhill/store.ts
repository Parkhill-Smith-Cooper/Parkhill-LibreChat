import type { Mongoose } from 'mongoose';

export interface ConversationProjectInput {
  conversationId: string;
  user: string;
  projectNumber: string | null;
  projectName: string | null;
  noProject: boolean;
}

export interface ConversationProjectRecord extends ConversationProjectInput {
  createdAt: Date;
}

export interface ConversationProjectStore {
  /** Records the choice once; a later call for the same conversation is a no-op. */
  record(input: ConversationProjectInput): Promise<void>;
  get(conversationId: string): Promise<ConversationProjectRecord | null>;
}

const MODEL_NAME = 'ParkhillConversationProject';
const COLLECTION = 'parkhillconversationprojects';

/**
 * Parkhill-only collection linking a conversation to its official project.
 * Kept outside `@librechat/data-schemas` so the fork adds no edits to upstream
 * model registration; it receives the app's mongoose instance like `createModels`.
 */
export function createConversationProjectStore(mongoose: Mongoose): ConversationProjectStore {
  const existing = mongoose.models[MODEL_NAME];
  const Model =
    existing ??
    mongoose.model(
      MODEL_NAME,
      new mongoose.Schema(
        {
          conversationId: { type: String, required: true, unique: true },
          user: { type: String, required: true, index: true },
          projectNumber: { type: String, default: null, index: true },
          projectName: { type: String, default: null },
          noProject: { type: Boolean, default: false },
        },
        { timestamps: true, collection: COLLECTION },
      ),
    );

  return {
    async record(input) {
      await Model.updateOne(
        { conversationId: input.conversationId },
        { $setOnInsert: input },
        { upsert: true },
      );
    },
    async get(conversationId) {
      const doc = await Model.findOne({ conversationId }).lean<ConversationProjectRecord>();
      if (!doc) {
        return null;
      }
      return {
        conversationId: doc.conversationId,
        user: doc.user,
        projectNumber: doc.projectNumber ?? null,
        projectName: doc.projectName ?? null,
        noProject: doc.noProject === true,
        createdAt: doc.createdAt,
      };
    },
  };
}
