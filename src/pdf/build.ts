/**
 * PDF assembly.
 *
 * pdf-lib is dynamically imported so its ~110KB gzip stays out of the entry
 * chunk; the app is fully usable before an export is ever started. `embedJpg`
 * stores our JPEG bytes verbatim behind a /DCTDecode filter, so there is no
 * third re-encode and no generation loss in this step.
 */

import type { Settings } from '../types';
import { computePlacement } from './layout';
import type { EncodedPage } from './serialize';

export interface BuiltPdf {
  blob: Blob;
  bytes: number;
  pageCount: number;
}

function toBlob(bytes: Uint8Array, type: string): Blob {
  // The cast only satisfies TS 5.7's ArrayBufferLike generic on typed arrays;
  // at runtime a Uint8Array is a perfectly valid BlobPart.
  return new Blob([bytes as unknown as BlobPart], { type });
}

export async function buildPdf(
  encoded: readonly EncodedPage[],
  settings: Settings,
): Promise<BuiltPdf> {
  const { PDFDocument, degrees } = await import('pdf-lib');

  const doc = await PDFDocument.create();
  doc.setProducer('Image to PDF');
  doc.setCreator('Image to PDF');
  doc.setCreationDate(new Date());

  for (const page of encoded) {
    const image = await doc.embedJpg(page.bytes);
    const placement = computePlacement({
      imgWidth: page.width,
      imgHeight: page.height,
      rotation: page.rotation,
      paper: settings.paper,
      orientation: settings.orientation,
      margin: settings.margin,
      fit: settings.fit,
    });

    const pdfPage = doc.addPage([placement.pageWidth, placement.pageHeight]);
    pdfPage.drawImage(image, {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotate: degrees(placement.rotation),
    });
  }

  const bytes = await doc.save();
  return { blob: toBlob(bytes, 'application/pdf'), bytes: bytes.byteLength, pageCount: encoded.length };
}
