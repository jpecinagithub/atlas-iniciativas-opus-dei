// Capturas de entrega del hotfix 2 de clústeres (2026-11-13): el
// grupo de Piura PERMANECE desplegado mientras se consulta la
// ficha de Colegio Turicará. Escritorio: spiderfy completo con
// Turicará resaltado y su ficha abierta, sin marcador 3D en el
// ancla. Móvil: la ficha en su pestaña con los puntos desplegados
// visibles sobre el mapa. Salida: docs/fase-7b/.
//
// Contra el preview local de producción (puerto 4173); si no está
// en marcha, lo arranca. La API debe responder en el 3001, como en
// el recorrido funcional. Cada captura sale de su propio recorrido
// real, sin derivar una de otra.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'fase-7b');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.ATLAS_BASE ?? 'http://localhost:4173/';
const PIURA = [-80.65715, -5.18192];

let server = null;
const up = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
if (!(await up())) {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'], {
    cwd: join(ROOT, 'apps', 'web'), stdio: 'ignore',
  });
  const deadline = Date.now() + 60000;
  while (!(await up())) {
    if (Date.now() > deadline) throw new Error('El servidor de preview no respondió en 60 s');
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });

// Escritorio: Piura → grupo desplegado → ficha de Turicará.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: 'load' });
await page.getByText('1.411 iniciativas').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(6500);
await page.evaluate((c) => window.__atlasMap?.flyTo({ center: c, zoom: 11, duration: 700 }), PIURA);
await page.waitForTimeout(2800);
const pt = await page.evaluate((c) => {
  const p = window.__atlasMap.project(c);
  return { x: p.x, y: p.y };
}, PIURA);
await page.mouse.click(pt.x, pt.y);
await page.getByRole('dialog', { name: /iniciativas en esta ubicación/ }).waitFor({ timeout: 12000 });
await page.getByRole('dialog', { name: /iniciativas en esta ubicación/ })
  .getByRole('button', { name: /Colegio Turicará/ }).click();
await page.getByRole('heading', { name: 'Colegio Turicará' }).waitFor({ timeout: 10000 });
await page.waitForTimeout(1800); // el resaltado y la ficha se asientan
await page.screenshot({ path: join(OUT, 'hotfix2-piura-ficha-desktop.png') });
await page.close();

// Móvil: mismo grupo; la ficha se abre en su pestaña y los puntos
// permanecen desplegados sobre el mapa. Tras el vuelo a Piura, un
// ajuste iterativo project/unproject deja el ancla a 250 px de la
// parte superior: con la hoja de la ficha abierta (54 dvh), el
// despliegue queda en la franja visible sobre ella.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await mobile.goto(BASE, { waitUntil: 'load' });
await mobile.getByRole('tab', { name: 'resultados' }).waitFor({ state: 'visible', timeout: 30000 });
await mobile.waitForTimeout(6000);
await mobile.evaluate((c) => window.__atlasMap?.flyTo({ center: c, zoom: 10.5, duration: 600 }), PIURA);
await mobile.waitForTimeout(2800);
await mobile.evaluate((c) => {
  const map = window.__atlasMap;
  const TARGET_Y = 250;
  for (let k = 0; k < 3; k++) {
    const p = map.project(c);
    const dy = p.y - TARGET_Y;
    if (Math.abs(dy) < 4) break;
    const centerPx = map.project(map.getCenter());
    map.jumpTo({ center: map.unproject([centerPx.x, centerPx.y + dy]) });
  }
}, PIURA);
await mobile.waitForTimeout(600);
const mpt = await mobile.evaluate((c) => {
  const p = window.__atlasMap.project(c);
  return { x: p.x, y: p.y };
}, PIURA);
await mobile.touchscreen.tap(mpt.x, mpt.y);
const dialog = mobile.getByRole('dialog', { name: /iniciativas en esta ubicación/ });
await dialog.waitFor({ timeout: 12000 });
await dialog.getByRole('button', { name: /Colegio Turicará/ }).click();
await mobile.getByRole('heading', { name: 'Colegio Turicará' }).waitFor({ timeout: 10000 });
await mobile.waitForTimeout(1500);
await mobile.screenshot({ path: join(OUT, 'hotfix2-piura-ficha-movil.png') });
await mobile.close();

await browser.close();
if (server) server.kill('SIGTERM');
console.log('Capturas del hotfix 2 en', OUT);
