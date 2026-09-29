import { describe, expect, it } from 'vitest';

import {
  canUndo,
  commit,
  commitPages,
  createHistory,
  hasAnyTimestamp,
  moveAfter,
  moveBefore,
  moveGroup,
  moveItem,
  moveSelectionToEdge,
  moveToEnd,
  moveToFront,
  removeAt,
  reverse,
  shiftSelection,
  sortByTime,
  undo,
} from '../src/edit/order';
import type { Page } from '../src/types';

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

const a = { id: 'a' };
const b = { id: 'b' };
const c = { id: 'c' };
const d = { id: 'd' };
const e = { id: 'e' };

describe('moveItem', () => {
  it('moves an item to an exact final index', () => {
    expect(ids(moveItem([a, b, c], 0, 2))).toEqual(['b', 'c', 'a']);
    expect(ids(moveItem([a, b, c], 2, 0))).toEqual(['c', 'a', 'b']);
    expect(ids(moveItem([a, b, c], 1, 1))).toEqual(['a', 'b', 'c']);
  });

  it('clamps out-of-range destinations instead of throwing', () => {
    expect(ids(moveItem([a, b, c], 0, 99))).toEqual(['b', 'c', 'a']);
    expect(ids(moveItem([a, b], 5, 0))).toEqual(['a', 'b']);
  });

  it('returns a new array so the undo stack keeps the old one', () => {
    const original = [a, b, c];
    const next = moveItem(original, 0, 2);
    expect(next).not.toBe(original);
    expect(ids(original)).toEqual(['a', 'b', 'c']);
  });
});

describe('moveBefore / moveAfter', () => {
  it('inserts relative to the target on both sides of it', () => {
    expect(ids(moveBefore([a, b, c], 0, 2))).toEqual(['b', 'a', 'c']);
    expect(ids(moveBefore([a, b, c], 2, 0))).toEqual(['c', 'a', 'b']);
    expect(ids(moveAfter([a, b, c], 0, 2))).toEqual(['b', 'c', 'a']);
    expect(ids(moveAfter([a, b, c], 2, 0))).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op when the item is already adjacent', () => {
    expect(ids(moveBefore([a, b, c], 0, 1))).toEqual(['a', 'b', 'c']);
    expect(ids(moveAfter([a, b, c], 1, 0))).toEqual(['a', 'b', 'c']);
    expect(ids(moveBefore([a, b, c], 1, 1))).toEqual(['a', 'b', 'c']);
  });
});

describe('moveToFront / moveToEnd / removeAt / reverse', () => {
  it('handles the ends', () => {
    expect(ids(moveToFront([a, b, c], 2))).toEqual(['c', 'a', 'b']);
    expect(ids(moveToEnd([a, b, c], 0))).toEqual(['b', 'c', 'a']);
    expect(ids(removeAt([a, b, c], 1))).toEqual(['a', 'c']);
    expect(ids(reverse([a, b, c]))).toEqual(['c', 'b', 'a']);
  });
});

describe('moveGroup', () => {
  it('moves a multi-selection as one block', () => {
    const selection = new Set(['b', 'c']);
    expect(ids(moveGroup([a, b, c, d, e], selection, 'e', 'before'))).toEqual([
      'a',
      'd',
      'b',
      'c',
      'e',
    ]);
    expect(ids(moveGroup([a, b, c, d, e], selection, 'a', 'after'))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(ids(moveGroup([a, b, c, d, e], selection, 'e', 'after'))).toEqual([
      'a',
      'd',
      'e',
      'b',
      'c',
    ]);
  });

  it('behaves like moveBefore/moveAfter for a single page', () => {
    const one = new Set(['a']);
    expect(ids(moveGroup([a, b, c], one, 'c', 'before'))).toEqual(['b', 'a', 'c']);
    expect(ids(moveGroup([a, b, c], one, 'c', 'after'))).toEqual(['b', 'c', 'a']);
  });

  it('refuses to drop a group onto itself', () => {
    const selection = new Set(['a', 'b']);
    expect(ids(moveGroup([a, b, c], selection, 'a', 'before'))).toEqual(['a', 'b', 'c']);
    expect(ids(moveGroup([a, b, c], new Set<string>(), 'a', 'before'))).toEqual(['a', 'b', 'c']);
  });
});

describe('moveSelectionToEdge / shiftSelection', () => {
  it('sends a selection to the start or the end', () => {
    const selection = new Set(['b', 'd']);
    expect(ids(moveSelectionToEdge([a, b, c, d, e], selection, 'start'))).toEqual([
      'b',
      'd',
      'a',
      'c',
      'e',
    ]);
    expect(ids(moveSelectionToEdge([a, b, c, d, e], selection, 'end'))).toEqual([
      'a',
      'c',
      'e',
      'b',
      'd',
    ]);
  });

  it('shifts a single page by one', () => {
    expect(ids(shiftSelection([a, b, c, d], new Set(['b']), -1))).toEqual(['b', 'a', 'c', 'd']);
    expect(ids(shiftSelection([a, b, c, d], new Set(['b']), 1))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('shifts a contiguous block by one without splitting it', () => {
    const selection = new Set(['b', 'c']);
    expect(ids(shiftSelection([a, b, c, d, e], selection, -1))).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(ids(shiftSelection([a, b, c, d, e], selection, 1))).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('refuses to shift past the ends', () => {
    expect(ids(shiftSelection([a, b, c], new Set(['a']), -1))).toEqual(['a', 'b', 'c']);
    expect(ids(shiftSelection([a, b, c], new Set(['c']), 1))).toEqual(['a', 'b', 'c']);
    expect(ids(shiftSelection([a, b, c], new Set(['a', 'b']), -1))).toEqual(['a', 'b', 'c']);
  });

  it('steps each part of a scattered selection independently', () => {
    // Selecting a and d must not drag b and c along with them.
    expect(ids(shiftSelection([a, b, c, d, e], new Set(['a', 'd']), 1))).toEqual([
      'b',
      'a',
      'c',
      'e',
      'd',
    ]);
    expect(ids(shiftSelection([a, b, c, d, e], new Set(['a', 'd']), -1))).toEqual([
      'a',
      'b',
      'd',
      'c',
      'e',
    ]);
  });
});

describe('sortByTime', () => {
  const page = (id: string, takenAt: number | null) => ({ id, takenAt });

  it('orders by capture time and keeps untimed pages last in import order', () => {
    const sorted = sortByTime([
      page('late', 3000),
      page('none-1', null),
      page('early', 1000),
      page('none-2', null),
      page('middle', 2000),
    ]);
    expect(ids(sorted)).toEqual(['early', 'middle', 'late', 'none-1', 'none-2']);
  });

  it('leaves an already ordered list alone', () => {
    const ordered = [page('a', 1), page('b', 2), page('c', 3)];
    expect(ids(sortByTime(ordered))).toEqual(['a', 'b', 'c']);
  });

  it('detects whether sorting is even possible', () => {
    expect(hasAnyTimestamp([page('a', null)])).toBe(false);
    expect(hasAnyTimestamp([page('a', null), page('b', 5)])).toBe(true);
  });
});

describe('undo history', () => {
  const page = (id: string): Page =>
    ({
      id,
      blob: new Blob(),
      width: 10,
      height: 10,
      rotation: 0,
      takenAt: null,
      srcName: id,
      bytes: 0,
    }) as Page;

  it('walks forwards and backwards', () => {
    let history = createHistory(['one', 'two']);
    expect(canUndo(history)).toBe(false);

    history = commit(history, ['two', 'one'], 20);
    expect(history.present).toEqual(['two', 'one']);
    expect(canUndo(history)).toBe(true);

    history = undo(history);
    expect(history.present).toEqual(['one', 'two']);
    expect(canUndo(history)).toBe(false);
    expect(undo(history)).toBe(history);
  });

  it('caps how much history is kept', () => {
    let history = createHistory(0);
    for (let i = 1; i <= 30; i += 1) history = commit(history, i, 5);
    expect(history.past.length).toBe(5);
    expect(history.present).toBe(30);
  });

  it('does not record a new state when nothing changed', () => {
    const list = [page('a')];
    const history = createHistory(list);

    // Same reference.
    expect(commitPages(history, list, 20)).toBe(history);

    // Same contents, new array: reordering to the same order must not stack up
    // undo entries, or Undo appears to do nothing.
    expect(commitPages(history, [page('a')].map(() => list[0] as Page), 20)).toBe(history);
  });

  it('records a real reorder', () => {
    const first = page('a');
    const second = page('b');
    const history = createHistory([first, second]);
    const next = commitPages(history, [second, first], 20);

    expect(next).not.toBe(history);
    expect(next.present).toEqual([second, first]);
    expect(canUndo(next)).toBe(true);

    // Undo returns the state from before the reorder.
    expect(undo(next).present).toEqual([first, second]);
    expect(canUndo(undo(next))).toBe(false);
  });

  it('undoes a long chain of moves back to the original order', () => {
    const original = [page('a'), page('b'), page('c'), page('d')];
    let history = createHistory(original);

    history = commitPages(history, moveItem(original, 0, 3), 20);
    history = commitPages(history, moveItem(history.present, 2, 0), 20);
    history = commitPages(history, moveBefore(history.present, 1, 3), 20);

    // [b,c,d,a] -> [d,c,b,a] after moving b (index 1) to sit before a.
    expect(ids(history.present)).toEqual(['d', 'c', 'b', 'a']);

    history = undo(history);
    history = undo(history);
    history = undo(history);

    expect(ids(history.present)).toEqual(['a', 'b', 'c', 'd']);
  });
});
