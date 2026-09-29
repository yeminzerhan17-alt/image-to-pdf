/**
 * Document enhancement: grayscale + auto-levels, applied through a 256-entry
 * lookup table in a single pass over the pixels we already have in the canvas.
 * This is what makes handwriting photographed in bad light legible, and it
 * cuts JPEG size several-fold at the same time.
 */

import type { EnhanceMode } from '../types';

export interface Levels {
  lo: number;
  hi: number;
}

/** How much of the histogram to clip at each end. Aggressive for 'gray',
 *  gentle for 'gray-soft' so paper stays light and untouched. */
const CLIP_PERCENT: Record<Exclude<EnhanceMode, 'none'>, number> = {
  gray: 0.5,
  'gray-soft': 4,
};

/**
 * Ceiling on how far the contrast stretch may be pushed.
 *
 * A very low-contrast photo (a dim shot of a page spanning only 30 levels, say)
 * would otherwise be stretched 8x, which amplifies sensor noise into visible
 * speckle and makes the JPEG *larger*, the opposite of what "clean up" is for.
 * Dim-light pages typically span 100+ levels, so a 3x cap leaves those alone.
 */
export const MAX_STRETCH = 3;

export function luminanceHistogram(data: Uint8ClampedArray): Uint32Array {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] as number;
    const g = data[i + 1] as number;
    const b = data[i + 2] as number;
    const bucket = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    histogram[bucket] = (histogram[bucket] as number) + 1;
  }
  return histogram;
}

/**
 * Find the black and white points that clip `clipPercent` of the histogram at
 * each end. Falls back to a full range when the image is nearly flat.
 */
export function autoLevels(histogram: Uint32Array, clipPercent: number): Levels {
  let total = 0;
  for (let i = 0; i < 256; i += 1) total += histogram[i] as number;
  if (total === 0) return { lo: 0, hi: 255 };

  const clip = Math.max(1, Math.floor((total * clipPercent) / 100));

  let accumulated = 0;
  let lo = 0;
  for (let i = 0; i < 256; i += 1) {
    accumulated += histogram[i] as number;
    if (accumulated > clip) {
      lo = i;
      break;
    }
  }

  accumulated = 0;
  let hi = 255;
  for (let i = 255; i >= 0; i -= 1) {
    accumulated += histogram[i] as number;
    if (accumulated > clip) {
      hi = i;
      break;
    }
  }

  // A flat or inverted span would destroy the image; keep a sane minimum.
  if (hi - lo < 8) return { lo: 0, hi: 255 };
  return { lo, hi };
}

export function buildLut(mode: EnhanceMode, levels: Levels): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  if (mode === 'none') {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }

  let { lo, hi } = levels;
  const detected = Math.max(1, hi - lo);
  const minimumSpan = 255 / MAX_STRETCH;
  if (detected < minimumSpan) {
    // Keep the detected midpoint but refuse to amplify beyond the cap.
    const middle = (lo + hi) / 2;
    lo = middle - minimumSpan / 2;
    hi = middle + minimumSpan / 2;
  }

  const span = Math.max(1, hi - lo);
  for (let i = 0; i < 256; i += 1) {
    const stretched = Math.min(255, Math.max(0, ((i - lo) / span) * 255));
    if (mode === 'gray') {
      lut[i] = stretched;
    } else {
      // Blend halfway back toward the original so prints keep a natural look,
      // then lift the white point slightly to clean up grey paper.
      lut[i] = Math.min(255, (stretched * 0.6 + i * 0.4) * 1.06);
    }
  }
  return lut;
}

/**
 * Apply the LUT in place. When `grayscale` is set every channel receives the
 * mapped luma, which is what collapses a colour JPEG to a much smaller
 * grayscale one.
 */
export function applyLut(
  data: Uint8ClampedArray,
  lut: Uint8ClampedArray,
  grayscale: boolean,
): void {
  for (let i = 0; i < data.length; i += 4) {
    if (grayscale) {
      const luma =
        (0.299 * (data[i] as number) +
          0.587 * (data[i + 1] as number) +
          0.114 * (data[i + 2] as number)) |
        0;
      const value = lut[luma] as number;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    } else {
      data[i] = lut[data[i] as number] as number;
      data[i + 1] = lut[data[i + 1] as number] as number;
      data[i + 2] = lut[data[i + 2] as number] as number;
    }
  }
}

/** Convenience: derive levels from pixels, then build the LUT. */
export function lutForPixels(mode: EnhanceMode, data: Uint8ClampedArray): Uint8ClampedArray {
  if (mode === 'none') return buildLut('none', { lo: 0, hi: 255 });
  const histogram = luminanceHistogram(data);
  const levels = autoLevels(histogram, CLIP_PERCENT[mode]);
  return buildLut(mode, levels);
}

export function isGrayscale(mode: EnhanceMode): boolean {
  return mode !== 'none';
}

/** CSS approximation of the chosen mode, used for instant tile previews so we
 *  never have to decode full pixels just to show a thumbnail. */
export function previewFilter(mode: EnhanceMode): string {
  switch (mode) {
    case 'gray':
      return 'grayscale(1) contrast(1.35) brightness(1.04)';
    case 'gray-soft':
      return 'grayscale(1) contrast(1.12) brightness(1.06)';
    default:
      return 'none';
  }
}
