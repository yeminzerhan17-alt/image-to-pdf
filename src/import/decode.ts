/**
 * Image decoding.
 *
 * We deliberately use an <img> element as the single decode path rather than
 * createImageBitmap(). Two reasons:
 *
 *  1. Browsers apply EXIF orientation to <img> by default, and drawImage()
 *     respects that. createImageBitmap's `imageOrientation` default has varied
 *     between engines, which is exactly how you end up with sideways pages.
 *  2. WebKit decodes HEIC natively for <img>, which is what makes iPhone
 *     photos (HEIC by default) work at all. Any path that hands raw bytes
 *     straight to the PDF encoder breaks for most users.
 */

export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

export class UnsupportedImageError extends Error {
  constructor(name: string) {
    super(`Could not decode ${name}. On older browsers HEIC photos may need converting to JPEG first.`);
    this.name = 'UnsupportedImageError';
  }
}

export async function loadImage(blob: Blob, name = 'this image'): Promise<DecodedImage> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  // Keep the element out of layout; it is never appended to the document.
  image.src = url;

  const release = () => {
    URL.revokeObjectURL(url);
    image.removeAttribute('src');
  };

  try {
    if (typeof image.decode === 'function') {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('decode failed'));
      });
    }
  } catch {
    release();
    throw new UnsupportedImageError(name);
  }

  if (!image.naturalWidth || !image.naturalHeight) {
    release();
    throw new UnsupportedImageError(name);
  }

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release,
  };
}
