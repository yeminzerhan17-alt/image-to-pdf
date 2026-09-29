/**
 * Import orchestration.
 *
 * Sequential by design (concurrency 1). Decoding two 12MP photos at once is how
 * you get an iOS Safari "this webpage reloaded" crash; one at a time keeps peak
 * memory flat no matter how many photos the user picks.
 */

import { MAX_EDGE_PX, MAX_PAGES, STORE_QUALITY } from '../types';
import type { Page } from '../types';
import { UnsupportedImageError } from './decode';
import { readCaptureTime } from './exif';
import { renderToJpeg } from './resize';

export interface ImportProgress {
  done: number;
  total: number;
  currentName: string;
}

export interface ImportResult {
  pages: Page[];
  warnings: string[];
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Hand control back to the browser so the progress UI can paint. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export interface ImportOptions {
  /** How many pages the user already has, so MAX_PAGES is respected. */
  existingCount?: number;
  onProgress?: (progress: ImportProgress) => void;
}

export async function importFiles(
  files: readonly File[],
  options: ImportOptions = {},
): Promise<ImportResult> {
  const pages: Page[] = [];
  const warnings: string[] = [];

  const existing = options.existingCount ?? 0;
  const room = Math.max(0, MAX_PAGES - existing);
  const queue = files.slice(0, room);

  if (files.length > room) {
    warnings.push(
      room === 0
        ? `Page limit reached (${MAX_PAGES}).`
        : `Only ${room} of ${files.length} files were added (limit ${MAX_PAGES}).`,
    );
  }

  const total = queue.length;

  for (let index = 0; index < total; index += 1) {
    const file = queue[index] as File;
    options.onProgress?.({ done: index, total, currentName: file.name });

    try {
      // EXIF first: the original bytes are discarded right after this.
      const takenAt = await readCaptureTime(file);

      // Re-encoding through the canvas is what makes HEIC work and what keeps
      // memory flat. The raw File is never embedded or uploaded.
      const rendered = await renderToJpeg(file, {
        maxEdge: MAX_EDGE_PX,
        quality: STORE_QUALITY,
        enhance: 'none',
      });

      pages.push({
        id: newId(),
        blob: rendered.blob,
        width: rendered.width,
        height: rendered.height,
        rotation: 0,
        takenAt,
        srcName: file.name,
        bytes: rendered.blob.size,
      });
    } catch (error) {
      const message =
        error instanceof UnsupportedImageError
          ? error.message
          : `Could not process ${file.name}.`;
      if (!warnings.includes(message)) warnings.push(message);
    }

    options.onProgress?.({ done: index + 1, total, currentName: file.name });
    await yieldToBrowser();
  }

  return { pages, warnings };
}
