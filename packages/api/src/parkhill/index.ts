import { logger } from '@librechat/data-schemas';
import type { Mongoose } from 'mongoose';
import type { ConversationProjectCapture } from './middleware';
import type { FolderChatProjectMethods } from './folders';
import type { ConversationProjectStore } from './store';
import { createFabricProjectSource, createProjectCatalog, getFabricConfig } from './fabric';
import { createConversationProjectCapture } from './middleware';
import { createParkhillProjectHandlers } from './handlers';
import { createConversationProjectStore } from './store';
import { getSafeErrorMetadata } from '~/utils/errors';
import { createProjectFolders } from './folders';

export * from './fabric';
export * from './store';
export * from './handlers';
export * from './middleware';
export * from './folders';
export * from './downloads';

/**
 * Parkhill fork: wires the Fabric project list, the conversation-project store,
 * the list handler and the chat capture middleware around one shared cache.
 * With `chatProjects`, an official project choice also files the conversation
 * into the user's folder for it in the upstream Projects section.
 * Without `FABRIC_SQL_SERVER` the handler reports `enabled: false` and the
 * middleware only strips the field.
 */
export interface ParkhillProjects {
  enabled: boolean;
  store: ConversationProjectStore;
  handlers: ReturnType<typeof createParkhillProjectHandlers>;
  captureConversationProject: ConversationProjectCapture;
}

export function createParkhillProjects(deps: {
  mongoose: Mongoose;
  chatProjects?: FolderChatProjectMethods;
  env?: NodeJS.ProcessEnv;
}): ParkhillProjects {
  const config = getFabricConfig(deps.env);
  const catalog = config
    ? createProjectCatalog(createFabricProjectSource(config), config.cacheTtlMs)
    : null;
  const store = createConversationProjectStore(deps.mongoose);
  const folders = deps.chatProjects
    ? createProjectFolders({ mongoose: deps.mongoose, methods: deps.chatProjects })
    : undefined;
  /** Cold Fabric loads take ~15s; warm the cache at startup so the first picker is instant. */
  catalog?.getProjects().catch((error) => {
    logger.warn('[parkhill] Initial project list load failed', getSafeErrorMetadata(error));
  });
  return {
    enabled: catalog != null,
    store,
    handlers: createParkhillProjectHandlers({ catalog, folders }),
    captureConversationProject: createConversationProjectCapture({ catalog, store, folders }),
  };
}
