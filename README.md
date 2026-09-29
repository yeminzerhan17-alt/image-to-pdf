# Images to PDF

A phone-first web app that turns photos into a PDF, with a page-reordering step in
between. Built for the student workflow: snap the pages of your homework in any order,
put them in the right order in ten seconds, then hand in a single PDF.

**Nothing is uploaded.** Photos are decoded, downscaled, re-encoded and assembled into the
PDF entirely on the device. There is no backend, no account, and no watermark.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5199, also served on your LAN
npm test           # 82 unit tests (ordering, layout, quality, filenames, enhance, PDF round-trip)
npm run build      # typecheck + production bundle
npm run icons      # regenerate public/icons/*.png
```

Built with Vite + Preact + TypeScript. `pdf-lib` is dynamically imported at export time
only, so the initial bundle is ~21 KB gzip and the PDF machinery (~180 KB gzip) loads on
first export.

## How it works

```
src/
├── import/    exif (capture time) · decode (<img>, the HEIC path) · resize (the ONE pixel pipeline)
├── edit/      order (pure reordering + undo history) · enhance (greyscale + auto-levels LUT)
├── pdf/       layout (page geometry) · quality (target-size search) · build (pdf-lib) · deliver (share sheet)
├── state/     store (signals + undo) · persistence (IndexedDB)
└── ui/        reorder (hand-rolled gestures) · grid/tile/bars/sheets
```

Three rules the code depends on:

1. **A `Page` blob is always an already-downscaled JPEG.** Raw camera files are never
   retained, never embedded, and never uploaded.
2. **All pixels go through `renderToJpeg`.** One decode and one canvas are alive at a time,
   which is what keeps a 30-photo import from crashing an iPhone tab. A 12 MP photo is
   ~48 MB decoded; thirty of them at once is ~1 GB and an instant crash.
3. **HEIC never reaches the PDF encoder.** WebKit decodes HEIC natively for `<img>`, so
   routing every image through the canvas is what makes iPhone photos work at all.

Enhancement is applied at *export* time from the stored JPEG, so switching between
Off/Soft/B&W never re-encodes your stored originals.

## Reordering

- **Tap a page, then tap ◀ or ▶** on another page: the halves appear only while something
  is selected, so an ordinary tap is never ambiguous. This is the primary interaction.
- **Press and hold (~420 ms) to drag**, with edge auto-scroll and a drop marker on the
  target page.
- **Select** mode (top right) for multi-page moves, plus a selection bar with move-to-start,
  step, rotate and delete.
- **Undo** keeps the last 20 states, and long-press drag deliberately ignores HTML5
  drag-and-drop, which does not work on iOS at all.

Captured pages are sorted by EXIF capture time on import (untimed pages keep their order and
go last), so the default order is usually already right. *Settings → Order* can re-sort or
reverse the whole document.

## Testing on a real iPhone

```bash
npm run dev -- --host      # prints a Network URL such as http://192.168.1.3:5199
```

Open that URL on the phone (same Wi-Fi). For the installable app: **Share → Add to Home
Screen**, then launch it from the home screen to get a full-screen, chrome-less, offline
window.

### Manual device matrix

The unit tests cover pure logic and the PDF round trip. The browser behaviour below can
only be checked on hardware — the terminal preview is Chromium and reproduces none of it:

- [ ] 30 × 12 MP HEIC photos import without the tab reloading (watch for a memory reload)
- [ ] EXIF orientation: portrait, landscape, and upside-down photos are not sideways
- [ ] A tap selects the page you actually tapped (see the note in `ui/reorder.ts`)
- [ ] Long-press drag does not fight page scrolling, and the drop marker is easy to see
- [ ] Share sheet → Files, AirDrop, and Google Classroom all accept the PDF
- [ ] Backgrounding the app mid-export, then returning, does not lose the document
- [ ] A reload restores the document (IndexedDB) — including after a memory reload
- [ ] Offline launch works after Add to Home Screen
- [ ] The share sheet is reachable: Prepare → Share, so `share()` stays inside the tap

## Development test hook

In dev builds, `window.i2p` exposes a scripted entry point so the pipeline can be driven
without a file dialog — useful for testing on a phone over LAN:

```js
const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg'));
await window.i2p.importFiles([new File([blob], 'p.jpg', { type: 'image/jpeg' })]);
window.i2p.state();                              // pages, settings, prepared PDF info
await window.i2p.prepare();                      // build the PDF
await window.i2p.pdfBytes();                     // raw bytes, for inspecting embedded images
window.i2p.setSettings({ enhance: 'gray', maxBytes: 40000 });
```

Stripped from production builds by the `import.meta.env.DEV` guard.

## Known trade-offs

- **Session autosave rewrites the whole document** to a single IndexedDB key, debounced by
  900 ms. Correct and simple, but it re-clones every blob on each change; per-page keys
  would avoid that.
- **The target-size search re-encodes every page per attempt** (up to 4 attempts, bounded by
  a quality floor of 0.4). Fast for a handful of pages, a few seconds for 30.
- **`exifr` ships its full build** (~26 KB gzip) because the mini build does not read HEIC
  metadata, and iPhone photos are HEIC by default. It is lazy-loaded.
- **Auto-levels are capped at 3×** (`MAX_STRETCH`). Without the cap, a very low-contrast
  photo is stretched ~8×, which amplifies sensor noise and makes the JPEG *larger*.
- **iOS can evict site data** after roughly seven days of disuse. Snapshots (three most
  recent) and the session are best-effort; share anything important.
- **Only `visible` overlays are in the DOM** — there is no router, so the app is a single
  screen by design.
