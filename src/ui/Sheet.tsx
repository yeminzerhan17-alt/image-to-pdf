import type { ComponentChildren } from 'preact';

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

export function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <div
      class="scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div class="sheet" role="dialog" aria-label={title} aria-modal="true">
        <div class="sheet-grabber" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
