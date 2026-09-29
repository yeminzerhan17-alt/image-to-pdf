/**
 * Central store. Small enough to be one module, but everything that mutates
 * pages goes through `setPages` so the undo history and the prepared-PDF cache
 * can never drift out of sync.
 */

import { computed, signal } from '@preact/signals';

import { commitPages, createHistory, undo as undoHistory } from '../edit/order';
import type { History } from '../edit/order';
import { DEFAULT_SETTINGS, UNDO_DEPTH } from '../types';
import type { Page, Rotation, Settings } from '../types';

/** Normalise an arbitrary 90-degree rotation step back into 0|90|180|270. */
export function normalizeRotation(value: number): Rotation {
  const wrapped = ((value % 360) + 360) % 360;
  return wrapped as Rotation;
}

export interface PreparedPdf {
  blob: Blob;
  filename: string;
  bytes: number;
  pageCount: number;
  quality: number;
}

export interface BusyState {
  kind: 'import' | 'export';
  label: string;
  done: number;
  total: number;
}

export const history = signal<History<Page[]>>(createHistory<Page[]>([]));
export const pages = computed<Page[]>(() => history.value.present);
export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });

export const selectedId = signal<string | null>(null);
export const multiSelection = signal<ReadonlySet<string>>(new Set<string>());
export const selectMode = signal(false);

export const busy = signal<BusyState | null>(null);
export const message = signal<string | null>(null);
export const prepared = signal<PreparedPdf | null>(null);
export const restoredFromSession = signal(false);

export const storageWarning = signal<string | null>(null);

export const canUndo = computed(() => history.value.past.length > 0);
export const pageCount = computed(() => pages.value.length);
export const totalImportBytes = computed(() =>
  pages.value.reduce((sum, page) => sum + page.bytes, 0),
);

export function invalidatePrepared(): void {
  if (prepared.value !== null) prepared.value = null;
}

/** The single mutation entry point for the page list. */
export function setPages(next: Page[]): void {
  history.value = commitPages(history.value, next, UNDO_DEPTH);
  invalidatePrepared();
  if (multiSelection.value.size > 0) {
    const stillThere = new Set([...multiSelection.value].filter((id) => next.some((p) => p.id === id)));
    if (stillThere.size !== multiSelection.value.size) multiSelection.value = stillThere;
  }
}

export function addPages(added: readonly Page[]): void {
  if (added.length === 0) return;
  setPages([...pages.value, ...added]);
}

export function removePage(id: string): void {
  setPages(pages.value.filter((page) => page.id !== id));
  if (selectedId.value === id) selectedId.value = null;
}

export function rotateMany(ids: ReadonlySet<string>, step: number): void {
  if (ids.size === 0) return;
  setPages(
    pages.value.map((page) =>
      ids.has(page.id) ? { ...page, rotation: normalizeRotation(page.rotation + step * 90) } : page,
    ),
  );
}

export function rotatePage(id: string, step: number): void {
  rotateMany(new Set([id]), step);
}

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  invalidatePrepared();
}

export function undo(): void {
  history.value = undoHistory(history.value);
  invalidatePrepared();
}

export function clearAll(): void {
  setPages([]);
  selectedId.value = null;
  multiSelection.value = new Set();
  selectMode.value = false;
}

export function toggleSelection(id: string): void {
  const next = new Set(multiSelection.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  multiSelection.value = next;
}

export function setMultiSelection(ids: Iterable<string>): void {
  multiSelection.value = new Set(ids);
}

function later(fn: () => void, ms: number): void {
  setTimeout(fn, ms);
}

export function flash(text: string, ms = 2600): void {
  message.value = text;
  later(() => {
    if (message.value === text) message.value = null;
  }, ms);
}

/** Replace the whole document (session restore / snapshot load). */
export function replaceDocument(nextPages: Page[], nextSettings: Settings): void {
  history.value = createHistory(nextPages);
  settings.value = { ...nextSettings };
  selectedId.value = null;
  multiSelection.value = new Set();
  selectMode.value = false;
  invalidatePrepared();
}
