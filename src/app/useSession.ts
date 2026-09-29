/**
 * Session restore + autosave.
 *
 * iOS reloads (and kills) tabs under memory pressure, and a phone goes in a
 * pocket mid-scan. Losing a 30-page document to either is unacceptable, so the
 * whole document is restored on load and written back, debounced, as it changes.
 */

import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

import { loadSession, saveSession } from '../state/persistence';
import {
  flash,
  pages,
  replaceDocument,
  restoredFromSession,
  settings,
  storageWarning,
} from '../state/store';

const AUTOSAVE_DELAY_MS = 900;

export function useSession(): void {
  const ready = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await loadSession();
      if (cancelled) return;

      if (stored) {
        replaceDocument(stored.pages, stored.settings);
        restoredFromSession.value = true;
        flash(`Restored ${stored.pages.length} page${stored.pages.length === 1 ? '' : 's'} from this device`);
      }
      // Nothing to restore: stay quiet and let the empty state speak.
      ready.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useSignalEffect(() => {
    const pageList = pages.value;
    const current = settings.value;

    // Reading the signals above is what subscribes this effect; bail out before
    // the restore has finished so we never overwrite a stored session with [].
    if (!ready.current) return;

    const timer = setTimeout(() => {
      void saveSession(pageList, current).then((ok) => {
        if (!ok && storageWarning.value === null) {
          storageWarning.value =
            'This device would not save your work (private browsing, or storage is full).';
        }
      });
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  });
}
