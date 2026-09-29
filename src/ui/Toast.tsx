import { canUndo, message, undo } from '../state/store';

export function Toast() {
  const text = message.value;
  if (!text) return null;
  const showUndo = canUndo.value;

  return (
    <div class="toast" role="status">
      <span>{text}</span>
      {showUndo ? (
        <button
          type="button"
          onClick={() => {
            undo();
          }}
        >
          Undo
        </button>
      ) : null}
    </div>
  );
}
