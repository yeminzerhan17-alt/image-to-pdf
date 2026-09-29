/**
 * Development-only test hook.
 *
 * The pipeline cannot be driven from a terminal: picking files needs a real
 * file dialog, and the interesting parts (canvas decode, JPEG re-encode, the PDF
 * build, IndexedDB) only exist in a browser. This exposes a scripted entry point
 * so the whole path can be exercised on a real iPhone over LAN, and in the
 * preview browser, without tapping through the UI.
 *
 * Stripped from production builds by the `import.meta.env.DEV` guard.
 */

import { importFromFiles, prepareExport } from './app/actions';
import { clearAll, pages, prepared, settings, updateSettings } from './state/store';
import { clearSession } from './state/persistence';
import type { Page, Settings } from './types';

export interface DevState {
  pages: Array<{
    id: string;
    width: number;
    height: number;
    rotation: number;
    bytes: number;
    takenAt: number | null;
  }>;
  settings: typeof settings.value;
  totalBytes: number;
  prepared: null | { bytes: number; filename: string; pageCount: number; quality: number };
}

export interface DevHook {
  importFiles: (files: File[]) => Promise<void>;
  prepare: () => Promise<DevState['prepared']>;
  state: () => DevState;
  setSettings: (patch: Partial<Settings>) => DevState['settings'];
  clearPages: () => void;
  pdfHeader: () => Promise<string | null>;
  /** Raw bytes of the prepared PDF, for inspecting the embedded image streams. */
  pdfBytes: () => Promise<Uint8Array | null>;
  clearStorage: () => Promise<void>;
}

function snapshot(): DevState {
  const pageList: Page[] = pages.value;
  const ready = prepared.value;
  return {
    pages: pageList.map((page) => ({
      id: page.id,
      width: page.width,
      height: page.height,
      rotation: page.rotation,
      bytes: page.bytes,
      takenAt: page.takenAt,
    })),
    settings: settings.value,
    totalBytes: pageList.reduce((sum, page) => sum + page.bytes, 0),
    prepared: ready
      ? {
          bytes: ready.bytes,
          filename: ready.filename,
          pageCount: ready.pageCount,
          quality: ready.quality,
        }
      : null,
  };
}

export function installDevHook(): void {
  const hook: DevHook = {
    importFiles: (files) => importFromFiles(files),
    prepare: async () => {
      await prepareExport();
      return snapshot().prepared;
    },
    state: snapshot,
    setSettings: (patch) => {
      updateSettings(patch);
      return settings.value;
    },
    clearPages: clearAll,
    pdfHeader: async () => {
      const ready = prepared.value;
      if (!ready) return null;
      const head = new Uint8Array(await ready.blob.slice(0, 8).arrayBuffer());
      return String.fromCharCode(...head);
    },
    pdfBytes: async () => {
      const ready = prepared.value;
      if (!ready) return null;
      return new Uint8Array(await ready.blob.arrayBuffer());
    },
    clearStorage: clearSession,
  };

  (window as unknown as { i2p: DevHook }).i2p = hook;
}
