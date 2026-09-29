import { describe, expect, it } from 'vitest';

import {
  MAX_ATTEMPTS,
  QUALITY_FLOOR,
  encodeKey,
  formatBytes,
  isAtFloor,
  nextQuality,
  pdfOverheadBytes,
  sumBytes,
} from '../src/pdf/quality';

describe('sumBytes / pdfOverheadBytes', () => {
  it('totals the encoded page bytes', () => {
    expect(sumBytes([new Uint8Array(10), new Uint8Array(5)])).toBe(15);
    expect(sumBytes([])).toBe(0);
  });

  it('grows with the page count', () => {
    expect(pdfOverheadBytes(10)).toBeGreaterThan(pdfOverheadBytes(1));
    // Overhead must never dominate a modest document.
    expect(pdfOverheadBytes(30)).toBeLessThan(64 * 1024);
  });
});

describe('nextQuality', () => {
  const target = 10 * 1024 * 1024;

  it('leaves quality alone when the PDF already fits', () => {
    expect(nextQuality(0.82, target - 1, target)).toBe(0.82);
    expect(nextQuality(0.82, target, target)).toBe(0.82);
  });

  it('always steps strictly downwards when over target', () => {
    for (const ratio of [0.99, 0.9, 0.5, 0.1, 0.01]) {
      const next = nextQuality(0.85, target / ratio, target);
      expect(next).toBeLessThan(0.85);
      expect(next).toBeGreaterThanOrEqual(QUALITY_FLOOR);
    }
  });

  it('never falls below the floor', () => {
    expect(nextQuality(0.42, target * 1000, target)).toBe(QUALITY_FLOOR);
    expect(nextQuality(0.82, target, 0)).toBe(QUALITY_FLOOR);
  });

  it('converges to the floor in a bounded number of attempts', () => {
    let quality = 0.85;
    let attempts = 0;
    let size = target * 50;

    while (size > target && attempts < MAX_ATTEMPTS + 1) {
      const next = nextQuality(quality, size, target);
      if (next >= quality) break;
      quality = next;
      attempts += 1;
      // Model a plausible JPEG size curve: bytes fall with quality.
      size = target * 50 * (quality / 0.85) ** 1.4;
    }

    expect(attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
    expect(quality).toBeGreaterThanOrEqual(QUALITY_FLOOR);
  });

  it('shrinks further when the overshoot is larger', () => {
    const small = nextQuality(0.8, target * 1.2, target);
    const large = nextQuality(0.8, target * 4, target);
    expect(large).toBeLessThan(small);
  });

  it('is idempotent once the target is met', () => {
    const settled = nextQuality(0.6, target / 2, target);
    expect(nextQuality(settled, target / 2, target)).toBe(settled);
  });
});

describe('isAtFloor', () => {
  it('recognises the floor including float noise', () => {
    expect(isAtFloor(QUALITY_FLOOR)).toBe(true);
    expect(isAtFloor(QUALITY_FLOOR + 1e-9)).toBe(true);
    expect(isAtFloor(0.5)).toBe(false);
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');
    expect(formatBytes(Number.NaN)).toBe('--');
  });
});

describe('encodeKey', () => {
  it('distinguishes every setting that changes the encoded bytes', () => {
    expect(encodeKey('p1', 0.8, 'none')).not.toBe(encodeKey('p1', 0.7, 'none'));
    expect(encodeKey('p1', 0.8, 'none')).not.toBe(encodeKey('p1', 0.8, 'gray'));
    expect(encodeKey('p1', 0.8, 'none')).not.toBe(encodeKey('p2', 0.8, 'none'));
    expect(encodeKey('p1', 0.8, 'none')).toBe(encodeKey('p1', 0.8, 'none'));
  });
});
