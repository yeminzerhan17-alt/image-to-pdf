/**
 * Shared domain types.
 *
 * Memory contract (the single most important rule in this app):
 * a `Page.blob` is ALWAYS an already-downscaled JPEG. Raw camera Files are
 * never retained, never embedded into the PDF, and never uploaded.
 */

export type PaperId = 'A4' | 'Letter';
export type MarginId = 'none' | 'narrow' | 'normal';
export type OrientationId = 'auto' | 'portrait' | 'landscape';
export type FitId = 'fit' | 'fill';
export type EnhanceMode = 'none' | 'gray' | 'gray-soft';
export type Rotation = 0 | 90 | 180 | 270;

export interface Page {
  id: string;
  /** Downscaled, un-enhanced JPEG. Enhance is applied at export time. */
  blob: Blob;
  /** Pixel size of the stored JPEG, before any `rotation` is applied. */
  width: number;
  height: number;
  rotation: Rotation;
  /** EXIF DateTimeOriginal in ms, or null when the file has no EXIF time. */
  takenAt: number | null;
  /** Original filename, kept for debugging only. */
  srcName: string;
  /** Byte length of `blob`, cached so progress can show weight without reading. */
  bytes: number;
}

export interface Settings {
  paper: PaperId;
  orientation: OrientationId;
  margin: MarginId;
  fit: FitId;
  enhance: EnhanceMode;
  /** JPEG quality used for the exported pages. */
  quality: number;
  /** When set, export shrinks quality until the PDF fits this many bytes. */
  maxBytes: number | null;
  /** Filename template, supports {subject} {date} {time} {count}. */
  nameTemplate: string;
  subject: string;
}

export const DEFAULT_SETTINGS: Settings = {
  paper: 'A4',
  orientation: 'auto',
  margin: 'narrow',
  fit: 'fit',
  enhance: 'none',
  quality: 0.82,
  maxBytes: 10 * 1024 * 1024,
  nameTemplate: '{subject}_{date}',
  subject: 'Scan',
};

/** Long edge cap for stored pages: ~3.9MP, i.e. about 200 DPI on A4. */
export const MAX_EDGE_PX = 2200;
/** Quality used for the stored master. Slightly above export quality so the
 *  second generation re-encode does not visibly degrade. */
export const STORE_QUALITY = 0.9;
export const MAX_PAGES = 60;
export const UNDO_DEPTH = 20;
