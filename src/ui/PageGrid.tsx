import { useEffect, useRef, useState } from 'preact/hooks';

import { previewFilter } from '../edit/enhance';
import { moveGroup } from '../edit/order';
import {
  busy,
  multiSelection,
  pages,
  selectMode,
  selectedId,
  setPages,
  settings,
  toggleSelection,
} from '../state/store';
import type { Page } from '../types';
import { PageTile } from './PageTile';
import type { InsertSide } from './PageTile';
import { nearestTile } from './reorder';
import type { DragPoint } from './reorder';
import { pruneThumbs, thumbUrl } from './thumbnails';

interface DragState {
  id: string;
  point: DragPoint;
}

export function PageGrid() {
  const pageList = pages.value;
  const liftedId = selectedId.value;
  const multi = multiSelection.value;
  const isSelectMode = selectMode.value;
  const filter = previewFilter(settings.value.enhance);

  const registry = useRef(new Map<string, { element: HTMLElement }>());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: InsertSide } | null>(null);

  // Release thumbnail URLs for pages that are gone; 60 leaked 400KB blobs is
  // precisely the memory problem this app exists to avoid.
  useEffect(() => {
    pruneThumbs(new Set(pageList.map((page) => page.id)));
  }, [pageList]);

  const register = (id: string, element: HTMLElement | null) => {
    if (element) registry.current.set(id, { element });
    else registry.current.delete(id);
  };

  /** Which pages a reorder action applies to. */
  const activeIds: ReadonlySet<string> | null =
    multi.size > 0 ? multi : liftedId ? new Set([liftedId]) : null;

  const insertActive = activeIds !== null && drag === null && !isSelectMode && pageList.length > 1;

  /**
   * A tap does one of three things, decided by position and current state:
   *   - nothing is selected  -> select this page;
   *   - this page is lifted  -> put it back down;
   *   - something else is selected -> insert it before/after, by which half of
   *     the tile was tapped.
   */
  function handleTap(id: string, point: DragPoint) {
    if (isSelectMode) {
      toggleSelection(id);
      return;
    }
    if (liftedId === id && multi.size === 0) {
      selectedId.value = null;
      return;
    }
    if (activeIds) {
      const entry = registry.current.get(id);
      if (!entry) return;
      const rect = entry.element.getBoundingClientRect();
      const side: InsertSide = point.x < rect.left + rect.width / 2 ? 'before' : 'after';
      handleInsert(id, side);
      return;
    }
    selectedId.value = id;
  }

  function handleInsert(targetId: string, side: InsertSide) {
    if (!activeIds || activeIds.has(targetId)) return;
    setPages(moveGroup(pageList, activeIds, targetId, side));
    selectedId.value = null;
    multiSelection.value = new Set();
  }

  function handleDragStart(id: string): boolean {
    if (busy.value || isSelectMode || pageList.length < 2) return false;
    selectedId.value = null;
    multiSelection.value = new Set();
    setDrag({ id, point: { x: 0, y: 0 } });
    return true;
  }

  function handleDragMove(id: string, point: DragPoint) {
    setDrag({ id, point });
    // Exclude the dragged tile so the target is always a real destination.
    const entries = [...registry.current.entries()].filter(([key]) => key !== id);
    const hit = nearestTile(point, entries);
    setDropTarget(hit ? { id: hit.id, side: hit.side } : null);
  }

  function handleDragEnd(id: string) {
    if (dropTarget) {
      setPages(moveGroup(pageList, new Set([id]), dropTarget.id, dropTarget.side));
    }
    setDrag(null);
    setDropTarget(null);
  }

  const draggedPage: Page | undefined = drag
    ? pageList.find((page) => page.id === drag.id)
    : undefined;

  return (
    <>
      <div class="grid">
        {pageList.map((page, index) => (
          <PageTile
            key={page.id}
            page={page}
            index={index}
            lifted={liftedId === page.id}
            dragging={drag?.id === page.id}
            checkable={isSelectMode}
            checked={multi.has(page.id)}
            insertActive={insertActive}
            hotSide={dropTarget?.id === page.id ? dropTarget.side : null}
            previewFilter={filter}
            onTap={(point) => handleTap(page.id, point)}
            onDragStart={() => handleDragStart(page.id)}
            onDragMove={(point) => handleDragMove(page.id, point)}
            onDragEnd={() => handleDragEnd(page.id)}
            register={register}
          />
        ))}
      </div>

      {drag && draggedPage ? (
        <div
          class="drag-clone"
          style={{ left: `${drag.point.x}px`, top: `${drag.point.y}px` }}
        >
          <img src={thumbUrl(draggedPage)} alt="" />
        </div>
      ) : null}
    </>
  );
}
