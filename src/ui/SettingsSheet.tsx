import { useEffect, useState } from 'preact/hooks';

import { captureSnapshot, refreshSnapshots, restoreSnapshot, snapshots } from '../app/actions';
import { hasAnyTimestamp, reverse, sortByTime } from '../edit/order';
import { buildFilename } from '../pdf/filename';
import { computePlacement, effectiveDpi } from '../pdf/layout';
import { formatBytes } from '../pdf/quality';
import { deleteSnapshot } from '../state/persistence';
import {
  clearAll,
  flash,
  pages,
  setPages,
  settings,
  storageWarning,
  totalImportBytes,
  updateSettings,
} from '../state/store';
import type { EnhanceMode, FitId, MarginId, OrientationId, PaperId } from '../types';
import { clearSelection } from './SelectionBar';
import { Sheet } from './Sheet';

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div class="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-on={option.value === value ? 'true' : 'false'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const SIZE_OPTIONS = [
  { value: '0', label: 'No limit' },
  { value: '2', label: '2 MB' },
  { value: '5', label: '5 MB' },
  { value: '10', label: '10 MB' },
  { value: '25', label: '25 MB' },
];

export interface SettingsSheetProps {
  onClose: () => void;
}

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  const current = settings.value;
  const pageList = pages.value;
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [busySnapshot, setBusySnapshot] = useState(false);

  useEffect(() => {
    void refreshSnapshots();
  }, []);

  const previewName = buildFilename(current.nameTemplate, {
    subject: current.subject,
    date: new Date(),
    count: pageList.length || 1,
  });

  // Honest DPI number so the quality slider means something physical.
  const sample = pageList[0];
  const dpi = sample
    ? effectiveDpi(
        computePlacement({
          imgWidth: sample.width,
          imgHeight: sample.height,
          rotation: sample.rotation,
          paper: current.paper,
          orientation: current.orientation,
          margin: current.margin,
          fit: current.fit,
        }),
        sample.width,
      )
    : null;

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div class="field">
        <label for="subject">Subject / name</label>
        <div class="control">
          <input
            id="subject"
            type="text"
            value={current.subject}
            placeholder="Maths HW"
            onInput={(event) => updateSettings({ subject: event.currentTarget.value })}
          />
        </div>
      </div>

      <div class="field">
        <label for="template">Filename</label>
        <div class="control">
          <input
            id="template"
            type="text"
            value={current.nameTemplate}
            onInput={(event) => updateSettings({ nameTemplate: event.currentTarget.value })}
          />
        </div>
      </div>
      <p class="hint">
        {"{subject} {date} {time} {count}"} → <strong>{previewName}</strong>
      </p>

      <div class="field">
        <label>Paper</label>
        <div class="control">
          <Segmented<PaperId>
            value={current.paper}
            options={[
              { value: 'A4', label: 'A4' },
              { value: 'Letter', label: 'Letter' },
            ]}
            onChange={(paper) => updateSettings({ paper })}
          />
        </div>
      </div>

      <div class="field">
        <label>Orientation</label>
        <div class="control">
          <Segmented<OrientationId>
            value={current.orientation}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'portrait', label: 'Portrait' },
              { value: 'landscape', label: 'Landscape' },
            ]}
            onChange={(orientation) => updateSettings({ orientation })}
          />
        </div>
      </div>

      <div class="field">
        <label>Margins</label>
        <div class="control">
          <Segmented<MarginId>
            value={current.margin}
            options={[
              { value: 'none', label: 'None' },
              { value: 'narrow', label: 'Narrow' },
              { value: 'normal', label: 'Wide' },
            ]}
            onChange={(margin) => updateSettings({ margin })}
          />
        </div>
      </div>

      <div class="field">
        <label>Scaling</label>
        <div class="control">
          <Segmented<FitId>
            value={current.fit}
            options={[
              { value: 'fit', label: 'Fit' },
              { value: 'fill', label: 'Fill' },
            ]}
            onChange={(fit) => updateSettings({ fit })}
          />
        </div>
      </div>
      <p class="hint">
        Fit never crops. Fill bleeds the image to the page edges and crops the overflow.
        {dpi ? ` Currently about ${dpi} DPI.` : ''}
      </p>

      <div class="field">
        <label>Clean up</label>
        <div class="control">
          <Segmented<EnhanceMode>
            value={current.enhance}
            options={[
              { value: 'none', label: 'Off' },
              { value: 'gray-soft', label: 'Soft' },
              { value: 'gray', label: 'B&W' },
            ]}
            onChange={(enhance) => updateSettings({ enhance })}
          />
        </div>
      </div>
      <p class="hint">
        Greyscale with auto-levelling makes photographed handwriting much more legible
        and shrinks the file. Applied when the PDF is built; the stored photos are untouched.
      </p>

      <div class="field">
        <label for="quality">Quality</label>
        <div class="control">
          <input
            id="quality"
            type="range"
            min="0.4"
            max="0.95"
            step="0.01"
            value={current.quality}
            onInput={(event) => updateSettings({ quality: Number(event.currentTarget.value) })}
          />
        </div>
      </div>
      <p class="hint">{Math.round(current.quality * 100)}% JPEG quality.</p>

      <div class="field">
        <label for="maxsize">Max PDF size</label>
        <div class="control">
          <select
            id="maxsize"
            value={current.maxBytes === null ? '0' : String(Math.round(current.maxBytes / (1024 * 1024)))}
            onChange={(event) => {
              const megabytes = Number(event.currentTarget.value);
              updateSettings({ maxBytes: megabytes > 0 ? megabytes * 1024 * 1024 : null });
            }}
          >
            {SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p class="hint">
        Most school portals cap uploads at 10-25 MB. If the PDF is over the limit, quality is
        stepped down and the result is re-measured until it fits.
      </p>

      {pageList.length > 1 ? (
        <div class="field">
          <label>Order</label>
          <div class="control" style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              class="btn"
              disabled={!hasAnyTimestamp(pageList)}
              onClick={() => setPages(sortByTime(pageList))}
            >
              By time
            </button>
            <button type="button" class="btn" onClick={() => setPages(reverse(pageList))}>
              Reverse
            </button>
          </div>
        </div>
      ) : null}

      <h2 style={{ marginTop: '22px' }}>Snapshots</h2>
      <p class="hint">
        Snapshots keep a copy of the current photos and settings. Only the three most recent
        are kept, because iOS limits how much a site may store.
      </p>
      <div class="field">
        <label>{pageList.length} page(s) · {formatBytes(totalImportBytes.value)} stored</label>
        <div class="control">
          <button
            type="button"
            class="btn"
            disabled={pageList.length === 0 || busySnapshot}
            onClick={() => {
              setBusySnapshot(true);
              void captureSnapshot().finally(() => setBusySnapshot(false));
            }}
          >
            Save snapshot
          </button>
        </div>
      </div>

      {snapshots.value.map((snapshot) => (
        <div class="snapshot-row" key={snapshot.id}>
          <div class="info">
            {snapshot.label}
            <span>
              {new Date(snapshot.savedAt).toLocaleString()} · {snapshot.pageCount} pages ·{' '}
              {formatBytes(snapshot.bytes)}
            </span>
          </div>
          <button type="button" class="btn" onClick={() => void restoreSnapshot(snapshot.id)}>
            Restore
          </button>
          <button
            type="button"
            class="btn btn-icon btn-ghost"
            onClick={() => {
              void deleteSnapshot(snapshot.id).then(() => refreshSnapshots());
            }}
          >
            ✕
          </button>
        </div>
      ))}

      {storageWarning.value ? (
        <p class="warnings">{storageWarning.value}</p>
      ) : (
        <p class="hint">
          Your work is saved on this device only. iOS may clear it after about seven days of
          not using the app, so share anything important.
        </p>
      )}

      <h2 style={{ marginTop: '22px' }}>Danger zone</h2>
      <button
        type="button"
        class={confirmWipe ? 'btn btn-danger btn-block' : 'btn btn-block'}
        disabled={pageList.length === 0}
        onClick={() => {
          if (!confirmWipe) {
            setConfirmWipe(true);
            return;
          }
          clearAll();
          clearSelection();
          setConfirmWipe(false);
          flash('All pages removed');
          onClose();
        }}
      >
        {confirmWipe ? 'Tap again to delete every page' : 'Delete all pages'}
      </button>
      <p class="hint">This only clears the current document, not your saved snapshots.</p>
    </Sheet>
  );
}
