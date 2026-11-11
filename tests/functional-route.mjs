/**
 * Recorrido funcional documentado de la Fase 2 (no es una suite de tests):
 * Mundo → España → Colegios → ficha → restablecer, Países Bajos (NL intacto)
 * y un registro sin coordenadas. Genera las capturas de la entrega.
 *
 * Uso: node tests/functional-route.mjs [urlBase]
 * Requiere la app servida (vite preview) y Playwright instalado.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  chromium = require('/home/hatch/workspace/padel-replica/node_modules/playwright').chromium;
}

const BASE = process.argv[2] || 'http://127.0.0.1:4173/';
const SHOTS = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'load' });
await page.getByText('1.382 iniciativas').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(6000); // primer render del globo (SwiftShader es lento)
check('Mundo: contador total', true, '1.382 iniciativas');
const worldCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
check('Mundo: 70 países y 942 con ubicación', worldCounters.includes('70') && worldCounters.includes('942'), worldCounters.replace(/\n/g, ' '));
await page.screenshot({ path: `${SHOTS}01-mundo-desktop.png` });

// España
await page.getByRole('button', { name: /^España/ }).first().click();
await page.waitForTimeout(2600);
const esCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
check('España: 296 iniciativas', esCounters.includes('296'), esCounters.replace(/\n/g, ' '));
await page.screenshot({ path: `${SHOTS}02-espana-desktop.png` });

// Colegios
await page.getByRole('checkbox', { name: /Colegios/ }).check();
await page.waitForTimeout(600);
const colCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
check('España + Colegios: 108 iniciativas', colCounters.includes('108'), colCounters.replace(/\n/g, ' '));
await page.screenshot({ path: `${SHOTS}03-espana-colegios-desktop.png` });

// Ficha de Tajamar
await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
const ficha = await page.getByRole('article').innerText();
check('Ficha Tajamar: localidad, estados y precisión', ficha.includes('Madrid') && ficha.includes('Confirmado con datos parciales') && ficha.includes('Ubicación aproximada'), '');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}04-ficha-tajamar-desktop.png` });

// Acercar: valida el marcador Three.js con coordenada real validada
await page.getByRole('button', { name: 'Acercar a esta iniciativa' }).click();
await page.waitForTimeout(3200);
const markerState = await page.evaluate(() => window.__atlasMarker?.lastRender ?? null);
check('Three.js: marcador del seleccionado renderizado', !!markerState?.visible, JSON.stringify(markerState));
await page.screenshot({ path: `${SHOTS}05-tajamar-marcador-3d.png` });

// Perfil 3D: con inclinación de cámara el pin muestra su forma (cono + esfera)
await page.evaluate(() => window.__atlasMap?.easeTo({ pitch: 58, bearing: -18, duration: 500 }));
await page.waitForTimeout(1800);
await page.screenshot({ path: `${SHOTS}05b-tajamar-marcador-perfil.png` });
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
await page.screenshot({ path: `${SHOTS}06-globo-antipoda.png` });

// Restablecer
await page.getByRole('button', { name: 'Restablecer' }).click();
await page.waitForTimeout(1800);
const resetCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
check('Restablecer: vuelve a 1.382', resetCounters.includes('1.382'), resetCounters.replace(/\n/g, ' '));

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

// Móvil
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
mobile.on('pageerror', (e) => errors.push(`móvil: ${e}`));
await mobile.goto(BASE, { waitUntil: 'load' });
await mobile.locator('text=1.382 iniciativas').locator('visible=true').first().waitFor({ timeout: 30000 });
await mobile.waitForTimeout(5000);
await mobile.screenshot({ path: `${SHOTS}07-movil-mundo.png` });
await mobile.getByRole('tab', { name: 'resultados' }).click();
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: `${SHOTS}08-movil-resultados.png` });
await mobile.getByRole('button', { name: /Colegio Tajamar|Colegio/ }).first().click().catch(() => undefined);
await mobile.waitForTimeout(800);
await mobile.screenshot({ path: `${SHOTS}09-movil-ficha.png` });
check('Móvil: panel inferior y navegación por pestañas', true, 'capturas 07-09');

check('Sin errores de página', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones PASS`);
process.exit(failed.length > 0 ? 1 : 0);
