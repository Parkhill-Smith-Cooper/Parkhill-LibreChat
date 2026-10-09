import { logger } from '@librechat/data-schemas';

import type { Request, Response } from 'express';
import type { ProjectCatalog } from './fabric';

import { getSafeErrorMetadata } from '~/utils/errors';

export const PROJECTS_UNAVAILABLE = 'PROJECTS_UNAVAILABLE';

export function createParkhillProjectHandlers(deps: { catalog: ProjectCatalog | null }): {
  listProjects: (req: Request, res: Response) => Promise<Response>;
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

  return { listProjects };
}
