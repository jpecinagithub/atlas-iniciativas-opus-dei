/**
 * Genera los glifos SDF autoalojados para MapLibre (public/glyphs).
 *
 * MapLibre necesita glifos en formato PBF (el de Mapbox) servidos por
 * rangos de Unicode. En vez de depender de un servidor de glifos
 * externo, se generan aquí desde la fuente Noto Sans Regular (OFL):
 * cada glifo se rasteriza una vez en un Chromium administrado por
 * Playwright (canvas 2D a 24 px, como hace fontnik) y se convierte en
 * un campo de distancia con signo (SDF, radio 8, borde en 0,75), que
 * es lo que el sombreador de MapLibre espera.
 *
 * Salida: apps/web/public/glyphs/<Fontstack>/<inicio>-<fin>.pbf
 * Uso: node tools/fonts/build_glyphs.mjs   (requiere la fuente en
 * tools/fonts/NotoSans-Regular.ttf y Playwright instalado).
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONT_PATH = join(ROOT, 'tools', 'fonts', 'NotoSans-Regular.ttf');
const OUT_DIR = join(ROOT, 'apps', 'web', 'public', 'glyphs', 'Noto Sans Regular');
const FONTSTACK = 'Noto Sans Regular';
const RANGES = [[0, 255], [256, 511], [512, 767], [8192, 8447]];

// --- Codificación protobuf mínima para el formato de glifos de Mapbox ---
function varint(n) {
  const out = [];
  let v = n >>> 0;
  do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v);
  return Buffer.from(out);
}
function bigVarint(n) { // para valores con signo convertidos a uint64 vía zigzag ya hechos
  const out = [];
  let v = BigInt(n);
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return Buffer.from(out);
}
const tag = (field, wire) => varint((field << 3) | wire);
const fieldVarint = (field, n) => Buffer.concat([tag(field, 0), varint(n)]);
const fieldSint32 = (field, n) => Buffer.concat([tag(field, 0), bigVarint((BigInt(n) << 1n) ^ (BigInt(n) >> 31n))]);
const fieldBytes = (field, buf) => Buffer.concat([tag(field, 2), varint(buf.length), buf]);
const fieldString = (field, s) => fieldBytes(field, Buffer.from(s, 'utf8'));

function encodeGlyph(g) {
  const parts = [fieldVarint(1, g.id)];
  if (g.bitmap) parts.push(fieldBytes(2, g.bitmap));
  parts.push(fieldVarint(3, g.width), fieldVarint(4, g.height), fieldSint32(5, g.left), fieldSint32(6, g.top), fieldVarint(7, g.advance));
  return Buffer.concat(parts);
}
function encodeRange(name, rangeLabel, glyphs) {
  const stack = Buffer.concat([
    fieldString(1, name),
    fieldString(2, rangeLabel),
    ...glyphs.map((g) => fieldBytes(3, encodeGlyph(g))),
  ]);
  return Buffer.concat([fieldBytes(1, stack)]); // glyphs { stacks: [stack] }
}

// --- Generación en el navegador (raster + SDF) ---
const fontB64 = readFileSync(FONT_PATH).toString('base64');
const browser = await chromium.launch({ args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');
const glyphData = await page.evaluate(async ({ fontB64, ranges }) => {
  const buf = Uint8Array.from(atob(fontB64), (c) => c.charCodeAt(0)).buffer;
  const face = new FontFace('Noto Sans', buf);
  await face.load();
  document.fonts.add(face);

  const SIZE = 24, BUFFER = 3, RADIUS = 8, CUTOFF = 0.75;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Transformada de distancia euclídea al cuadrado (Felzenszwalb), 1D.
  function edt1d(f, d, n) {
    const v = new Int32Array(n), z = new Float64Array(n + 1);
    let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  }
  function edt(grid, w, h) {
    const f = new Float64Array(Math.max(w, h)), d = new Float64Array(w * h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
      const col = new Float64Array(h); edt1d(f, col, h);
      for (let y = 0; y < h; y++) d[y * w + x] = col[y];
    }
    for (let y = 0; y < h; y++) {
      const row = d.slice(y * w, y * w + w); edt1d(row, f, w);
      for (let x = 0; x < w; x++) grid[y * w + x] = f[x];
    }
    return grid;
  }

  function glyphFor(cp) {
    const ch = String.fromCodePoint(cp);
    ctx.font = `${SIZE}px "Noto Sans"`;
    const advance = Math.round(ctx.measureText(ch).width);
    const PAD = 32;
    canvas.width = PAD * 2 + 16; canvas.height = PAD * 2 + 16;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${SIZE}px "Noto Sans"`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, PAD, PAD);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (img[(y * canvas.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return { id: cp, width: 0, height: 0, left: 0, top: 0, advance, bitmap: null };
    const iw = maxX - minX + 1, ih = maxY - minY + 1;
    const w = iw + BUFFER * 2, h = ih + BUFFER * 2;
    // Rejillas de distancia: fuera (a la tinta) y dentro (al fondo)
    const outside = new Float64Array(w * h), inside = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = minX + x - BUFFER, sy = minY + y - BUFFER;
      const ink = sx >= 0 && sy >= 0 && sx < canvas.width && sy < canvas.height
        ? img[(sy * canvas.width + sx) * 4 + 3] >= 128 : false;
      outside[y * w + x] = ink ? 0 : 1e9;
      inside[y * w + x] = ink ? 1e9 : 0;
    }
    edt(outside, w, h); edt(inside, w, h);
    const bmp = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      // Distancia con signo: positiva dentro de la tinta, negativa fuera.
      const dist = outside[i] === 0 ? Math.sqrt(inside[i]) : -Math.sqrt(outside[i]);
      bmp[i] = Math.max(0, Math.min(255, Math.round(255 * (CUTOFF + 0.5 * dist / RADIUS))));
    }
    return {
      id: cp, width: w, height: h,
      left: (minX - PAD) - BUFFER,
      top: (PAD - minY) + BUFFER,
      advance,
      bitmap: Array.from(bmp),
    };
  }

  const out = {};
  for (const [start, end] of ranges) {
    const list = [];
    for (let cp = start; cp <= end; cp++) list.push(glyphFor(cp));
    out[`${start}-${end}`] = list;
  }
  return out;
}, { fontB64, ranges: RANGES });
await browser.close();

mkdirSync(OUT_DIR, { recursive: true });
for (const [label, glyphs] of Object.entries(glyphData)) {
  const pbf = encodeRange(FONTSTACK, label, glyphs.map((g) => ({ ...g, bitmap: g.bitmap ? Buffer.from(g.bitmap) : null })));
  writeFileSync(join(OUT_DIR, `${label}.pbf`), pbf);
  console.log(`${label}.pbf: ${glyphs.length} glifos, ${pbf.length} bytes`);
}
console.log('Glifos generados en', OUT_DIR);
