import { request } from 'librechat-data-provider';

/**
 * Parkhill fork: reports that the user downloaded an image so the Tech Hub gallery
 * can show only kept results. The server ignores anything that is not the user's
 * own generated image. Fire-and-forget: it never delays or fails the download.
 */
export function recordImageDownload(filepath: string): void {
  if (!filepath) {
    return;
  }
  request.post('/api/parkhill/image-downloads', { filepath }).catch(() => undefined);
}
