/**
 * Drop-target resolution for hold-and-drag.
 *
 * This is the decision that answers "which page does the finger mean, and
 * before or after it" - the part of the drag that has no DOM events of its own
 * and is therefore easy to get subtly wrong.
 */

import { describe, expect, it } from 'vitest';

import { nearestTile } from '../src/ui/reorder';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as unknown as DOMRect;
}

function tile(left: number, top: number, width = 100, height = 140) {
  return {
    element: { getBoundingClientRect: () => rect(left, top, width, height) } as unknown as HTMLElement,
  };
}

// A 3-wide, 2-tall grid of 100x140 tiles with 10px gaps.
const grid: Array<[string, ReturnType<typeof tile>]> = [
  ['a', tile(0, 0)],
  ['b', tile(110, 0)],
  ['c', tile(220, 0)],
  ['d', tile(0, 150)],
  ['e', tile(110, 150)],
  ['f', tile(220, 150)],
];

describe('nearestTile', () => {
  it('picks the tapped tile in a grid', () => {
    expect(nearestTile({ x: 50, y: 70 }, grid)?.id).toBe('a');
    expect(nearestTile({ x: 160, y: 70 }, grid)?.id).toBe('b');
    expect(nearestTile({ x: 270, y: 70 }, grid)?.id).toBe('c');
    expect(nearestTile({ x: 50, y: 220 }, grid)?.id).toBe('d');
    expect(nearestTile({ x: 270, y: 220 }, grid)?.id).toBe('f');
  });

  it('splits each tile at its horizontal midpoint', () => {
    // Tile b spans x 110..210, so its midpoint is 160.
    expect(nearestTile({ x: 120, y: 70 }, grid)?.side).toBe('before');
    expect(nearestTile({ x: 159, y: 70 }, grid)?.side).toBe('before');
    expect(nearestTile({ x: 161, y: 70 }, grid)?.side).toBe('after');
    expect(nearestTile({ x: 200, y: 70 }, grid)?.side).toBe('after');
  });

  it('resolves a drop in the gap between tiles to the closer one', () => {
    // x=105 is in the 10px gap between a (0..100) and b (110..210).
    expect(nearestTile({ x: 104, y: 70 }, grid)?.id).toBe('a');
    expect(nearestTile({ x: 106, y: 70 }, grid)?.id).toBe('b');
  });

  it('returns null when the finger is nowhere near a tile', () => {
    expect(nearestTile({ x: 50, y: 2000 }, grid)).toBeNull();
    expect(nearestTile({ x: -500, y: 70 }, grid)).toBeNull();
  });

  it('respects a custom radius', () => {
    // Below tile a (bottom edge 140), 40px away: inside 60, outside 20.
    expect(nearestTile({ x: 50, y: 180 }, grid, 60)?.id).not.toBeNull();
    expect(nearestTile({ x: 50, y: 180 }, grid, 20)).toBeNull();
  });

  it('ignores tiles that are not laid out yet', () => {
    // A tile inside a display:none ancestor reports a zero rect. Its centre is
    // nearest to the drop point here, so if it were not skipped the move would
    // land on an invisible target.
    const withHidden: Array<[string, ReturnType<typeof tile>]> = [
      ['hidden', tile(0, 0, 0, 0)],
      ['real', tile(50, 0, 100, 140)],
    ];
    expect(nearestTile({ x: 10, y: 10 }, withHidden)?.id).toBe('real');
  });

  it('returns null for an empty grid', () => {
    expect(nearestTile({ x: 10, y: 10 }, [])).toBeNull();
  });

  it('reports the rect it matched, so the caller can anchor a marker', () => {
    const hit = nearestTile({ x: 160, y: 70 }, grid);
    expect(hit?.rect.left).toBe(110);
    expect(hit?.rect.width).toBe(100);
  });
});
