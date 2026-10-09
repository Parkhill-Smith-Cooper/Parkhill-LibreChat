import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';

import type { NextFunction, Request, Response } from 'express';
import type { ConversationProjectInput, ConversationProjectStore } from './store';
import type { ProjectCatalog } from './fabric';

import { getSafeErrorMetadata } from '~/utils/errors';

/** Request body field the client sends with the first message of a new conversation. */
export const PARKHILL_PROJECT_FIELD = 'parkhillProject';
/** Value meaning the user explicitly chose "No project". */
export const NO_PROJECT = 'none';

const MAX_PROJECT_NUMBER_LENGTH = 200;

export interface CaptureRequest extends Request {
  user?: { id?: string; _id?: { toString(): string } };
}

interface CaptureDependencies {
  catalog: ProjectCatalog | null;
  store: ConversationProjectStore;
}

const isNewConversation = (conversationId: unknown): boolean =>
  conversationId == null || conversationId === '' || conversationId === Constants.NEW_CONVO;

async function resolveChoice(
  choice: string,
  catalog: ProjectCatalog,
): Promise<Omit<ConversationProjectInput, 'conversationId' | 'user'> | null> {
  if (choice === NO_PROJECT) {
    return { projectNumber: null, projectName: null, noProject: true };
  }
  try {
    const project = await catalog.findProject(choice);
    if (!project) {
      logger.warn('[parkhill] Ignoring unknown project number on new conversation');
      return null;
    }
    return { projectNumber: project.number, projectName: project.name, noProject: false };
  } catch (error) {
    /** Fabric unreachable: keep the number so the choice isn't lost; the name stays empty. */
    logger.warn(
      '[parkhill] Project list unavailable; recording unverified number',
      getSafeErrorMetadata(error),
    );
    return { projectNumber: choice, projectName: null, noProject: false };
  }
}

/**
 * Records the project chosen for a new conversation. The server assigns the
 * conversation id inside the chat controller, so the record is written once the
 * response finishes. The field is always removed from the body so it never
 * reaches endpoint options or a model provider. Never fails the chat request.
 */
export type ConversationProjectCapture = (
  req: CaptureRequest,
  res: Response,
  next: NextFunction,
) => void;

export function createConversationProjectCapture(
  deps: CaptureDependencies,
): ConversationProjectCapture {
  return function captureConversationProject(
    req: CaptureRequest,
    res: Response,
    next: NextFunction,
  ): void {
    const body = req.body as Record<string, unknown> | undefined;
    const raw = body?.[PARKHILL_PROJECT_FIELD];
    if (body && raw !== undefined) {
      delete body[PARKHILL_PROJECT_FIELD];
    }

    const choice = typeof raw === 'string' ? raw.trim() : '';
    const user = req.user?.id ?? req.user?._id?.toString();
    if (
      !deps.catalog ||
      req.method !== 'POST' ||
      !choice ||
      choice.length > MAX_PROJECT_NUMBER_LENGTH ||
      !user ||
      !isNewConversation(body?.conversationId)
    ) {
      next();
      return;
    }

    const resolved = resolveChoice(choice, deps.catalog);
    let handled = false;
    const onDone = () => {
      if (handled) {
        return;
      }
      handled = true;
      const conversationId = body?.conversationId;
      if (
        res.statusCode >= 400 ||
        typeof conversationId !== 'string' ||
        isNewConversation(conversationId)
      ) {
        return;
      }
      resolved
        .then((fields) =>
          fields ? deps.store.record({ conversationId, user, ...fields }) : undefined,
        )
        .catch((error) => {
          logger.error(
            '[parkhill] Failed to record conversation project',
            getSafeErrorMetadata(error),
          );
        });
    };
    res.once('finish', onDone);
    res.once('close', onDone);
    next();
  };
}
