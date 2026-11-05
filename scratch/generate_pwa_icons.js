/**
 * Generates the PWA icon set (192/512 + maskable) as valid PNGs with zero
 * external dependencies: raw RGBA raster -> zlib deflate -> minimal PNG
 * encoder (IHDR/IDAT/IEND with CRC32). Artwork matches the app dark theme
 * (tokens.css): --bg-dark background, --accent-primary "A" delta mark.
 *
 * Run: node scratch/generate_pwa_icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- Minimal PNG encoder ----------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0; // filter: none
    rgba.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- Artwork ----------------------------------------------------------------

const BG = [9, 21, 32];        // hsl(222,47%,7%)  --bg-dark
const MARK = [36, 194, 121];   // hsl(158,82%,40%) --accent-primary

/** Coverage of the "A" delta at normalized coords (x,y in 0..1). */
function glyphCoverage(x, y) {
  const top = 0.16, bottom = 0.84;
  if (y < top || y > bottom) return 0;
  const t = (y - top) / (bottom - top);       // 0 at apex -> 1 at base
  const halfW = 0.06 + t * 0.30;              // widening triangle
  const strokeHalf = 0.055 + t * 0.028;       // thickening legs
  const cx = 0.5;
  const inTri = Math.abs(x - cx) <= halfW;
  const inHollow = Math.abs(x - cx) <= halfW - strokeHalf;
  if (!inTri) return 0;
  const inCrossbar = t >= 0.52 && t <= 0.68;
  // Enclosed counter above the crossbar is hollow; legs + crossbar +
  // solid base read as a bold "A" delta.
  if (inHollow && !inCrossbar && t < 0.52) return 0;
  return 1;
}

/** Renders size x size; paddingFraction keeps the mark inside maskable safe zone. */
function render(size, paddingFraction) {
  const SS = 4; // 4x supersample for smooth edges
  const img = Buffer.alloc(size * size * 4);
  const pad = paddingFraction * size;
  const aabb = size - 2 * pad; // glyph bounding box
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS - pad) / aabb;
          const y = (py + (sy + 0.5) / SS - pad) / aabb;
          cover += glyphCoverage(x, y);
        }
      }
      cover /= SS * SS;
      const i = (py * size + px) * 4;
      const r = BG[0] + (MARK[0] - BG[0]) * cover;
      const g = BG[1] + (MARK[1] - BG[1]) * cover;
      const b = BG[2] + (MARK[2] - BG[2]) * cover;
      img[i] = Math.round(r); img[i + 1] = Math.round(g); img[i + 2] = Math.round(b); img[i + 3] = 255;
    }
  }
  return encodePng(size, size, img);
}

// ---- Emit ---------------------------------------------------------------------

const outDir = path.join(__dirname, '..', 'restaurantos', 'frontend', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), render(192, 0.10));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), render(512, 0.10));
fs.writeFileSync(path.join(outDir, 'maskable-512.png'), render(512, 0.28));
fs.writeFileSync(path.join(outDir, 'icon-180.png'), render(180, 0.10)); // apple-touch-icon

console.log('PWA icons written to', outDir);
