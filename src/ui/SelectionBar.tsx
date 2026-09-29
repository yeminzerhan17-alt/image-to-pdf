import { moveSelectionToEdge, shiftSelection } from '../edit/order';
import {
  flash,
  multiSelection,
  pages,
  rotateMany,
  selectMode,
  selectedId,
  setMultiSelection,
  setPages,
} from '../state/store';

export function clearSelection(): void {
  selectedId.value = null;
  setMultiSelection([]);
}

export function SelectionBar() {
  const multi = multiSelection.value;
  const lifted = selectedId.value;
  const isSelectMode = selectMode.value;

  const ids: ReadonlySet<string> = multi.size > 0 ? multi : lifted ? new Set([lifted]) : new Set();
  const count = ids.size;

  if (count === 0 && !isSelectMode) return null;

  const list = pages.value;

  function removeSelected() {
    const kept = list.filter((page) => !ids.has(page.id));
    setPages(kept);
    clearSelection();
    flash(`Deleted ${count} page${count === 1 ? '' : 's'}`);
  }

  return (
    <div class="selection-bar">
      {count > 0 ? (
        <>
          {/* A compact count keeps all seven actions on screen at 390px. */}
          <span
            class="label"
            aria-label={`${count} page${count === 1 ? '' : 's'} selected`}
            title={`${count} page${count === 1 ? '' : 's'} selected`}
          >
            {count}
          </span>
          <button
            type="button"
            class="btn btn-icon"
            title="Move to start"
            onClick={() => setPages(moveSelectionToEdge(list, ids, 'start'))}
          >
            ⇤
          </button>
          <button
            type="button"
            class="btn btn-icon"
            title="Move earlier"
            onClick={() => setPages(shiftSelection(list, ids, -1))}
          >
            ◀
          </button>
          <button
            type="button"
            class="btn btn-icon"
            title="Move later"
            onClick={() => setPages(shiftSelection(list, ids, 1))}
          >
            ▶
          </button>
          <button
            type="button"
            class="btn btn-icon"
            title="Move to end"
            onClick={() => setPages(moveSelectionToEdge(list, ids, 'end'))}
          >
            ⇥
          </button>
          <button
            type="button"
            class="btn btn-icon"
            title="Rotate"
            onClick={() => rotateMany(ids, 1)}
          >
            ⟳
          </button>
          <button type="button" class="btn btn-icon btn-danger" title="Delete" onClick={removeSelected}>
            🗑
          </button>
          <button type="button" class="btn btn-icon btn-ghost" title="Clear selection" onClick={clearSelection}>
            ✕
          </button>
        </>
      ) : (
        <>
          <span class="label">Tap pages to select them</span>
          <button
            type="button"
            class="btn"
            onClick={() => {
              selectMode.value = false;
              clearSelection();
            }}
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}
