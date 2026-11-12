/**
 * Prueba de la huella de versión del service worker (Fase 5).
 *
 * La versión que nombra la caché de la carcasa debe derivarse del
 * CONTENIDO de cada recurso precargado, incluidos los de public/.
 * Si se usaran nombre y tamaño, un fichero modificado conservando
 * ambos dejaría sw.js idéntico y el navegador nunca actualizaría.
 *
 * La prueba: compila, anota VERSION; modifica favicon.svg cambiando
 * un carácter por otro (mismo tamaño), recompila y exige otra
 * VERSION; restaura el fichero byte a byte, recompila y exige la
 * VERSION original (determinismo).
 *
 * Uso: npm run test:sw
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps', 'web');
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const TARGET = join(WEB, 'public', 'favicon.svg');
const SW = join(WEB, 'dist', 'sw.js');

function build() {
  const r = spawnSync(process.execPath, [VITE, 'build'], { cwd: WEB, stdio: 'pipe', encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('La compilación de la web falló');
  }
  const sw = readFileSync(SW, 'utf8');
  const m = sw.match(/const VERSION = '([0-9a-f]{12})'/);
  if (!m) throw new Error('sw.js no contiene la huella VERSION');
  return m[1];
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const original = readFileSync(TARGET);
try {
  const v1 = build();
  check('VERSION inicial extraída de sw.js', /^[0-9a-f]{12}$/.test(v1), v1);

  // Mismo tamaño, distinto contenido: se sustituye un dígito del
  // viewBox por otro carácter en la misma posición.
  const modified = Buffer.from(original);
  const idx = modified.indexOf('100');
  if (idx < 0) throw new Error('favicon.svg no contiene el patrón esperado para la prueba');
  modified[idx] = modified[idx] === 0x31 ? 0x32 : 0x31; // '1' -> '2'
  if (modified.length !== original.length) throw new Error('La modificación alteró el tamaño');
  writeFileSync(TARGET, modified);
  const v2 = build();
  check('Un recurso público cambiado sin cambiar de tamaño cambia VERSION', v2 !== v1, `${v1} -> ${v2}`);

  writeFileSync(TARGET, original);
  const v3 = build();
  check('Restaurado el fichero, VERSION vuelve a la original (determinista)', v3 === v1, v3);
} finally {
  writeFileSync(TARGET, original);
}

console.log(failures === 0 ? 'Huella del service worker: OK' : `Huella del service worker: ${failures} FALLO(S)`);
process.exit(failures === 0 ? 0 : 1);
