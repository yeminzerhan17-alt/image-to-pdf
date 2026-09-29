/**
 * Encode pass: stored page JPEGs -> PDF-ready image bytes.
 *
 * Rotation is NOT baked into the pixels here; the PDF placement applies it, so
 * rotating a page costs nothing and loses no quality.
 */

import { renderToJpeg } from '../import/resize';
import type { EnhanceMode, Page, Rotation } from '../types';
import { encodeKey, sumBytes } from './quality';

export interface EncodedPage {
  bytes: Uint8Array;
  /** Pixel dimensions of the encoded image, before rotation. */
  width: number;
  height: number;
  rotation: Rotation;
}

export interface EncodeProgress {
  done: number;
  total: number;
}

export type EncodeCache = Map<string, Uint8Array>;

/**
 * Encode every page at one quality. The cache is keyed by page+quality+enhance
 * so retrying the target-size loop never re-encodes work it already did.
 */
export async function encodePages(
  pages: readonly Page[],
  options: {
    quality: number;
    enhance: EnhanceMode;
    cache: EncodeCache;
    onProgress?: (progress: EncodeProgress) => void;
  },
): Promise<EncodedPage[]> {
  const { quality, enhance, cache, onProgress } = options;
  const encoded: EncodedPage[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] as Page;
    const key = encodeKey(page.id, quality, enhance);

    let bytes = cache.get(key);
    if (!bytes) {
      const rendered = await renderToJpeg(page.blob, { maxEdge: null, quality, enhance });
      bytes = new Uint8Array(await rendered.blob.arrayBuffer());
      cache.set(key, bytes);
    }

    encoded.push({
      bytes,
      width: page.width,
      height: page.height,
      rotation: page.rotation,
    });

    onProgress?.({ done: index + 1, total: pages.length });
  }

  return encoded;
}

export function totalPageBytes(encoded: readonly EncodedPage[]): number {
  return sumBytes(encoded.map((page) => page.bytes));
}
