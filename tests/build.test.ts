/**
 * PDF assembly round trip.
 *
 * The encoded page bytes are produced by the browser canvas in the real app, so
 * a committed JPEG fixture stands in for them here. What is actually under test
 * is the assembly: page count, page geometry, and that pdf-lib can re-read what
 * it just wrote.
 */

import { describe, expect, it } from 'vitest';

import { PDFDocument } from 'pdf-lib';

import { buildPdf } from '../src/pdf/build';
import type { EncodedPage } from '../src/pdf/serialize';
import { PAPER_SIZES } from '../src/pdf/layout';
import { DEFAULT_SETTINGS } from '../src/types';
import type { Rotation, Settings } from '../src/types';

// A real 1x1 baseline JPEG (JFIF, standard Huffman tables).
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
  'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
  'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
  'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA' +
  'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx' +
  'BhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK' +
  'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3' +
  'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii' +
  'gD//2Q==';

function jpegBytes(): Uint8Array {
  const binary = atob(TINY_JPEG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function page(width: number, height: number, rotation: Rotation = 0): EncodedPage {
  return { bytes: jpegBytes(), width, height, rotation };
}

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, paper: 'A4', orientation: 'auto', margin: 'narrow' };

describe('buildPdf', () => {
  it('produces a PDF that pdf-lib can read back', async () => {
    const result = await buildPdf([page(1654, 2339), page(2339, 1654), page(1654, 2339)], SETTINGS);

    expect(result.pageCount).toBe(3);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.blob.type).toBe('application/pdf');

    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(3);
  });

  it('gives portrait and landscape images the page they need', async () => {
    const result = await buildPdf([page(1000, 2000), page(2000, 1000)], SETTINGS);
    const reloaded = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));

    const portrait = reloaded.getPage(0).getSize();
    const landscape = reloaded.getPage(1).getSize();

    expect(portrait.width).toBeCloseTo(PAPER_SIZES.A4.width, 1);
    expect(portrait.height).toBeCloseTo(PAPER_SIZES.A4.height, 1);
    expect(landscape.width).toBeCloseTo(PAPER_SIZES.A4.height, 1);
    expect(landscape.height).toBeCloseTo(PAPER_SIZES.A4.width, 1);
  });

  it('follows a forced page orientation', async () => {
    const forced: Settings = { ...SETTINGS, orientation: 'landscape' };
    const result = await buildPdf([page(1000, 2000), page(1000, 2000)], forced);
    const reloaded = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));

    for (const index of [0, 1]) {
      const size = reloaded.getPage(index).getSize();
      expect(size.width).toBeCloseTo(PAPER_SIZES.A4.height, 1);
      expect(size.height).toBeCloseTo(PAPER_SIZES.A4.width, 1);
    }
  });

  it('rotates the page box for a quarter-turned image', async () => {
    // A portrait scan rotated 90 degrees is landscape on the page.
    const result = await buildPdf([page(1000, 2000, 90)], SETTINGS);
    const reloaded = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
    const size = reloaded.getPage(0).getSize();

    expect(size.width).toBeCloseTo(PAPER_SIZES.A4.height, 1);
    expect(size.height).toBeCloseTo(PAPER_SIZES.A4.width, 1);
  });

  it('honours the paper size', async () => {
    const letter: Settings = { ...SETTINGS, paper: 'Letter' };
    const result = await buildPdf([page(1000, 2000)], letter);
    const reloaded = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
    const size = reloaded.getPage(0).getSize();

    expect(size.width).toBeCloseTo(PAPER_SIZES.Letter.width, 1);
    expect(size.height).toBeCloseTo(PAPER_SIZES.Letter.height, 1);
  });

  it('stores the JPEG once per page without re-encoding it', async () => {
    const bytes = jpegBytes();
    const result = await buildPdf(
      [
        { bytes, width: 1000, height: 2000, rotation: 0 },
        { bytes, width: 1000, height: 2000, rotation: 0 },
      ],
      SETTINGS,
    );

    // Bytes are embedded verbatim behind /DCTDecode, so the file cannot be
    // smaller than the image data itself.
    expect(result.bytes).toBeGreaterThan(bytes.length * 2);
  });

  it('handles a single page and a long document', async () => {
    const single = await buildPdf([page(1000, 2000)], SETTINGS);
    expect(single.pageCount).toBe(1);

    const many = await buildPdf(
      Array.from({ length: 60 }, () => page(1000, 2000)),
      SETTINGS,
    );
    expect(many.pageCount).toBe(60);

    const reloaded = await PDFDocument.load(new Uint8Array(await many.blob.arrayBuffer()));
    expect(reloaded.getPageCount()).toBe(60);
  });
});
