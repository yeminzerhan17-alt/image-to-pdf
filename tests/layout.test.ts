import { describe, expect, it } from 'vitest';

import {
  MARGINS,
  PAPER_SIZES,
  computePlacement,
  coveredBounds,
  effectiveDpi,
  pageOrientation,
  rotatedSize,
} from '../src/pdf/layout';
import type { PlacementInput } from '../src/pdf/layout';
import type { Rotation } from '../src/types';

const BASE: PlacementInput = {
  imgWidth: 1000,
  imgHeight: 2000,
  rotation: 0,
  paper: 'A4',
  orientation: 'auto',
  margin: 'narrow',
  fit: 'fit',
};

const A4 = PAPER_SIZES.A4;

describe('rotatedSize', () => {
  it('swaps the box for quarter turns only', () => {
    expect(rotatedSize(10, 20, 0)).toEqual({ width: 10, height: 20 });
    expect(rotatedSize(10, 20, 90)).toEqual({ width: 20, height: 10 });
    expect(rotatedSize(10, 20, 180)).toEqual({ width: 10, height: 20 });
    expect(rotatedSize(10, 20, 270)).toEqual({ width: 20, height: 10 });
  });
});

describe('pageOrientation', () => {
  it('follows the image when set to auto, including after rotation', () => {
    expect(pageOrientation(1000, 2000, 0, 'auto')).toBe('portrait');
    expect(pageOrientation(2000, 1000, 0, 'auto')).toBe('landscape');
    // A portrait scan turned on its side needs a landscape page.
    expect(pageOrientation(1000, 2000, 90, 'auto')).toBe('landscape');
  });

  it('honours a forced orientation', () => {
    expect(pageOrientation(2000, 1000, 0, 'portrait')).toBe('portrait');
    expect(pageOrientation(1000, 2000, 0, 'landscape')).toBe('landscape');
  });
});

describe('computePlacement', () => {
  it('centres an unrotated image inside the margins', () => {
    // Independent expectation: 100x200 fitted into A4 minus 18pt margins.
    const placement = computePlacement({
      ...BASE,
      imgWidth: 100,
      imgHeight: 200,
      margin: 'none',
      orientation: 'portrait',
    });

    expect(placement.pageWidth).toBeCloseTo(A4.width, 6);
    expect(placement.pageHeight).toBeCloseTo(A4.height, 6);
    expect(placement.rotation).toBe(0);

    const scale = A4.height / 200; // height-limited
    expect(placement.height).toBeCloseTo(200 * scale, 6);
    expect(placement.width).toBeCloseTo(100 * scale, 6);

    const bounds = coveredBounds(placement);
    expect(bounds.left).toBeCloseTo((A4.width - 100 * scale) / 2, 6);
    expect(bounds.right).toBeCloseTo(A4.width - (A4.width - 100 * scale) / 2, 6);
    expect(bounds.bottom).toBeCloseTo(0, 6);
    expect(bounds.top).toBeCloseTo(A4.height, 6);
  });

  it('uses a landscape page for a landscape image', () => {
    const placement = computePlacement({ ...BASE, imgWidth: 2000, imgHeight: 1000 });
    expect(placement.pageWidth).toBeCloseTo(A4.height, 6);
    expect(placement.pageHeight).toBeCloseTo(A4.width, 6);
  });

  it('keeps a 90 degree rotation inside the page box', () => {
    // 100x200 on a forced-portrait page fits by width once rotated, so the
    // rotated bounds should span the full page width and sit centred.
    const placement = computePlacement({
      ...BASE,
      imgWidth: 100,
      imgHeight: 200,
      rotation: 90,
      margin: 'none',
      orientation: 'portrait',
    });

    const bounds = coveredBounds(placement);
    const scale = A4.width / 200;

    expect(bounds.left).toBeCloseTo(0, 6);
    expect(bounds.right).toBeCloseTo(A4.width, 6);
    expect(bounds.bottom).toBeCloseTo((A4.height - 100 * scale) / 2, 6);
    expect(bounds.top).toBeCloseTo(A4.height - (A4.height - 100 * scale) / 2, 6);
  });

  it('places every rotation inside its own page', () => {
    const rotations: Rotation[] = [0, 90, 180, 270];

    for (const rotation of rotations) {
      for (const fit of ['fit', 'fill'] as const) {
        const placement = computePlacement({ ...BASE, rotation, fit });
        const bounds = coveredBounds(placement);

        if (fit === 'fit') {
          // Fit must never leave the page, in any rotation.
          expect(bounds.left).toBeGreaterThanOrEqual(-1e-6);
          expect(bounds.bottom).toBeGreaterThanOrEqual(-1e-6);
          expect(bounds.right).toBeLessThanOrEqual(placement.pageWidth + 1e-6);
          expect(bounds.top).toBeLessThanOrEqual(placement.pageHeight + 1e-6);
        }

        // The rotated bounds must always describe the image's true aspect.
        const width = bounds.right - bounds.left;
        const height = bounds.top - bounds.bottom;
        const expected = rotatedSize(1000, 2000, rotation);
        expect(width / height).toBeCloseTo(expected.width / expected.height, 6);
      }
    }
  });

  it('fills the page edge to edge when asked to fill', () => {
    const placement = computePlacement({ ...BASE, fit: 'fill', margin: 'normal' });
    const bounds = coveredBounds(placement);

    // 'fill' ignores margins and overflows, so viewers crop it at the page box.
    expect(bounds.left).toBeLessThanOrEqual(0);
    expect(bounds.right).toBeGreaterThanOrEqual(placement.pageWidth);
    expect(bounds.bottom).toBeLessThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(placement.pageHeight);
  });

  it('respects the margin setting', () => {
    for (const margin of ['none', 'narrow', 'normal'] as const) {
      const placement = computePlacement({ ...BASE, margin, fit: 'fit' });
      const bounds = coveredBounds(placement);
      const inset = MARGINS[margin];

      // At least one axis is limited by the content box.
      const limited =
        Math.abs(bounds.left - inset) < 1e-6 || Math.abs(bounds.bottom - inset) < 1e-6;
      expect(limited || margin === 'none').toBe(true);
      expect(bounds.left).toBeGreaterThanOrEqual(inset - 1e-6);
      expect(bounds.right).toBeLessThanOrEqual(placement.pageWidth - inset + 1e-6);
    }
  });

  it('never upscales past the box for tiny images but does scale them up to fit', () => {
    const placement = computePlacement({ ...BASE, imgWidth: 4, imgHeight: 4, margin: 'none' });
    const bounds = coveredBounds(placement);
    // A 4px image fills the page width; the PDF is resolution independent.
    expect(bounds.right - bounds.left).toBeCloseTo(A4.width, 6);
  });
});

describe('effectiveDpi', () => {
  it('reports a sensible print resolution for a real 2200px scan', () => {
    const placement = computePlacement({ ...BASE, imgWidth: 1654, imgHeight: 2339 });
    const dpi = effectiveDpi(placement, 1654);
    expect(dpi).toBeGreaterThan(150);
    expect(dpi).toBeLessThan(400);
  });
});
