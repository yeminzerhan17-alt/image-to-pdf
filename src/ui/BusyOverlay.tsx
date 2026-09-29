import { busy } from '../state/store';

export function BusyOverlay() {
  const state = busy.value;
  if (!state) return null;

  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div class="busy">
      <div class="card" role="status" aria-live="polite">
        <strong>{state.label}</strong>
        <p>
          {state.done} / {state.total}
        </p>
        <div class="progress">
          <div style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
