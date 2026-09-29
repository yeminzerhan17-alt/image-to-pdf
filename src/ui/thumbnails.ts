/**
 * Thumbnail object URLs.
 *
 * The grid needs an <img src> per page, so URLs are cached per page id and
 * released explicitly - 60 leaked blob URLs holding 400KB JPEGs each is exactly
 * the memory problem this app is designed around.
 */

import type { Page } from '../types';

const cache = new Map<string, string>();

export function thumbUrl(page: Page): string {
  const existing = cache.get(page.id);
  if (existing) return existing;
  const url = URL.createObjectURL(page.blob);
  cache.set(page.id, url);
  return url;
}

/** Release thumbnails for pages that no longer exist (and for removed pages). */
export function pruneThumbs(keepIds: ReadonlySet<string>): void {
  for (const [id, url] of cache) {
    if (!keepIds.has(id)) {
      URL.revokeObjectURL(url);
      cache.delete(id);
    }
  }
}

export function releaseAllThumbs(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}

export function releaseThumb(id: string): void {
  const url = cache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(id);
  }
}
