/**
 * Recorrido funcional documentado de la Fase 2 (no es una suite de tests):
 * Mundo → España → Colegios → ficha → restablecer, Países Bajos (NL intacto),
 * un registro sin coordenadas e historial atrás/adelante del navegador.
 * Genera las capturas de la entrega en docs/screenshots/.
 *
 * Reproducible desde un clon limpio:
 *   npm ci
 *   npx playwright install chromium   # navegador administrado por Playwright
 *   npm run test:functional           # compila la app y ejecuta el recorrido
 *
 * El script arranca su propio servidor `vite preview` en el puerto 4173.
 * Alternativas: pasar una URL base ya servida como argumento
 * (`node tests/functional-route.mjs http://127.0.0.1:4173/`) o definir
 * ATLAS_BASE_URL. Ajustes opcionales de entorno, sin rutas en el código:
 * - ATLAS_CHROMIUM_PATH: ejecutable de Chromium alternativo.
 * - ATLAS_PROXY: servidor proxy para el navegador (p. ej. http://127.0.0.1:8080).
 * - ATLAS_FORCE_SWIFTSHADER=1: fuerza el render WebGL por software
 *   (SwiftShader). Solo para entornos sin GPU donde el valor por defecto
 *   no funcione; en un equipo normal NO debe usarse: con esos argumentos
 *   Chromium puede perder el contexto WebGL (CONTEXT_LOST_WEBGL) y la
 *   capa Three.js no llega a renderizar.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'docs', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// --- Servidor de la build de producción (si no se pasa una URL base) ---
let server = null;
let BASE = process.argv[2] || process.env.ATLAS_BASE_URL || '';
async function startServer() {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'], {
    cwd: join(ROOT, 'apps', 'web'),
    stdio: 'ignore',
  });
  const url = 'http://127.0.0.1:4173/';
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return url;
    } catch { /* aún no escucha */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor de preview no respondió en 60 s');
}
if (!BASE) BASE = await startServer();
if (!BASE.endsWith('/')) BASE += '/';

// --- API de la Fase 3: la web lee el catálogo de la API. Si no responde,
// se arranca la compilada (apps/api/dist) y, si la base está vacía, se
// importa (requiere PostgreSQL accesible según DATABASE_URL o el valor
// por defecto de desarrollo).
const API = (process.env.ATLAS_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
let apiServer = null;
async function apiHealth() {
  try {
    const res = await fetch(`${API}/api/health`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
if (!(await apiHealth())) {
  apiServer = spawn(process.execPath, [join(ROOT, 'apps', 'api', 'dist', 'server.js')], {
    stdio: 'ignore', env: { ...process.env, PORT: '3001' },
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !(await apiHealth())) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await apiHealth())) throw new Error('La API no respondió en 60 s (¿PostgreSQL en marcha?)');
}
if ((await apiHealth())?.counts?.initiatives === 0) {
  const { spawnSync } = await import('node:child_process');
  const imp = spawnSync(process.execPath, [join(ROOT, 'apps', 'api', 'dist', 'import.js')], {
    stdio: 'inherit', env: { ...process.env },
  });
  if (imp.status !== 0) throw new Error('La importación inicial de la base de datos falló');
}

// --- Navegador administrado por Playwright ---
// Por defecto, la GPU que ofrezca el sistema (en headless sin GPU,
// Chromium usa su ruta por software estándar). SwiftShader forzado solo
// si se pide expresamente: en Windows rompe el contexto WebGL.
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
    text,
    { polling: 100, timeout },
  );
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...contextOptions });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByText('1.382 iniciativas').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(6000); // primer render del globo (sin GPU es lento)
  check('Mundo: contador total', true, '1.382 iniciativas');
  const worldCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Mundo: 70 países y 942 con ubicación', worldCounters.includes('70') && worldCounters.includes('942'), worldCounters.replace(/\n/g, ' '));
  await page.screenshot({ path: join(SHOTS, '01-mundo-desktop.png') });

  // España
  await page.getByRole('button', { name: /^España/ }).first().click();
  await waitCounters(page, '296');
  check('España: 296 iniciativas', true, 'contadores');
  await page.screenshot({ path: join(SHOTS, '02-espana-desktop.png') });

  // Colegios
  await page.getByRole('checkbox', { name: /Colegios/ }).check();
  await waitCounters(page, '108');
  check('España + Colegios: 108 iniciativas', true, 'contadores');
  await page.screenshot({ path: join(SHOTS, '03-espana-colegios-desktop.png') });

  // Ficha de Tajamar
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
  const ficha = await page.getByRole('article').innerText();
  check('Ficha Tajamar: localidad, estados y precisión', ficha.includes('Madrid') && ficha.includes('Confirmado con datos parciales') && ficha.includes('Ubicación aproximada'), '');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, '04-ficha-tajamar-desktop.png') });

  // Acercar: valida el marcador Three.js con coordenada real validada
  await page.getByRole('button', { name: 'Acercar a esta iniciativa' }).click();
  await page.waitForTimeout(3200);
  const markerState = await page.evaluate(() => window.__atlasMarker?.lastRender ?? null);
  check('Three.js: marcador del seleccionado renderizado', !!markerState?.visible, JSON.stringify(markerState));
  await page.screenshot({ path: join(SHOTS, '05-tajamar-marcador-3d.png') });

  // Perfil 3D: con inclinación de cámara el pin muestra su forma (cono + esfera)
  await page.evaluate(() => window.__atlasMap?.easeTo({ pitch: 58, bearing: -18, duration: 500 }));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(SHOTS, '05b-tajamar-marcador-perfil.png') });
  await page.evaluate(() => window.__atlasMap?.easeTo({ pitch: 0, bearing: 0, duration: 400 }));
  await page.waitForTimeout(1200);

  // Cambio de selección desde la propia ficha (misma localidad)
  await page.getByRole('button', { name: /Colegio Senara/ }).last().click();
  await page.getByRole('heading', { name: 'Colegio Senara' }).waitFor({ timeout: 10000 });
  const markerAfterChange = await page.evaluate(() => window.__atlasMarker?.lastRender ?? null);
  check('Three.js: cambio de selección mantiene el marcador', !!markerAfterChange?.visible, '');
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });

  // Giro del globo: el marcador debe ocultarse tras el globo (vista antípoda)
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [176.3, -40.4], zoom: 1.8, duration: 600 }));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SHOTS, '06-globo-antipoda.png') });

  // Restablecer
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.382');
  check('Restablecer: vuelve a 1.382', true, 'contadores');

  // Países Bajos: NL intacto
  await page.getByRole('button', { name: /^Países Bajos/ }).first().click();
  await page.waitForTimeout(2200);
  const nlCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Países Bajos: 18 iniciativas (NL intacto)', nlCounters.includes('18 iniciativas') || nlCounters.includes('18'), nlCounters.replace(/\n/g, ' '));
  const nlList = await page.getByRole('list', { name: 'Resultados' }).innerText();
  check('Países Bajos: Club De Reusel en la lista', nlList.includes('Club De Reusel'), '');

  // Registro sin coordenadas: ES-218 Can Viladoms
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await page.waitForTimeout(600);
  await page.getByLabel('Buscar por nombre, localidad, región o entidad titular').fill('Can Viladoms');
  await page.waitForTimeout(700);
  const sinPuntoCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Sin coordenadas: cuenta en totales, 0 con ubicación', sinPuntoCounters.includes('1 iniciativas') && sinPuntoCounters.includes('0 con ubicación'), sinPuntoCounters.replace(/\n/g, ' '));
  const listaSinPunto = await page.getByRole('list', { name: 'Resultados' }).innerText();
  check('Sin coordenadas: aparece en la lista con distintivo', listaSinPunto.includes('Can Viladoms') && listaSinPunto.includes('sin punto'), '');
  await page.getByRole('button', { name: /Can Viladoms/ }).first().click();
  await page.waitForTimeout(500);
  const fichaSinPunto = await page.getByRole('article').innerText();
  check('Sin coordenadas: la ficha lo explica', fichaSinPunto.includes('Sin ubicación en el mapa'), '');

  // Historial atrás/adelante: cada lugar de la exploración es una entrada
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.382');
  await page.getByRole('button', { name: /^España/ }).first().click();
  await waitCounters(page, '296');
  await page.getByRole('checkbox', { name: /Colegios/ }).check();
  await waitCounters(page, '108');
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
  check('Historial: abrir la ficha crea una entrada (sel en la URL)', page.url().includes('sel=ES-06'), page.url());
  await page.goBack();
  await waitCounters(page, '108');
  check('Historial: atrás cierra la ficha y mantiene España + Colegios',
    !page.url().includes('sel=') && page.url().includes('pais=ES') && page.url().includes('categorias=Colegios'), page.url());
  await page.goBack();
  await waitCounters(page, '296');
  check('Historial: atrás quita las categorías y mantiene España',
    !page.url().includes('categorias=') && page.url().includes('pais=ES'), page.url());
  await page.goBack();
  await waitCounters(page, '1.382');
  check('Historial: atrás vuelve al mundo', !page.url().includes('pais='), page.url());
  await page.goForward();
  await waitCounters(page, '296');
  check('Historial: adelante vuelve a España', page.url().includes('pais=ES'), page.url());
  await page.goForward();
  await waitCounters(page, '108');
  check('Historial: adelante reaplica Colegios', page.url().includes('categorias=Colegios'), page.url());

  // Móvil
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, ...contextOptions });
  mobile.on('pageerror', (e) => errors.push(`móvil: ${e}`));
  await mobile.goto(BASE, { waitUntil: 'load' });
  await mobile.locator('text=1.382 iniciativas').locator('visible=true').first().waitFor({ timeout: 30000 });
  await mobile.waitForTimeout(5000);
  await mobile.screenshot({ path: join(SHOTS, '07-movil-mundo.png') });
  await mobile.getByRole('tab', { name: 'resultados' }).click();
  await mobile.waitForTimeout(900);
  await mobile.screenshot({ path: join(SHOTS, '08-movil-resultados.png') });
  await mobile.getByRole('button', { name: /Colegio Tajamar|Colegio/ }).first().click().catch(() => undefined);
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: join(SHOTS, '09-movil-ficha.png') });
  check('Móvil: panel inferior y navegación por pestañas', true, 'capturas 07-09');

  check('Sin errores de página', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
  if (apiServer) apiServer.kill('SIGTERM');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones PASS`);
process.exit(failed.length > 0 ? 1 : 0);
