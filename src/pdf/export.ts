/**
 * Export orchestration: encode -> build -> check size -> step quality down.
 *
 * The loop verifies against the ACTUAL built PDF each time, so the reported
 * size is never an estimate. It is bounded by MAX_ATTEMPTS and by the quality
 * floor, so the worst case is a known number of passes rather than an
 * open-ended search.
 */

import type { PreparedPdf } from '../state/store';
import type { Page, Settings } from '../types';
import { buildPdf } from './build';
import { buildFilename } from './filename';
import { MAX_ATTEMPTS, isAtFloor, nextQuality, pdfOverheadBytes } from './quality';
import { encodePages } from './serialize';
import type { EncodeCache } from './serialize';

export interface PrepareProgress {
  phase: 'encode' | 'build';
  attempt: number;
  attempts: number;
  done: number;
  total: number;
}

export interface PrepareOptions {
  pages: readonly Page[];
  settings: Settings;
  onProgress?: (progress: PrepareProgress) => void;
}

export async function preparePdf(options: PrepareOptions): Promise<PreparedPdf> {
  const { pages, settings, onProgress } = options;
  if (pages.length === 0) throw new Error('Add at least one image before exporting.');

  const cache: EncodeCache = new Map();
  let quality = settings.quality;
  let lastBytes = 0;
  let blob: Blob | null = null;
  let usedQuality = quality;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    onProgress?.({ phase: 'encode', attempt, attempts: MAX_ATTEMPTS, done: 0, total: pages.length });

    const encoded = await encodePages(pages, {
      quality,
      enhance: settings.enhance,
      cache,
      onProgress: (progress) =>
        onProgress?.({
          phase: 'encode',
          attempt,
          attempts: MAX_ATTEMPTS,
          done: progress.done,
          total: progress.total,
        }),
    });

    onProgress?.({
      phase: 'build',
      attempt,
      attempts: MAX_ATTEMPTS,
      done: pages.length,
      total: pages.length,
    });

    const built = await buildPdf(encoded, settings);
    blob = built.blob;
    lastBytes = built.bytes;
    usedQuality = quality;

    const target = settings.maxBytes;
    if (!target || lastBytes <= target) break;

    if (isAtFloor(quality)) {
      // Best possible quality at the floor still exceeds the target: hand over
      // the smallest we can make rather than silently failing.
      break;
    }

    const next = nextQuality(quality, lastBytes, target);
    if (next >= quality) break;
    quality = next;
  }

  if (!blob) throw new Error('Could not build the PDF.');

  // Sanity check against the modelled overhead so a mis-sized PDF is visible in
  // development rather than silently shipped.
  const modelledFloor = pdfOverheadBytes(pages.length);
  if (lastBytes < modelledFloor) {
    console.warn('PDF is smaller than the modelled overhead; check the size model.', {
      lastBytes,
      modelledFloor,
    });
  }

  return {
    blob,
    filename: buildFilename(settings.nameTemplate, {
      subject: settings.subject,
      date: new Date(),
      count: pages.length,
    }),
    bytes: lastBytes,
    pageCount: pages.length,
    quality: usedQuality,
  };
}
