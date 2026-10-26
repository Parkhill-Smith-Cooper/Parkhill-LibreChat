import { logger } from '@librechat/data-schemas';

import type { Request, Response } from 'express';
import type { ProjectFolders } from './folders';
import type { ProjectCatalog } from './fabric';

import { getSafeErrorMetadata } from '~/utils/errors';

export const PROJECTS_UNAVAILABLE = 'PROJECTS_UNAVAILABLE';
export const FOLDER_LOOKUP_FAILED = 'FOLDER_LOOKUP_FAILED';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type FolderRequest = Request<{ chatProjectId: string }> & {
  user?: { id?: string; _id?: { toString(): string } };
};

export function createParkhillProjectHandlers(deps: {
  catalog: ProjectCatalog | null;
  folders?: ProjectFolders;
}): {
  listProjects: (req: Request, res: Response) => Promise<Response>;
  getFolderProject: (req: FolderRequest, res: Response) => Promise<Response>;
} {
  async function listProjects(_req: Request, res: Response): Promise<Response> {
    if (!deps.catalog) {
      return res.status(200).json({ enabled: false, projects: [] });
    }
    try {
      const projects = await deps.catalog.getProjects();
      return res.status(200).json({ enabled: true, projects });
    } catch (error) {
      logger.error('[parkhill] Failed to load project list', getSafeErrorMetadata(error));
      return res.status(503).json({ enabled: true, error: PROJECTS_UNAVAILABLE });
    }
  }

  /** Official project a Projects-section folder stands for; `null` for a user-made folder. */
  async function getFolderProject(req: FolderRequest, res: Response): Promise<Response> {
    const user = req.user?.id ?? req.user?._id?.toString();
    const { chatProjectId } = req.params;
    if (!deps.catalog || !deps.folders || !user || !OBJECT_ID_PATTERN.test(chatProjectId)) {
      return res.status(200).json({ projectNumber: null });
    }
    try {
      const projectNumber = await deps.folders.findNumberForFolder(user, chatProjectId);
      return res.status(200).json({ projectNumber });
    } catch (error) {
      logger.error('[parkhill] Failed to read project folder link', getSafeErrorMetadata(error));
      return res.status(500).json({ error: FOLDER_LOOKUP_FAILED });
    }
  }

  return { listProjects, getFolderProject };
}
