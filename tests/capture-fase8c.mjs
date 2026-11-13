/**
 * Capturas de la Fase 8C (taxonomía visible): las 6 familias en el
 * filtro, la ficha con familia · categoría y el spiderfy de Piura.
 * Salida: docs/fase-8c/. Mismo arranque que tests/functional-route.mjs
 * (preview propio en 4173 + API en 3001 si responde).
 *
 * Uso: node tests/capture-fase8c.mjs [urlBase]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'docs', 'fase-8c');
mkdirSync(SHOTS, { recursive: true });

let server = null;
let BASE = process.argv[2] || process.env.ATLAS_BASE_URL || '';
async function startServer() {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'], {
    cwd: join(ROOT, 'apps', 'web'), stdio: 'ignore',
  });
  const url = 'http://127.0.0.1:4173/';
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try { const res = await fetch(url); if (res.ok) return url; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor de preview no respondió en 60 s');
}
if (!BASE) BASE = await startServer();
if (!BASE.endsWith('/')) BASE += '/';

const launchArgs = [];
if (process.platform === 'linux') launchArgs.push('--no-sandbox');
if (process.env.ATLAS_FORCE_SWIFTSHADER === '1') {
  launchArgs.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader');
}
const launchOptions = { args: launchArgs };
if (process.env.ATLAS_CHROMIUM_PATH) launchOptions.executablePath = process.env.ATLAS_CHROMIUM_PATH;
if (process.env.ATLAS_PROXY) launchOptions.proxy = { server: process.env.ATLAS_PROXY };
const browser = await chromium.launch(launchOptions);
const contextOptions = process.env.ATLAS_PROXY ? { ignoreHTTPSErrors: true } : {};

async function waitCounters(page, text, timeout = 25000) {
  await page.waitForFunction(
    (t) => {
      const el = [...document.querySelectorAll('[role="status"]')]
        .find((e) => e.getAttribute('aria-label') === 'Contadores');
      return !!el && el.textContent.includes(t);
    },
    text, { polling: 100, timeout });
}
async function expandFamily(page, familyName) {
  const clicked = await page.evaluate((name) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.getAttribute('aria-label') === `Mostrar subcategorías de ${name}` && x.offsetParent !== null);
    if (b) { b.click(); return true; }
    return false;
  }, familyName);
  if (clicked) await page.waitForTimeout(350);
}
const shot = async (page, name) => {
  await page.screenshot({ path: join(SHOTS, name) });
  console.log('captura', name);
};

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...contextOptions });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByText('1.409 iniciativas').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(6000);

  // 1 · Mundo con las 6 familias cerradas
  await page.getByRole('button', { name: /Categorías/ }).first().click();
  await page.waitForTimeout(800);
  await shot(page, '01-mundo-familias-cerradas.png');

  // 2 · Familia Educación seleccionada
  await page.getByRole('checkbox', { name: /familia Educación/ }).first().check();
  await waitCounters(page, '524');
  await page.waitForTimeout(1200);
  await shot(page, '02-educacion-seleccionada.png');

  // 3 · Centros y residencias desplegada (tras quitar Educación y
  // plegarla: la expansión se conserva al desmarcar, por diseño)
  await page.getByRole('checkbox', { name: /familia Educación/ }).first().uncheck();
  await waitCounters(page, '1.409');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.getAttribute('aria-label') === 'Ocultar subcategorías de Educación' && x.offsetParent !== null);
    b?.click();
  });
  await page.waitForTimeout(400);
  await expandFamily(page, 'Centros y residencias');
  await page.waitForTimeout(600);
  await shot(page, '03-centros-residencias-desplegada.png');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.getAttribute('aria-label') === 'Ocultar subcategorías de Centros y residencias' && x.offsetParent !== null);
    b?.click();
  });
  await page.waitForTimeout(400);

  // 4 · País con filtro de familia: España + Educación
  await page.getByRole('button', { name: /Explorar por país/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^España/ }).first().click();
  await waitCounters(page, '298');
  await page.getByRole('checkbox', { name: /familia Educación/ }).first().check();
  await waitCounters(page, '145');
  await page.waitForTimeout(1200);
  await shot(page, '04-espana-educacion.png');

  // 5 · Ficha con familia y categoría (Tajamar)
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await shot(page, '05-ficha-familia-categoria.png');
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.409');

  // 6 · Spiderfy de Piura con una ficha abierta
  const clickAtLngLat = async (lngLat) => {
    const pt = await page.evaluate(([lng, lat]) => {
      const p = window.__atlasMap.project([lng, lat]);
      return { x: p.x, y: p.y };
    }, lngLat);
    await page.mouse.click(pt.x, pt.y);
  };
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-80.65715, -5.18192], zoom: 11, duration: 700 }));
  await page.waitForTimeout(2800);
  await clickAtLngLat([-80.65715, -5.18192]);
  const dialog = page.getByRole('dialog', { name: /iniciativas en esta ubicación/ });
  await dialog.waitFor({ timeout: 12000 });
  await dialog.getByRole('button', { name: /Colegio Turicará/ }).click();
  await page.getByRole('heading', { name: 'Colegio Turicará' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await shot(page, '06-piura-spiderfy-ficha.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 7-8 · Móvil con familias / subcategorías desplegadas
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 }, hasTouch: true, ...contextOptions,
  });
  await mobile.goto(BASE, { waitUntil: 'load' });
  await mobile.locator('text=1.409 iniciativas').locator('visible=true').first().waitFor({ timeout: 30000 });
  await mobile.waitForTimeout(4000);
  await mobile.getByRole('tab', { name: 'filtros' }).click();
  await mobile.waitForTimeout(900);
  // La sección de familias está bajo la lista de países: se desplaza
  // el contenido de la hoja hasta ella.
  await mobile.evaluate(() => {
    document.querySelector('#panel-categorias')?.scrollIntoView({ block: 'start' });
  });
  await mobile.waitForTimeout(600);
  await shot(mobile, '07-movil-familias.png');
  await expandFamily(mobile, 'Educación');
  await mobile.waitForTimeout(600);
  await shot(mobile, '08-movil-subcategorias.png');
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}
console.log('Capturas de la Fase 8C completadas');
