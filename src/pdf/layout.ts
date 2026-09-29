/**
 * PDF page geometry. Pure maths, in PDF points (1pt = 1/72in).
 *
 * pdf-lib rotates an image about the (x, y) anchor we give it, so placing a
 * rotated image means solving for the anchor that puts the rotated bounds where
 * we want them. `computePlacement` does that and is unit tested.
 */

import type { FitId, MarginId, OrientationId, PaperId, Rotation } from '../types';

export const PAPER_SIZES: Record<PaperId, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
};

export const MARGINS: Record<MarginId, number> = {
  none: 0,
  narrow: 18, // 0.25in
  normal: 36, // 0.5in
};

export interface Placement {
  pageWidth: number;
  pageHeight: number;
  /** Anchor handed to pdf-lib's drawImage. */
  x: number;
  y: number;
  /** Unrotated drawn size; pdf-lib rotates these about (x, y). */
  width: number;
  height: number;
  rotation: Rotation;
}

export interface PlacementInput {
  imgWidth: number;
  imgHeight: number;
  rotation: Rotation;
  paper: PaperId;
  orientation: OrientationId;
  margin: MarginId;
  fit: FitId;
}

/** Size of the image's bounding box after rotation. */
export function rotatedSize(
  width: number,
  height: number,
  rotation: Rotation,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

export function pageOrientation(
  imgWidth: number,
  imgHeight: number,
  rotation: Rotation,
  orientation: OrientationId,
): 'portrait' | 'landscape' {
  if (orientation !== 'auto') return orientation;
  const box = rotatedSize(imgWidth, imgHeight, rotation);
  return box.width > box.height ? 'landscape' : 'portrait';
}

export function computePlacement(input: PlacementInput): Placement {
  const { imgWidth, imgHeight, rotation, paper, orientation, margin, fit } = input;

  const base = PAPER_SIZES[paper];
  const landscape = pageOrientation(imgWidth, imgHeight, rotation, orientation) === 'landscape';
  const pageWidth = landscape ? base.height : base.width;
  const pageHeight = landscape ? base.width : base.height;

  const box = rotatedSize(imgWidth, imgHeight, rotation);

  // 'fill' means bleed to the edges, so margins collapse to zero: the image
  // overflows the content box and PDF viewers clip it at the page boundary.
  const inset = fit === 'fill' ? 0 : MARGINS[margin];
  const boxWidth = Math.max(1, pageWidth - inset * 2);
  const boxHeight = Math.max(1, pageHeight - inset * 2);

  const scale =
    fit === 'fill'
      ? Math.max(boxWidth / box.width, boxHeight / box.height)
      : Math.min(boxWidth / box.width, boxHeight / box.height);

  const drawnWidth = imgWidth * scale;
  const drawnHeight = imgHeight * scale;

  // Centre the rotated bounds inside the box.
  const originX = inset + (boxWidth - box.width * scale) / 2;
  const originY = inset + (boxHeight - box.height * scale) / 2;

  // Invert the rotation about (x, y) to find the anchor.
  let x = originX;
  let y = originY;
  switch (rotation) {
    case 90:
      x = originX + drawnHeight;
      y = originY;
      break;
    case 180:
      x = originX + drawnWidth;
      y = originY + drawnHeight;
      break;
    case 270:
      x = originX;
      y = originY + drawnWidth;
      break;
    default:
      break;
  }

  return { pageWidth, pageHeight, x, y, width: drawnWidth, height: drawnHeight, rotation };
}

export interface Bounds {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/**
 * The axis-aligned region a placement actually covers, undoing the rotation
 * about the anchor. Kept next to computePlacement so the two can be tested
 * against each other; a rotated page that lands outside its own page box is the
 * classic giveaway that the anchor maths is wrong.
 */
export function coveredBounds(placement: Placement): Bounds {
  const { x, y, width, height, rotation } = placement;
  switch (rotation) {
    case 90:
      return { left: x - height, right: x, bottom: y, top: y + width };
    case 180:
      return { left: x - width, right: x, bottom: y - height, top: y };
    case 270:
      return { left: x, right: x + height, bottom: y - width, top: y };
    default:
      return { left: x, right: x + width, bottom: y, top: y + height };
  }
}

/** Rough rendered DPI, shown to the user so "quality" means something real. */
export function effectiveDpi(placement: Placement, imgWidth: number): number {
  const drawnInches = placement.width / 72;
  if (drawnInches <= 0) return 0;
  return Math.round(imgWidth / drawnInches);
}
