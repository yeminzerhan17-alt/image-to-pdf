/**
 * Reorder gestures.
 *
 * HTML5 drag-and-drop is not used anywhere in this app: it has no touch support
 * in iOS Safari, so a `draggable` implementation works on a laptop and is
 * completely dead on the phone this app is built for.
 *
 * Instead a pointer gesture is hand-rolled:
 *   - a short, still press is a TAP (select / insert);
 *   - a 420ms hold promotes the gesture to a DRAG, and only then do we start
 *     swallowing touchmove to stop the page scrolling;
 *   - moving more than the tolerance before the hold expires cancels it, so
 *     ordinary scrolling over a tile still works.
 *
 * Two details here are load-bearing and easy to get wrong:
 *
 *  1. The shared `mousemove`/`mouseup` listeners live on `document`, so they are
 *     added when a press starts and removed when it ends. Registering them for
 *     the lifetime of every tile means one click fires the tap handler of every
 *     tile on the page, and the last one in DOM order wins - which looks exactly
 *     like "tapping this page selects a different page".
 *
 *  2. iOS dispatches synthesized mouse events after a real touch. Without the
 *     suppression window, every genuine tap would be replayed as a mouse tap.
 *     Touch events are retargeted to the element the touch started on, so the
 *     touch path is inherently scoped; only the mouse path needs the guard.
 */

export interface DragPoint {
  x: number;
  y: number;
}

export interface TileGestureOptions {
  /** Called for a plain tap, with where the finger actually landed. */
  onTap: (point: DragPoint) => void;
  /** Return false to refuse the drag (e.g. while another is in progress). */
  onDragStart: () => boolean;
  onDragMove: (point: DragPoint) => void;
  onDragEnd: () => void;
  longPressMs?: number;
  tolerancePx?: number;
  autoScroll?: boolean;
}

const DEFAULT_LONG_PRESS = 420;
/** A trembling finger during the hold must not abort the drag. */
const DEFAULT_TOLERANCE = 14;
const EDGE_MARGIN = 96;
const MAX_SCROLL_STEP = 22;
/** How long after a touch to ignore synthesized mouse events. */
const GHOST_CLICK_WINDOW_MS = 700;

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Find the nearest tile to a point, or null when nothing is close enough.
 * Nearest-with-a-radius is deliberately used instead of strict hit testing:
 * a fingertip covers a lot of screen, and dropping into the gap between two
 * tiles should still land somewhere sensible.
 */
export function nearestTile(
  point: DragPoint,
  entries: Iterable<[string, { element: HTMLElement }]>,
  maxDistance = 190,
): { id: string; rect: DOMRect; side: 'before' | 'after' } | null {
  let best: { id: string; rect: DOMRect; distance: number } | null = null;

  for (const [id, entry] of entries) {
    const rect = entry.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const dx = point.x - (rect.left + rect.width / 2);
    const dy = point.y - (rect.top + rect.height / 2);
    const d = Math.hypot(dx, dy);
    if (!best || d < best.distance) best = { id, rect, distance: d };
  }

  if (!best || best.distance > maxDistance) return null;
  // Left half inserts before, right half after.
  const side = point.x < best.rect.left + best.rect.width / 2 ? 'before' : 'after';
  return { id: best.id, rect: best.rect, side };
}

export function attachReorderGestures(
  element: HTMLElement,
  options: TileGestureOptions,
): () => void {
  const longPressMs = options.longPressMs ?? DEFAULT_LONG_PRESS;
  const tolerance = options.tolerancePx ?? DEFAULT_TOLERANCE;
  const wantAutoScroll = options.autoScroll ?? true;

  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  let point: DragPoint = { x: 0, y: 0 };

  /** A press that began on this element and has not ended yet. */
  let pressed = false;
  let dragging = false;
  /** True once the gesture is known to be a scroll/cancel rather than a tap. */
  let abandoned = false;
  let frame = 0;
  let suppressMouseUntil = 0;

  let onDocMouseMove: ((event: MouseEvent) => void) | null = null;
  let onDocMouseUp: ((event: MouseEvent) => void) | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  /** Swallow scrolling only once the gesture has become a real drag. */
  const blockScroll = (event: TouchEvent) => {
    if (dragging) event.preventDefault();
  };

  const autoScrollStep = () => {
    if (!dragging || !wantAutoScroll) return;
    const top = EDGE_MARGIN;
    const bottom = window.innerHeight - EDGE_MARGIN;
    let delta = 0;
    if (point.y < top) delta = -Math.min(MAX_SCROLL_STEP, (top - point.y) / 3);
    else if (point.y > bottom) delta = Math.min(MAX_SCROLL_STEP, (point.y - bottom) / 3);
    if (delta !== 0) window.scrollBy(0, delta);
    frame = requestAnimationFrame(autoScrollStep);
  };

  const beginDrag = () => {
    if (dragging) return;
    if (!options.onDragStart()) {
      abandoned = true;
      return;
    }
    dragging = true;
    document.addEventListener('touchmove', blockScroll, { passive: false });
    if (wantAutoScroll) frame = requestAnimationFrame(autoScrollStep);
    // Report the origin immediately so the caller can draw the dragged tile
    // without waiting for the finger to move.
    options.onDragMove(point);
  };

  const finishDrag = () => {
    document.removeEventListener('touchmove', blockScroll);
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    dragging = false;
    options.onDragEnd();
  };

  const startPress = (x: number, y: number) => {
    startX = x;
    startY = y;
    point = { x, y };
    pressed = true;
    abandoned = false;
    clearTimer();
    timer = window.setTimeout(() => {
      timer = null;
      if (!abandoned) beginDrag();
    }, longPressMs);
  };

  const endPress = () => {
    const wasPressed = pressed;
    pressed = false;
    clearTimer();

    if (dragging) {
      finishDrag();
      return;
    }
    if (wasPressed && !abandoned) options.onTap(point);
  };

  // --- touch ---------------------------------------------------------------

  const onTouchStart = (event: TouchEvent) => {
    // Multi-touch (pinch/zoom) always wins over a drag.
    if (event.touches.length !== 1 || pressed) {
      clearTimer();
      abandoned = true;
      return;
    }
    const touch = event.touches[0] as Touch;
    startPress(touch.clientX, touch.clientY);
  };

  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0] as Touch | undefined;
    if (!touch || !pressed) return;
    point = { x: touch.clientX, y: touch.clientY };

    if (dragging) {
      event.preventDefault();
      options.onDragMove(point);
      return;
    }
    if (distance(startX, startY, touch.clientX, touch.clientY) > tolerance) {
      // The user is scrolling, not holding.
      clearTimer();
      abandoned = true;
    }
  };

  const onTouchEnd = (event: TouchEvent) => {
    // Any mouse events the browser synthesizes from here on are ghosts.
    suppressMouseUntil = Date.now() + GHOST_CLICK_WINDOW_MS;
    if (dragging) {
      endPress();
      event.preventDefault();
      return;
    }
    endPress();
  };

  /**
   * iOS can decide mid-gesture that the touch was a scroll and fire
   * touchcancel, which also happens when it interrupts a long press for its own
   * text-selection UI. Two different outcomes are wanted:
   *   - a drag already in flight should LAND where the finger was, rather than
   *     silently discarding the move the user just made;
   *   - a press that was only ever a scroll must not turn into a tap.
   */
  const onTouchCancel = () => {
    if (dragging) {
      endPress();
      return;
    }
    pressed = false;
    abandoned = true;
    clearTimer();
  };

  // --- mouse (desktop, and the ghost events iOS sends after a touch) --------  //

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    if (Date.now() < suppressMouseUntil) return;
    if (pressed) return;

    startPress(event.clientX, event.clientY);
    point = { x: event.clientX, y: event.clientY };

    // Scoped to this gesture: every tile would otherwise react to one click.
    onDocMouseMove = (moveEvent: MouseEvent) => {
      if (!pressed) return;
      point = { x: moveEvent.clientX, y: moveEvent.clientY };

      if (dragging) {
        moveEvent.preventDefault();
        options.onDragMove(point);
        return;
      }
      if (distance(startX, startY, moveEvent.clientX, moveEvent.clientY) > tolerance) {
        clearTimer();
        abandoned = true;
      }
    };
    onDocMouseUp = () => {
      releaseDocMouse();
      if (dragging) {
        endPress();
        return;
      }
      endPress();
    };

    document.addEventListener('mousemove', onDocMouseMove);
    document.addEventListener('mouseup', onDocMouseUp);
  };

  const releaseDocMouse = () => {
    if (onDocMouseMove) document.removeEventListener('mousemove', onDocMouseMove);
    if (onDocMouseUp) document.removeEventListener('mouseup', onDocMouseUp);
    onDocMouseMove = null;
    onDocMouseUp = null;
  };

  // The callout menu and the synthetic click both fight with long-press drags.
  const onContextMenu = (event: Event) => event.preventDefault();
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  element.addEventListener('touchstart', onTouchStart, { passive: true });
  element.addEventListener('touchmove', onTouchMove, { passive: false });
  element.addEventListener('touchend', onTouchEnd, { passive: false });
  element.addEventListener('touchcancel', onTouchCancel, { passive: true });
  element.addEventListener('mousedown', onMouseDown);
  element.addEventListener('contextmenu', onContextMenu);
  element.addEventListener('click', onClick);

  return () => {
    clearTimer();
    if (frame) cancelAnimationFrame(frame);
    releaseDocMouse();
    document.removeEventListener('touchmove', blockScroll);
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchmove', onTouchMove);
    element.removeEventListener('touchend', onTouchEnd);
    element.removeEventListener('touchcancel', onTouchCancel);
    element.removeEventListener('mousedown', onMouseDown);
    element.removeEventListener('contextmenu', onContextMenu);
    element.removeEventListener('click', onClick);
  };
}
