import { useQuery } from '@tanstack/react-query';
import { request } from 'librechat-data-provider';
import type { ParkhillProject } from './store';

export type ParkhillProjectsResponse = {
  enabled: boolean;
  projects: ParkhillProject[];
};

export type ParkhillProjectFolderResponse = {
  projectNumber: string | null;
};

/** Kept local so the fork does not edit upstream `keys.ts`. */
export const parkhillProjectsQueryKey = ['parkhillProjects'] as const;
export const parkhillProjectFolderQueryKey = (chatProjectId: string) =>
  ['parkhillProjectFolder', chatProjectId] as const;

/** `true` when the server says the feature is on but the list is unavailable (503). */
export function isProjectsUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error == null || !('response' in error)) {
    return false;
  }
  const { response } = error;
  return (
    typeof response === 'object' &&
    response != null &&
    'status' in response &&
    response.status === 503
  );
}

export const useParkhillProjectsQuery = () =>
  useQuery<ParkhillProjectsResponse>(
    parkhillProjectsQueryKey,
    () => request.get<ParkhillProjectsResponse>('/api/parkhill/projects'),
    {
      staleTime: 15 * 60 * 1000,
      cacheTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

/** Official project a Projects-section folder was created for (`null` for user-made folders). */
export const useParkhillProjectFolderQuery = (
  chatProjectId: string | undefined,
  enabled: boolean,
) =>
  useQuery<ParkhillProjectFolderResponse>(
    parkhillProjectFolderQueryKey(chatProjectId ?? ''),
    () =>
      request.get<ParkhillProjectFolderResponse>(
        `/api/parkhill/project-folders/${encodeURIComponent(chatProjectId ?? '')}`,
      ),
    {
      enabled: enabled && !!chatProjectId,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );
