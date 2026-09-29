import { describe, expect, it } from 'vitest';

import {
  MAX_STRETCH,
  applyLut,
  autoLevels,
  buildLut,
  isGrayscale,
  luminanceHistogram,
  lutForPixels,
  previewFilter,
} from '../src/edit/enhance';

function pixels(values: Array<[number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(values.length * 4);
  values.forEach(([r, g, b], index) => {
    data[index * 4] = r;
    data[index * 4 + 1] = g;
    data[index * 4 + 2] = b;
    data[index * 4 + 3] = 255;
  });
  return data;
}

function uniformHistogram(from: number, to: number, count = 1000): Uint32Array {
  const histogram = new Uint32Array(256);
  for (let i = from; i <= to; i += 1) histogram[i] = count;
  return histogram;
}

describe('luminanceHistogram', () => {
  it('buckets white and black where you would expect', () => {
    const histogram = luminanceHistogram(
      pixels([
        [255, 255, 255],
        [0, 0, 0],
      ]),
    );
    expect(histogram[255]).toBe(1);
    expect(histogram[0]).toBe(1);
  });

  it('weights green more heavily than blue', () => {
    const green = luminanceHistogram(pixels([[0, 255, 0]]));
    const blue = luminanceHistogram(pixels([[0, 0, 255]]));
    const greenBucket = green.findIndex((count) => count > 0);
    const blueBucket = blue.findIndex((count) => count > 0);
    expect(greenBucket).toBeGreaterThan(blueBucket);
  });
});

describe('autoLevels', () => {
  it('clips the histogram at both ends', () => {
    const levels = autoLevels(uniformHistogram(50, 205), 0.5);
    expect(levels.lo).toBe(50);
    expect(levels.hi).toBe(205);
  });

  it('leaves a flat image alone instead of blowing it out', () => {
    // Every pixel at the same value: stretching would turn it into noise.
    expect(autoLevels(uniformHistogram(200, 200), 0.5)).toEqual({ lo: 0, hi: 255 });
    expect(autoLevels(new Uint32Array(256), 0.5)).toEqual({ lo: 0, hi: 255 });
  });

  it('clips harder with a larger percentage', () => {
    const gentle = autoLevels(uniformHistogram(100, 155), 4);
    const aggressive = autoLevels(uniformHistogram(100, 155), 0.5);
    expect(gentle.lo).toBeGreaterThanOrEqual(aggressive.lo);
    expect(gentle.hi).toBeLessThanOrEqual(aggressive.hi);
  });
});

describe('buildLut', () => {
  it('is the identity for no enhancement', () => {
    const lut = buildLut('none', { lo: 20, hi: 200 });
    for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(i);
  });

  it('stretches black and white points to the full range', () => {
    const lut = buildLut('gray', { lo: 10, hi: 100 });
    expect(lut[10]).toBe(0);
    expect(lut[100]).toBe(255);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    // Midpoint maps to roughly the middle of the range.
    expect(lut[55]).toBeGreaterThan(120);
    expect(lut[55]).toBeLessThan(136);
  });

  it('refuses to amplify a nearly flat image beyond the stretch cap', () => {
    // A dim shot of a page spanning only 30 levels would otherwise be stretched
    // 8x, turning sensor noise into speckle and growing the JPEG.
    const lut = buildLut('gray', { lo: 100, hi: 130 });

    expect(lut[100] as number).toBeGreaterThan(0);
    expect(lut[130] as number).toBeLessThan(255);

    const outputRange = (lut[130] as number) - (lut[100] as number);
    const stretch = outputRange / 30;
    expect(stretch).toBeLessThanOrEqual(MAX_STRETCH + 0.01);
    // ...but it is still a real improvement over doing nothing.
    expect(stretch).toBeGreaterThan(1.5);
  });

  it('keeps the detected midpoint when capping the stretch', () => {
    const lut = buildLut('gray', { lo: 100, hi: 130 });
    // The middle of the detected range should map to about mid grey.
    expect(lut[115] as number).toBeGreaterThan(115);
    expect(lut[115] as number).toBeLessThan(150);
  });

  it('does not cap a normal dim-light page', () => {
    // Span of 120 is the common real case and must be fully stretched.
    const lut = buildLut('gray', { lo: 60, hi: 180 });
    expect(lut[60]).toBe(0);
    expect(lut[180]).toBe(255);
  });

  it('stays monotonic and gentler for the soft mode', () => {
    const lut = buildLut('gray-soft', { lo: 20, hi: 220 });
    for (let i = 1; i < 256; i += 1) {
      expect(lut[i] as number).toBeGreaterThanOrEqual(lut[i - 1] as number);
      expect(lut[i] as number).toBeLessThanOrEqual(255);
    }

    // 'gray' crushes the black point to pure black; the soft mode keeps some
    // tone so a photo still looks like a photo.
    const hard = buildLut('gray', { lo: 20, hi: 220 });
    expect(hard[20]).toBe(0);
    expect(lut[20] as number).toBeGreaterThan(0);
    expect(lut[60] as number).toBeGreaterThan(hard[60] as number);
  });
});

describe('applyLut', () => {
  it('maps every channel through the LUT when not greyscaling', () => {
    const data = pixels([[10, 20, 30]]);
    const lut = buildLut('none', { lo: 0, hi: 255 });
    lut[10] = 11;
    lut[20] = 22;
    lut[30] = 33;
    applyLut(data, lut, false);
    expect([data[0], data[1], data[2]]).toEqual([11, 22, 33]);
  });

  it('produces equal channels when greyscaling', () => {
    const data = pixels([
      [255, 0, 0],
      [0, 128, 200],
    ]);
    const lut = buildLut('none', { lo: 0, hi: 255 });
    applyLut(data, lut, true);

    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
    expect(data[4]).toBe(data[5]);
    expect(data[5]).toBe(data[6]);
  });

  it('leaves alpha untouched', () => {
    const data = pixels([[200, 200, 200]]);
    const lut = buildLut('gray', { lo: 100, hi: 200 });
    applyLut(data, lut, true);
    expect(data[3]).toBe(255);
  });

  it('darkens the black point of a washed-out photo', () => {
    // A grey-ish "dark" area at 90 should end up near black after levelling.
    const data = pixels([[90, 90, 90]]);
    const lut = buildLut('gray', { lo: 90, hi: 240 });
    applyLut(data, lut, true);
    expect(data[0]).toBe(0);
  });
});

describe('lutForPixels', () => {
  it('returns an identity LUT when enhancement is off', () => {
    const lut = lutForPixels('none', pixels([[10, 20, 30]]));
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(128);
    expect(lut[255]).toBe(255);
  });

  it('anchors the LUT on the pixels actually present', () => {
    // A smooth gradient from 40 to 238, like a photo of a page on a desk.
    const data = pixels(
      Array.from({ length: 100 }, (_, index) => {
        const value = 40 + index * 2;
        return [value, value, value] as [number, number, number];
      }),
    );
    const lut = lutForPixels('gray', data);

    // The darkest and brightest values present end up at the ends of the range.
    expect(lut[40]).toBe(0);
    expect(lut[238]).toBe(255);
    // And the expansion is roughly linear in between.
    expect(lut[139] as number).toBeGreaterThan(100);
    expect(lut[139] as number).toBeLessThan(160);
  });
});

describe('helpers', () => {
  it('reports which modes grey the output', () => {
    expect(isGrayscale('none')).toBe(false);
    expect(isGrayscale('gray')).toBe(true);
    expect(isGrayscale('gray-soft')).toBe(true);
  });

  it('offers a CSS approximation for previews', () => {
    expect(previewFilter('none')).toBe('none');
    expect(previewFilter('gray')).toContain('grayscale');
    expect(previewFilter('gray-soft')).toContain('grayscale');
  });
});
