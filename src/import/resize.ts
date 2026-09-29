/**
 * The ONE place pixels are touched.
 *
 * Everything - importing a 12MP HEIC and exporting a grayscale page - goes
 * through `renderToJpeg`. That keeps the memory rule enforceable in a single
 * spot: at most one decoded bitmap and one canvas are alive at a time, and both
 * are explicitly released before the next image is read.
 */

import { applyLut, isGrayscale, lutForPixels } from '../edit/enhance';
import type { EnhanceMode } from '../types';
import { loadImage } from './decode';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface RenderOptions {
  /** Cap the long edge, never upscaling. null keeps the original size. */
  maxEdge: number | null;
  /** JPEG quality, 0-1. */
  quality: number;
  enhance: EnhanceMode;
}

export interface RenderedImage {
  blob: Blob;
  width: number;
  height: number;
}

export function targetSize(
  width: number,
  height: number,
  maxEdge: number | null,
): { width: number; height: number } {
  if (!maxEdge || maxEdge <= 0) return { width, height };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: AnyCanvas): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable in this browser.');
  // The 2D APIs are identical across the two canvas types (WebKit however
  // ships quite different TS signatures), so normalise through a cast.
  return ctx as unknown as CanvasRenderingContext2D;
}

export function canvasToBlob(canvas: AnyCanvas, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed.'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Free the canvas backing store immediately rather than waiting for GC. */
export function disposeCanvas(canvas: AnyCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}

export async function renderToJpeg(blob: Blob, options: RenderOptions): Promise<RenderedImage> {
  const decoded = await loadImage(blob);
  let canvas: AnyCanvas | null = null;

  try {
    const size = targetSize(decoded.width, decoded.height, options.maxEdge);
    canvas = createCanvas(size.width, size.height);

    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, size.width, size.height);

    if (options.enhance !== 'none') {
      const imageData = ctx.getImageData(0, 0, size.width, size.height);
      const lut = lutForPixels(options.enhance, imageData.data);
      applyLut(imageData.data, lut, isGrayscale(options.enhance));
      ctx.putImageData(imageData, 0, 0);
    }

    const out = await canvasToBlob(canvas, options.quality);
    return { blob: out, width: size.width, height: size.height };
  } finally {
    decoded.release();
    if (canvas) disposeCanvas(canvas);
  }
}
