/**
 * Target-file-size search.
 *
 * DESIGN NOTE / deviation from the original plan: a true bisection over quality
 * would need ~6 full encode passes over every page. Re-encoding a 3.9MP image is
 * ~50-150ms on a phone, so 6 passes over 30 pages is a 30s stall. Instead we
 * build at the current quality, and if the result overshoots the target we step
 * quality down using a byte-ratio model and rebuild. That is at most
 * `MAX_ATTEMPTS` real builds, each verified against the actual PDF size, so the
 * answer is still exact rather than modelled.
 *
 * The model is a pure function and is unit tested for monotonicity.
 */

export const QUALITY_FLOOR = 0.4;
export const MAX_ATTEMPTS = 4;

/** Bytes of PDF structure per page: object dicts plus xref, no embedded fonts. */
export const PDF_BYTES_PER_PAGE = 1536;
export const PDF_FIXED_BYTES = 1024;

export function sumBytes(chunks: readonly Uint8Array[]): number {
  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  return total;
}

export function pdfOverheadBytes(pageCount: number): number {
  return PDF_FIXED_BYTES + PDF_BYTES_PER_PAGE * pageCount;
}

/**
 * Next quality to try when the build overshot. Always strictly below `current`
 * so the loop cannot stall, and never below `floor` so we terminate with the
 * best we can do rather than looping forever.
 */
export function nextQuality(
  current: number,
  totalBytes: number,
  targetBytes: number,
  floor: number = QUALITY_FLOOR,
): number {
  if (totalBytes <= targetBytes) return current;
  if (targetBytes <= 0) return floor;

  // JPEG size grows sublinearly with the quality factor; 0.75 is a good fit
  // over the 0.4-0.95 range.
  const ratio = targetBytes / totalBytes;
  const suggested = current * Math.pow(ratio, 0.75);

  // Guarantee real progress, then clamp.
  const stepped = Math.min(suggested, current - 0.05);
  const clamped = Math.max(floor, stepped);
  return Math.round(clamped * 1000) / 1000;
}

export function isAtFloor(quality: number, floor: number = QUALITY_FLOOR): boolean {
  return quality <= floor + 1e-6;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Cache key so repeat exports at the same settings re-encode nothing. */
export function encodeKey(pageId: string, quality: number, enhance: string): string {
  return `${pageId}|${quality}|${enhance}`;
}
