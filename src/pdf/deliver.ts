/**
 * Delivery.
 *
 * On iPhone the share sheet is the real delivery mechanism - Files, AirDrop,
 * Mail, Classroom - whereas a plain download lands in a Downloads folder
 * students struggle to find. So we prepare the Blob ahead of time and keep the
 * `share()` call inside the user gesture, with a download fallback.
 */

export type DeliveryResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File([new Uint8Array([1])], 'probe.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function download(blob: Blob, filename: string): DeliveryResult {
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Safari needs the URL to stay alive until the download has started.
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export async function deliverPdf(blob: Blob, filename: string): Promise<DeliveryResult> {
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Any other failure (NotAllowedError outside a gesture, etc.) still needs
      // to hand the user their file.
      return download(blob, filename);
    }
  }

  return download(blob, filename);
}
