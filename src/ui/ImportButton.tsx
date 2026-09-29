import { useRef } from 'preact/hooks';

import { importFromFiles } from '../app/actions';

export interface ImportButtonProps {
  /** 'library' multi-selects from Photos; 'camera' opens the camera directly. */
  source: 'library' | 'camera';
  label: string;
  variant?: 'primary' | 'default' | 'ghost';
  block?: boolean;
}

export function ImportButton({ source, label, variant = 'default', block }: ImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const classes = [
    'btn',
    variant === 'primary' ? 'btn-primary' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    block ? 'btn-block' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={source === 'library'}
        capture={source === 'camera' ? 'environment' : undefined}
        style={{ display: 'none' }}
        onChange={(event) => {
          const input = event.currentTarget as HTMLInputElement;
          const files = Array.from(input.files ?? []);
          // Reset so picking the same file twice still fires a change event.
          input.value = '';
          if (files.length > 0) void importFromFiles(files);
        }}
      />
      <button
        type="button"
        class={classes}
        onClick={() => {
          const input = inputRef.current;
          if (!input) return;
          input.value = '';
          input.click();
        }}
      >
        {label}
      </button>
    </>
  );
}
