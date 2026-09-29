import { render } from 'preact';

import { App } from './app';
import './styles.css';

const root = document.getElementById('app');
if (root) render(<App />, root);

// Scripted test hook, development only (see src/dev-hook.ts).
if (import.meta.env.DEV) {
  void import('./dev-hook').then((module) => module.installDevHook());
}

// Only in a production build: a dev-mode service worker would serve stale
// modules and make iteration miserable.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a bonus, never a blocker */
    });
  });
}
