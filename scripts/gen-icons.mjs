/**
 * Dependency-free app icon generator.
 *
 * Writing PNGs by hand keeps the project free of build-time image tooling: the
 * icons are 4x supersampled for smooth edges and emitted straight into public/.
 *   node scripts/gen-icons.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', 'public', 'icons');

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing ----------------------------------------------------------------

const BG = [37, 99, 235];
const PAPER = [248, 250, 252];
const INK = [148, 163, 184];

function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Colour of one sample in normalised [0,1] space. */
function sample(u, v, maskable) {
  // The background is tested in raw coordinates: a maskable icon must be
  // full-bleed with no transparent margin, or Android and iOS pad it with
  // transparent (rendered black) edges. Only the artwork is shrunk.
  const radius = maskable ? 0 : 0.24;
  if (!insideRoundedRect(u, v, 0, 0, 1, 1, radius)) return null; // transparent

  // Keep the artwork inside the maskable safe zone by shrinking toward centre.
  const fit = maskable ? 0.78 : 1;
  const x = 0.5 + (u - 0.5) / fit;
  const y = 0.5 + (v - 0.5) / fit;

  // Sheet of paper.
  const inPaper =
    insideRoundedRect(x, y, 0.3, 0.19, 0.7, 0.81, 0.05) ||
    // folded top-right corner, kept as a small triangle
    (x >= 0.62 && x <= 0.7 && y >= 0.19 && y <= 0.27 && x - 0.62 <= 0.27 - y + 0.19 + 0.08);
  if (inPaper) {
    // Text lines.
    const lines = [0.37, 0.46, 0.55, 0.64];
    for (const lineY of lines) {
      const width = lineY === 0.64 ? 0.5 : 1;
      if (x >= 0.37 && x <= 0.37 + 0.26 * width && y >= lineY && y <= lineY + 0.035) return INK;
    }
    return PAPER;
  }

  return BG;
}

function renderIcon(size, { maskable = false } = {}) {
  const SS = 3; // supersample factor
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;
          const colour = sample(u, v, maskable);
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            a += 255;
          }
        }
      }

      const samples = SS * SS;
      const covered = a / 255;
      const offset = (py * size + px) * 4;
      if (covered === 0) continue;
      // Average only over the covered samples so edges do not darken.
      rgba[offset] = Math.round(r / covered);
      rgba[offset + 1] = Math.round(g / covered);
      rgba[offset + 2] = Math.round(b / covered);
      rgba[offset + 3] = Math.round((covered / samples) * 255);
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
];

for (const [name, size, options] of targets) {
  const png = renderIcon(size, options);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
