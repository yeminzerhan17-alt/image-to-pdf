/**
 * Pure page-ordering operations.
 *
 * Order is implicit: it is the array position of each page. Every function here
 * returns a NEW array so the undo stack can hold previous versions by reference.
 */

import type { Page } from '../types';

export interface Identified {
  id: string;
}

/**
 * Move the item at `from` so it ends up at index `to` of the result.
 * `to` is interpreted against the array AFTER the item has been removed.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items.slice();
  const clampedTo = Math.max(0, Math.min(items.length - 1, to));
  const next = items.slice();
  const [item] = next.splice(from, 1) as [T];
  next.splice(clampedTo, 0, item);
  return next;
}

/** Move the item at `from` to sit immediately before `targetIndex`. */
export function moveBefore<T>(items: readonly T[], from: number, targetIndex: number): T[] {
  if (from === targetIndex || from === targetIndex - 1) return items.slice();
  return moveItem(items, from, from < targetIndex ? targetIndex - 1 : targetIndex);
}

/** Move the item at `from` to sit immediately after `targetIndex`. */
export function moveAfter<T>(items: readonly T[], from: number, targetIndex: number): T[] {
  if (from === targetIndex || from === targetIndex + 1) return items.slice();
  return moveItem(items, from, from < targetIndex ? targetIndex : targetIndex + 1);
}

export function moveToFront<T>(items: readonly T[], from: number): T[] {
  return moveItem(items, from, 0);
}

export function moveToEnd<T>(items: readonly T[], from: number): T[] {
  return moveItem(items, from, items.length - 1);
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

export function reverse<T>(items: readonly T[]): T[] {
  return items.slice().reverse();
}

/**
 * Move a whole selection so it sits before/after the anchor. The anchor is
 * never part of the selection - a group cannot be dropped onto itself.
 */
export function moveGroup<T extends Identified>(
  items: readonly T[],
  ids: ReadonlySet<string>,
  anchorId: string,
  position: 'before' | 'after',
): T[] {
  if (ids.size === 0 || ids.has(anchorId)) return items.slice();
  const moving = items.filter((item) => ids.has(item.id));
  if (moving.length === 0) return items.slice();
  const rest = items.filter((item) => !ids.has(item.id));
  const anchorIndex = rest.findIndex((item) => item.id === anchorId);
  if (anchorIndex === -1) return items.slice();
  const insertAt = position === 'after' ? anchorIndex + 1 : anchorIndex;
  return [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
}

/**
 * Order by EXIF capture time. Photos are usually already in shooting order, so
 * this makes the correct order the default and manual reordering the exception.
 * Pages without a timestamp keep their relative order and go last.
 */
export function sortByTime<T extends { takenAt: number | null }>(items: readonly T[]): T[] {
  const timed = items.filter((item) => item.takenAt !== null);
  const untimed = items.filter((item) => item.takenAt === null);
  timed.sort((a, b) => (a.takenAt as number) - (b.takenAt as number));
  return [...timed, ...untimed];
}

export function hasAnyTimestamp(items: readonly { takenAt: number | null }[]): boolean {
  return items.some((item) => item.takenAt !== null);
}

/** Send the whole selection to the start or the end, keeping its order. */
export function moveSelectionToEdge<T extends Identified>(
  items: readonly T[],
  ids: ReadonlySet<string>,
  edge: 'start' | 'end',
): T[] {
  if (ids.size === 0) return items.slice();
  const selected = items.filter((item) => ids.has(item.id));
  const rest = items.filter((item) => !ids.has(item.id));
  if (selected.length === 0) return items.slice();
  return edge === 'start' ? [...selected, ...rest] : [...rest, ...selected];
}

/**
 * Move every selected page one position earlier or later.
 *
 * Each selected page steps over its nearest unselected neighbour, which gives
 * the behaviour you want from both shapes of selection:
 *   - a contiguous block [a,B,C,d] moves as a unit, not folded onto itself;
 *   - a scattered selection [A,b,c,D] moves each part independently, rather than
 *     dragging the unselected pages caught between them along for the ride.
 * Scanning from the direction of travel is what makes the block case work.
 */
export function shiftSelection<T extends Identified>(
  items: readonly T[],
  ids: ReadonlySet<string>,
  delta: -1 | 1,
): T[] {
  if (ids.size === 0 || items.length < 2) return items.slice();

  const next = items.slice();
  let moved = false;

  if (delta < 0) {
    for (let i = 1; i < next.length; i += 1) {
      const current = next[i] as T;
      const previous = next[i - 1] as T;
      if (ids.has(current.id) && !ids.has(previous.id)) {
        next[i - 1] = current;
        next[i] = previous;
        moved = true;
      }
    }
  } else {
    for (let i = next.length - 2; i >= 0; i -= 1) {
      const current = next[i] as T;
      const following = next[i + 1] as T;
      if (ids.has(current.id) && !ids.has(following.id)) {
        next[i + 1] = current;
        next[i] = following;
        moved = true;
      }
    }
  }

  return moved ? next : items.slice();
}

// ---------------------------------------------------------------------------
// Undo history
// ---------------------------------------------------------------------------

export interface History<T> {
  present: T;
  past: T[];
}

export function createHistory<T>(initial: T): History<T> {
  return { present: initial, past: [] };
}

/** Record a new state, keeping at most `depth` previous states. */
export function commit<T>(history: History<T>, next: T, depth: number): History<T> {
  const past = [...history.past, history.present];
  while (past.length > depth) past.shift();
  return { present: next, past };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const past = history.past.slice();
  const present = past.pop() as T;
  return { present, past };
}

/** Convenience wrapper used by the store: identity when nothing changed. */
export function commitPages(
  history: History<Page[]>,
  next: Page[],
  depth: number,
): History<Page[]> {
  if (next === history.present) return history;
  if (
    next.length === history.present.length &&
    next.every((page, index) => page === history.present[index])
  ) {
    return history;
  }
  return commit(history, next, depth);
}
