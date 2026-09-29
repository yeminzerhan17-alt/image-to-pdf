/**
 * App actions. Kept out of the components so the UI stays presentational and
 * the async orchestration is readable in one place.
 */

import { signal } from '@preact/signals';

import { hasAnyTimestamp, sortByTime } from '../edit/order';
import { importFiles } from '../import/pipeline';
import { deliverPdf } from '../pdf/deliver';
import { preparePdf } from '../pdf/export';
import { formatBytes } from '../pdf/quality';
import {
  loadSnapshot,
  saveSnapshot,
  listSnapshots,
} from '../state/persistence';
import type { SnapshotMeta } from '../state/persistence';
import {
  addPages,
  busy,
  flash,
  pages,
  prepared,
  replaceDocument,
  settings,
  storageWarning,
} from '../state/store';

export const importWarnings = signal<string[]>([]);
export const snapshots = signal<SnapshotMeta[]>([]);

export async function importFromFiles(files: readonly File[]): Promise<void> {
  if (files.length === 0 || busy.value) return;

  importWarnings.value = [];
  busy.value = { kind: 'import', label: 'Adding photos', done: 0, total: files.length };

  try {
    const result = await importFiles(files, {
      existingCount: pages.value.length,
      onProgress: (progress) => {
        busy.value = {
          kind: 'import',
          label: 'Adding photos',
          done: progress.done,
          total: progress.total,
        };
      },
    });

    if (result.pages.length > 0) {
      // Photos are usually already in shooting order, so sorting the incoming
      // batch by capture time is the right default. Pages without a timestamp
      // keep their relative order and land at the end. Existing pages are never
      // reordered by an import - that stays an explicit action.
      const incoming = hasAnyTimestamp(result.pages) ? sortByTime(result.pages) : result.pages;
      addPages(incoming);
      flash(`Added ${incoming.length} page${incoming.length === 1 ? '' : 's'}`);
    }

    importWarnings.value = result.warnings;
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Import failed');
  } finally {
    busy.value = null;
  }
}

/**
 * Build the PDF and park it. The Blob is created here, ahead of the tap, so the
 * later share() call runs synchronously inside the user gesture - iOS is
 * unreliable about share() after an await.
 */
export async function prepareExport(): Promise<void> {
  const pageList = pages.value;
  if (pageList.length === 0 || busy.value) return;

  busy.value = { kind: 'export', label: 'Preparing pages', done: 0, total: pageList.length };

  try {
    const result = await preparePdf({
      pages: pageList,
      settings: settings.value,
      onProgress: (progress) => {
        busy.value = {
          kind: 'export',
          label: progress.phase === 'encode' ? 'Preparing pages' : 'Assembling PDF',
          done: progress.done,
          total: progress.total,
        };
      },
    });

    prepared.value = result;

    const target = settings.value.maxBytes;
    const adjusted = target !== null && result.quality < settings.value.quality;

    if (target !== null && result.bytes > target) {
      // The floor was reached and it still does not fit. Saying nothing here
      // would be the worst outcome: the student only finds out when the portal
      // rejects the upload.
      flash(
        `${formatBytes(result.bytes)} is still over your ${formatBytes(target)} limit. Quality is already at its lowest - remove pages or raise the limit.`,
        6000,
      );
    } else {
      flash(
        adjusted
          ? `PDF ready \u00b7 ${formatBytes(result.bytes)} (quality reduced to ${Math.round(result.quality * 100)}% to fit)`
          : `PDF ready \u00b7 ${formatBytes(result.bytes)}`,
      );
    }
  } catch (error) {
    flash(error instanceof Error ? error.message : 'Could not build the PDF');
  } finally {
    busy.value = null;
  }
}

export async function deliverPrepared(): Promise<void> {
  const current = prepared.value;
  if (!current) return;

  // No awaits before this call: it must stay inside the tap.
  const outcome = await deliverPdf(current.blob, current.filename);

  if (outcome === 'shared') flash('Shared');
  else if (outcome === 'downloaded') flash('Saved to Downloads');
  else if (outcome === 'failed') flash('Could not save the PDF');
}

export async function refreshSnapshots(): Promise<void> {
  snapshots.value = await listSnapshots();
}

export async function captureSnapshot(): Promise<void> {
  if (pages.value.length === 0) return;
  const current = settings.value;
  const label = `${current.subject || 'Scan'} · ${pages.value.length} pages`;
  const { meta, removed } = await saveSnapshot(label, pages.value, current);

  await refreshSnapshots();

  if (!meta) {
    storageWarning.value = 'Could not save a snapshot; storage may be full or blocked.';
    return;
  }
  flash(
    removed.length > 0
      ? `Saved snapshot (oldest removed to stay within ${removed.length + snapshots.value.length})`
      : 'Snapshot saved',
  );
}

export async function restoreSnapshot(id: string): Promise<void> {
  const restored = await loadSnapshot(id);
  if (!restored) {
    flash('Could not restore that snapshot');
    return;
  }
  replaceDocument(restored.pages, restored.settings);
  flash('Snapshot restored');
}
