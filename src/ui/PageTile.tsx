import { useEffect, useRef } from 'preact/hooks';

import type { Page } from '../types';
import { rotatedSize } from '../pdf/layout';
import type { DragPoint } from './reorder';
import { attachReorderGestures } from './reorder';
import { thumbUrl } from './thumbnails';

export type InsertSide = 'before' | 'after';

export interface PageTileProps {
  page: Page;
  index: number;
  lifted: boolean;
  dragging: boolean;
  /** Multi-select mode: show a checkbox-style toggle on every tile. */
  checkable: boolean;
  checked: boolean;
  /** Selection exists, so this tile should offer insert-before / insert-after. */
  insertActive: boolean;
  /** This tile is the current drop target during a drag. */
  hotSide: InsertSide | null;
  previewFilter: string;
  /** Receives the tap position so the grid can tell which half was tapped. */
  onTap: (point: DragPoint) => void;
  onDragStart: () => boolean;
  onDragMove: (point: DragPoint) => void;
  onDragEnd: () => void;
  register: (id: string, element: HTMLElement | null) => void;
}

export function PageTile(props: PageTileProps) {
  const { page, index } = props;
  const elementRef = useRef<HTMLElement | null>(null);
  // Handlers change every render but the listeners must attach only once per
  // page, so the gesture callbacks read from this box.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    return attachReorderGestures(element, {
      onTap: (point) => latest.current.onTap(point),
      onDragStart: () => latest.current.onDragStart(),
      onDragMove: (point) => latest.current.onDragMove(point),
      onDragEnd: () => latest.current.onDragEnd(),
    });
  }, [page.id]);

  useEffect(() => {
    latest.current.register(page.id, elementRef.current);
    return () => latest.current.register(page.id, null);
  }, [page.id]);

  const box = rotatedSize(page.width, page.height, page.rotation);
  const imgWidthPercent = (page.width / box.width) * 100;
  const imgHeightPercent = (page.height / box.height) * 100;

  const showHalves = props.insertActive && !props.lifted;

  return (
    <div
      ref={(element: HTMLElement | null) => {
        elementRef.current = element;
      }}
      class="tile"
      data-page-id={page.id}
      data-index={index}
      data-lifted={props.lifted ? 'true' : 'false'}
      data-dragging={props.dragging ? 'true' : 'false'}
      data-multi={props.checkable && props.checked ? 'true' : 'false'}
      style={{
        aspectRatio: `${box.width} / ${box.height}`,
        borderColor: props.hotSide ? 'var(--accent)' : undefined,
      }}
      aria-label={`Page ${index + 1}${props.lifted ? ', selected' : ''}`}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const rect = elementRef.current?.getBoundingClientRect();
        // Aim at the left edge so a keyboard insert lands predictably before
        // the focused page rather than on an arbitrary half.
        props.onTap(rect ? { x: rect.left + 1, y: rect.top + rect.height / 2 } : { x: 0, y: 0 });
      }}
    >
      <img
        src={thumbUrl(page)}
        alt={`Page ${index + 1}`}
        draggable={false}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `${imgWidthPercent}%`,
          height: `${imgHeightPercent}%`,
          objectFit: 'cover',
          transform: `translate(-50%, -50%) rotate(${page.rotation}deg)`,
          filter: props.previewFilter === 'none' ? undefined : props.previewFilter,
        }}
      />

      {/* Drop indicator while dragging. Deliberately independent of the insert
          halves above: those are hidden during a drag, and dragging with no
          feedback about the landing spot is guesswork. */}
      {props.hotSide ? <div class="drop-marker" data-side={props.hotSide} /> : null}

      <span class="tile-badge">{index + 1}</span>
      {page.rotation !== 0 ? <span class="tile-rotated">⟳ {page.rotation}°</span> : null}

      {props.checkable ? (
        <span class="tile-check" data-on={props.checked ? 'true' : 'false'}>
          {props.checked ? '✓' : ''}
        </span>
      ) : null}

      {/* These are decoration only (pointer-events: none in CSS). The tile's own
          gesture reads the tap position to decide which half it was, which
          keeps exactly one event path for a tap. */}
      {showHalves ? (
        <>
          <div
            class="insert-half"
            data-side="before"
            data-hot={props.hotSide === 'before' ? 'true' : 'false'}
          >
            ◀
          </div>
          <div
            class="insert-half"
            data-side="after"
            data-hot={props.hotSide === 'after' ? 'true' : 'false'}
          >
            ▶
          </div>
        </>
      ) : null}
    </div>
  );
}
