import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';

import { deliverPrepared, importWarnings, prepareExport, refreshSnapshots } from './app/actions';
import { useSession } from './app/useSession';
import { canShareFiles } from './pdf/deliver';
import { formatBytes } from './pdf/quality';
import { canUndo, pageCount, pages, prepared, selectMode, undo } from './state/store';
import { BusyOverlay } from './ui/BusyOverlay';
import { ImportButton } from './ui/ImportButton';
import { PageGrid } from './ui/PageGrid';
import { clearSelection, SelectionBar } from './ui/SelectionBar';
import { SettingsSheet } from './ui/SettingsSheet';
import { Toast } from './ui/Toast';

const HINT_KEY = 'i2p:hintSeen';

function readHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

const hintSeen = signal(readHintSeen());

function markHintSeen(): void {
  hintSeen.value = true;
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* private mode: the hint simply shows again next time */
  }
}

function EmptyState() {
  return (
    <div class="empty">
      <h1>Photos to PDF</h1>
      <p>Add your pages in any order. You can rearrange them before the PDF is made.</p>
      <div class="actions">
        <ImportButton source="library" label="Choose photos" variant="primary" block />
        <ImportButton source="camera" label="Take a photo" block />
      </div>
      <p class="privacy-note">
        Nothing is uploaded. Photos are decoded, resized and assembled into the PDF entirely
        on this device, and the PDF never leaves it unless you share it.
      </p>
    </div>
  );
}

function Hint() {
  if (hintSeen.value) return null;
  return (
    <p class="hint" style={{ marginBottom: '10px' }}>
      Tap a page to pick it up, then tap ◀ or ▶ on another page to drop it there. Hold a page
      to drag it.{' '}
      <button
        type="button"
        style={{ color: 'var(--accent)', fontWeight: 650 }}
        onClick={markHintSeen}
      >
        Got it
      </button>
    </p>
  );
}

function PreparedPanel() {
  const current = prepared.value;
  if (!current) return null;
  const shareable = canShareFiles();

  return (
    <div class="prepared">
      <div class="meta">
        <strong>{current.filename}</strong>
        {formatBytes(current.bytes)} · {current.pageCount} page
        {current.pageCount === 1 ? '' : 's'} · quality {Math.round(current.quality * 100)}%
      </div>
      <button type="button" class="btn btn-primary" onClick={() => void deliverPrepared()}>
        {shareable ? 'Share' : 'Save'}
      </button>
    </div>
  );
}

export function App() {
  useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const pageList = pages.value;
  const warnings = importWarnings.value;
  const isSelectMode = selectMode.value;

  return (
    <div class="app">
      <header class="topbar">
        <span class="brand">Images → PDF</span>
        <span class="spacer" />
        <span class="count-pill">
          {pageCount.value} {pageCount.value === 1 ? 'page' : 'pages'}
        </span>
        {pageList.length > 0 ? (
          <button
            type="button"
            class="btn btn-icon"
            aria-pressed={isSelectMode}
            onClick={() => {
              selectMode.value = !isSelectMode;
              if (!isSelectMode) clearSelection();
            }}
          >
            {isSelectMode ? 'Done' : 'Select'}
          </button>
        ) : null}
      </header>

      <main class="canvas">
        {pageList.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {pageList.length > 1 ? <Hint /> : null}
            <PageGrid />
            {warnings.length > 0 ? (
              <div class="warnings">
                {warnings.length === 1 ? 'One file was skipped' : `${warnings.length} files were skipped`}:
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </main>

      <SelectionBar />
      <PreparedPanel />

      <footer class="bottombar">
        <ImportButton source="library" label="Add" />
        <button
          type="button"
          class="btn btn-icon"
          title="Undo"
          disabled={!canUndo.value}
          onClick={() => undo()}
        >
          ↶
        </button>
        <button
          type="button"
          class="btn btn-icon"
          title="Settings"
          onClick={() => {
            void refreshSnapshots();
            setSettingsOpen(true);
          }}
        >
          ⚙
        </button>
        <span class="grow" />
        <button
          type="button"
          class="btn btn-primary"
          disabled={pageList.length === 0}
          onClick={() => void prepareExport()}
        >
          Export
        </button>
      </footer>

      <Toast />
      <BusyOverlay />
      {settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
