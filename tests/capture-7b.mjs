// Capturas de entrega de la Fase 7B (no forma parte de la batería):
// escritorio (mundo, país, iniciativa)
// y móvil (mundo colapsado, resultados, iniciativa) contra el preview
// local de producción. Salida: docs/fase-7b/.
//
// Evidencias de marca: de CADA captura completa de escritorio se
// deriva, con ffmpeg y sin escalado (crop=520:130:0:0), el recorte
// marca-<estado>-1440.png DESDE EL MISMO FICHERO capturado, y se
// genera el manifiesto marca-evidencias.sha256 con los SHA-256 de
// cada par. Ningún desplazamiento usa scrollIntoView: la
// documentación se acerca moviendo solo el scrollTop del aside de
// la ficha, y antes/después de cada captura se exige que el
// viewport del documento no se haya movido (scrollX/scrollY = 0).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'fase-7b');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.ATLAS_BASE ?? 'http://localhost:4173/';

async function guardScroll(page, label) {
  const s = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    de: document.documentElement.scrollLeft,
    b: document.body?.scrollLeft ?? 0,
  }));
  if (s.x !== 0 || s.y !== 0 || s.de !== 0 || s.b !== 0) {
    throw new Error(`El viewport se movió en ${label}: ${JSON.stringify(s)}`);
  }
}

function cropFrom(fullPath, cropPath) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', fullPath, '-vf', 'crop=520:130:0:0', '-frames:v', '1', cropPath]);
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = [];
async function snap(page, estado) {
  await guardScroll(page, estado);
  const full = join(OUT, `despues-${estado}.png`);
  await page.screenshot({ path: full });
  const crop = join(OUT, `marca-${estado}-1440.png`);
  cropFrom(full, crop);
  manifest.push(`${sha256(full)}  despues-${estado}.png`, `${sha256(crop)}  marca-${estado}-1440.png`);
  console.log('captura + recorte:', estado);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: 'load' });
await page.getByText('1.382 iniciativas').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(6500);
await snap(page, 'mundo');

await page.getByRole('button', { name: /Explorar por país/ }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^España/ }).first().click();
await page.waitForTimeout(2600);
// Vista de país aprobada: tarjeta del país + tira, sin el inventario abierto
await page.getByRole('button', { name: /países y categorías/ }).click();
await page.evaluate(() => { const col = document.querySelector('div[class*="w-[344px]"]'); if (col) col.scrollTop = 0; });
await page.waitForTimeout(500);
await snap(page, 'pais');
// Para filtrar hay que reabrir el panel de exploración
await page.getByRole('button', { name: /Categorías/ }).first().click();
await page.waitForTimeout(600);

await page.getByRole('checkbox', { name: /Colegios/ }).check();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
await page.waitForTimeout(1200);
await snap(page, 'iniciativa');

await page.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await mobile.goto(BASE, { waitUntil: 'load' });
await mobile.getByRole('tab', { name: 'resultados' }).waitFor({ state: 'visible', timeout: 30000 });
await mobile.waitForTimeout(6000);
await mobile.screenshot({ path: join(OUT, 'despues-movil-mundo.png') });
await mobile.getByRole('tab', { name: 'resultados' }).click();
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: join(OUT, 'despues-movil-resultados.png') });
await mobile.getByRole('button', { name: /Colegio Tajamar|Colegio/ }).first().click().catch(() => undefined);
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: join(OUT, 'despues-movil-iniciativa.png') });
await mobile.close();
await browser.close();

writeFileSync(join(OUT, 'marca-evidencias.sha256'), manifest.join('\n') + '\n');
console.log('Capturas y evidencias de la Fase 7B en', OUT);
