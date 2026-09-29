/**
 * EXIF capture time.
 *
 * This MUST run against the raw File, before the downscale step throws the
 * original bytes away. exifr is dynamically imported so it stays out of the
 * entry chunk.
 */

function toMillis(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export async function readCaptureTime(file: Blob): Promise<number | null> {
  try {
    const exifr = await import('exifr');
    const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
    if (!data) return null;
    return (
      toMillis((data as Record<string, unknown>)['DateTimeOriginal']) ??
      toMillis((data as Record<string, unknown>)['CreateDate'])
    );
  } catch {
    // No EXIF, or a format exifr cannot read. The page simply has no time and
    // sortByTime() keeps such pages in import order.
    return null;
  }
}
