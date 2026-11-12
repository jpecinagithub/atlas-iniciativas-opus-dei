// Capturas de entrega del hotfix de clústeres de la Fase 7 (no forma
// parte de la batería): escritorio con el spiderfy de Las Palmas
// desplegado y el selector visible, y móvil con el selector como
// hoja inferior. Salida: docs/fase-7b/.
//
// Contra el preview local de producción (puerto 4173); si no está
// en marcha, lo arranca. La API debe responder en el 3001, como en
// el recorrido funcional.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'fase-7b');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.ATLAS_BASE ?? 'http://localhost:4173/';

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

// Escritorio: España + Asociaciones juveniles → clúster de Las
// Palmas (2 iniciativas en la misma coordenada) → spiderfy abierto.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: 'load' });
await page.getByText('1.382 iniciativas').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(6500);
await page.getByRole('button', { name: /Categorías/ }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^España/ }).first().click();
await page.waitForTimeout(2200);
await page.getByRole('checkbox', { name: /Asociaciones juveniles/ }).check();
await page.waitForTimeout(800);
await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-15.41573, 28.10178], zoom: 8.5, duration: 700 }));
await page.waitForTimeout(2800);
const pt = await page.evaluate(() => {
  const p = window.__atlasMap.project([-15.41573, 28.10178]);
  return { x: p.x, y: p.y };
});
await page.mouse.click(pt.x, pt.y);
await page.getByRole('dialog', { name: /iniciativas en esta ubicación/ }).waitFor({ timeout: 12000 });
await page.waitForTimeout(1500); // el spiderfy termina de pintarse
await page.screenshot({ path: join(OUT, 'hotfix-laspalmas-desktop.png') });
await page.close();

// Móvil: mismo grupo, selector como hoja inferior.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await mobile.goto(BASE, { waitUntil: 'load' });
await mobile.getByRole('tab', { name: 'resultados' }).waitFor({ state: 'visible', timeout: 30000 });
await mobile.waitForTimeout(6000);
await mobile.evaluate(() => window.__atlasMap?.flyTo({ center: [-15.41573, 28.10178], zoom: 9, duration: 600 }));
await mobile.waitForTimeout(2800);
const mpt = await mobile.evaluate(() => {
  const p = window.__atlasMap.project([-15.41573, 28.10178]);
  return { x: p.x, y: p.y };
});
await mobile.touchscreen.tap(mpt.x, mpt.y);
await mobile.getByRole('dialog', { name: /iniciativas en esta ubicación/ }).waitFor({ timeout: 12000 });
await mobile.waitForTimeout(1000);
await mobile.screenshot({ path: join(OUT, 'hotfix-selector-movil.png') });
await mobile.close();

await browser.close();
if (server) server.kill('SIGTERM');
console.log('Capturas del hotfix en', OUT);
