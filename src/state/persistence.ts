/**
 * IndexedDB persistence via idb-keyval.
 *
 * Two things are stored:
 *  - the live session, restored automatically on load, so an iOS memory reload
 *    (or a pocketed phone) does not lose a 30-page scan;
 *  - a small number of named snapshots that can be restored later.
 *
 * Everything is wrapped: Safari throws on IDB access in some private-browsing
 * states, and iOS evicts site data after roughly 7 days of disuse. Neither is
 * allowed to break the app, it only surfaces a warning.
 */

import { del, get, set } from 'idb-keyval';

import type { Page, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const SESSION_KEY = 'i2p:session';
const SNAPSHOT_INDEX_KEY = 'i2p:snapshots';
const SNAPSHOT_KEY = (id: string) => `i2p:snapshot:${id}`;
const SCHEMA_VERSION = 1;
const MAX_SNAPSHOTS = 3;

export interface StoredDocument {
  schema: number;
  savedAt: number;
  pages: Page[];
  settings: Settings;
}

export interface SnapshotMeta {
  id: string;
  label: string;
  savedAt: number;
  pageCount: number;
  bytes: number;
}

function isUsablePage(value: unknown): value is Page {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<Page>;
  return (
    typeof page.id === 'string' &&
    page.blob instanceof Blob &&
    typeof page.width === 'number' &&
    typeof page.height === 'number'
  );
}

/** Drop anything that no longer matches the shape we expect. */
function revivePages(value: unknown): Page[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isUsablePage).map((page) => ({
    ...page,
    rotation: (page.rotation === 90 || page.rotation === 180 || page.rotation === 270 ? page.rotation : 0) as Page['rotation'],
    takenAt: typeof page.takenAt === 'number' ? page.takenAt : null,
    srcName: typeof page.srcName === 'string' ? page.srcName : 'image',
    bytes: typeof page.bytes === 'number' ? page.bytes : page.blob.size,
  }));
}

function reviveSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(value as Partial<Settings>) };
}

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function saveSession(pages: Page[], settings: Settings): Promise<boolean> {
  if (!isStorageAvailable()) return false;
  try {
    const document: StoredDocument = {
      schema: SCHEMA_VERSION,
      savedAt: Date.now(),
      pages,
      settings,
    };
    await set(SESSION_KEY, document);
    return true;
  } catch {
    return false;
  }
}

export async function loadSession(): Promise<{ pages: Page[]; settings: Settings } | null> {
  if (!isStorageAvailable()) return null;
  try {
    const stored = (await get(SESSION_KEY)) as StoredDocument | undefined;
    if (!stored || typeof stored !== 'object') return null;
    const pages = revivePages(stored.pages);
    if (pages.length === 0) return null;
    return { pages, settings: reviveSettings(stored.settings) };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  if (!isStorageAvailable()) return;
  try {
    // Only the live session: wiping the whole store here would take the user's
    // snapshots with it.
    await del(SESSION_KEY);
  } catch {
    /* nothing else we can do */
  }
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  if (!isStorageAvailable()) return [];
  try {
    const index = (await get(SNAPSHOT_INDEX_KEY)) as SnapshotMeta[] | undefined;
    if (!Array.isArray(index)) return [];
    return index;
  } catch {
    return [];
  }
}

export async function saveSnapshot(
  label: string,
  pages: Page[],
  settings: Settings,
): Promise<{ meta: SnapshotMeta | null; removed: SnapshotMeta[] }> {
  if (!isStorageAvailable() || pages.length === 0) return { meta: null, removed: [] };
  try {
    const id = `s_${Date.now().toString(36)}`;
    const document: StoredDocument = {
      schema: SCHEMA_VERSION,
      savedAt: Date.now(),
      pages,
      settings,
    };
    await set(SNAPSHOT_KEY(id), document);

    const meta: SnapshotMeta = {
      id,
      label: label || 'Untitled',
      savedAt: document.savedAt,
      pageCount: pages.length,
      bytes: pages.reduce((sum, page) => sum + page.bytes, 0),
    };

    const index = [...(await listSnapshots()), meta].sort((a, b) => b.savedAt - a.savedAt);
    const kept = index.slice(0, MAX_SNAPSHOTS);
    const removed = index.slice(MAX_SNAPSHOTS);

    await set(SNAPSHOT_INDEX_KEY, kept);
    for (const entry of removed) {
      try {
        await del(SNAPSHOT_KEY(entry.id));
      } catch {
        /* best effort */
      }
    }

    return { meta, removed };
  } catch {
    return { meta: null, removed: [] };
  }
}

export async function loadSnapshot(
  id: string,
): Promise<{ pages: Page[]; settings: Settings } | null> {
  if (!isStorageAvailable()) return null;
  try {
    const stored = (await get(SNAPSHOT_KEY(id))) as StoredDocument | undefined;
    if (!stored) return null;
    const pages = revivePages(stored.pages);
    if (pages.length === 0) return null;
    return { pages, settings: reviveSettings(stored.settings) };
  } catch {
    return null;
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  if (!isStorageAvailable()) return;
  try {
    await del(SNAPSHOT_KEY(id));
    const index = (await listSnapshots()).filter((entry) => entry.id !== id);
    await set(SNAPSHOT_INDEX_KEY, index);
  } catch {
    /* best effort */
  }
}

/** Coarse estimate of what the current document costs in storage. */
export async function estimateUsage(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { usage } = await navigator.storage.estimate();
    return usage ?? null;
  } catch {
    return null;
  }
}
