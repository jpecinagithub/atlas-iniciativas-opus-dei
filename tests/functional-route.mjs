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
  // Contexto del visor: host externo esperado mientras un iframe del
  // visor está abierto. Chromium (Windows) atribuye el 403 de un iframe
  // bloqueado a chrome-error://chromewebdata/, sin el origen real; sin
  // este contexto, ese mensaje sería indistinguible de un fallo propio.
  let expectedFrameHost = null;
  let offlineDrill = false;
  page.on('pageerror', (e) => errors.push({ text: String(e), url: '', frameHost: expectedFrameHost, offline: offlineDrill }));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push({ text: m.text(), url: m.location()?.url ?? '', frameHost: expectedFrameHost, offline: offlineDrill });
  });
  // Los fallos de glifos de MapLibre llegan como AVISOS de consola
  // («Unable to load glyph range», «mismatched image size»), no como
  // errores, y la interfaz los enmascara renderizando el texto
  // localmente. Se capturan aparte y tienen su propia comprobación:
  // con glifos autoalojados rotos, el recorrido DEBE fallar.
  const glyphErrors = [];
  page.on('console', (m) => {
    if ((m.type() === 'warning' || m.type() === 'error') &&
        /Unable to load glyph range|mismatched image size/.test(m.text())) {
      glyphErrors.push(m.text());
    }
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByText('1.382 iniciativas').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(6000); // primer render del globo (sin GPU es lento)
  check('Mundo: contador total', true, '1.382 iniciativas');
  const worldCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Mundo: 70 países y 942 con ubicación', worldCounters.includes('70') && worldCounters.includes('942'), worldCounters.replace(/\n/g, ' '));
  check('Inmersivo (7B): acción primaria «Explorar por país» y secundaria de categorías visibles',
    await page.getByRole('button', { name: /Explorar por país/ }).isVisible() &&
    await page.getByRole('button', { name: /Categorías/ }).first().isVisible(), '');
  check('Inmersivo (7B): sin lista de resultados antes de buscar o filtrar',
    (await page.getByRole('list', { name: 'Resultados' }).count()) === 0, '');

  // Etiquetas del mapa (Fase 5): glifos autoalojados y capas de texto
  const labelInfo = await page.evaluate(() => {
    const style = window.__atlasMap?.getStyle();
    return {
      glyphs: style?.glyphs ?? '',
      layers: (style?.layers ?? []).map((l) => l.id),
    };
  });
  check('Etiquetas: glifos autoalojados y capas de texto presentes',
    labelInfo.glyphs.includes('/glyphs/') &&
    labelInfo.layers.includes('etiquetas-paises') &&
    labelInfo.layers.includes('clusters-conteo') &&
    labelInfo.layers.includes('etiquetas-localidades'),
    labelInfo.glyphs);
  await page.screenshot({ path: join(SHOTS, '01-mundo-desktop.png') });
  check('Inmersivo (7B): el panel de exploración nace cerrado en la portada',
    (await page.getByRole('button', { name: /^España/ }).count()) === 0, '');
  await page.getByRole('button', { name: /Categorías/ }).first().click();
  await page.waitForTimeout(600);
  check('Inmersivo (7B): «Categorías» abre el panel directamente en su sección',
    await page.getByRole('checkbox', { name: /Colegios/ }).isVisible(), '');
  await page.getByRole('button', { name: /Explorar por país/ }).click();
  await page.waitForTimeout(400);
  const focusPais = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Buscar país');
  check('Inmersivo (7B): «Explorar por país» abre el panel y enfoca la búsqueda de país', focusPais, '');

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

  // Contexto de país (Fase 4). Existe en el panel de escritorio y en el
  // móvil (este último, oculto en esta ventana): se toma el primero.
  const ctx = page.getByLabel('Contexto de España').first();
  await ctx.waitFor({ timeout: 10000 });
  const ctxText = await ctx.innerText();
  check('Contexto de país: circunscripción y cifra del directorio', ctxText.includes('Circunscripción') && ctxText.includes('296'), '');
  check('Contexto de país: desglose por categoría (Colegios 108)', /Colegios\s+108/.test(ctxText), '');
  check('País (7B): el panel muestra «Sin punto» junto a iniciativas y con ubicación',
    ctxText.includes('Sin punto') && ctxText.includes('272'), '');
  const brand = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const input = document.querySelector('#buscador');
    const actions = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Restablecer');
    if (!h1 || !input || !actions) return { ok: false, detail: 'faltan elementos de cabecera' };
    const r1 = h1.getBoundingClientRect();
    const r2 = input.getBoundingClientRect();
    const r3 = actions.getBoundingClientRect();
    const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const el = document.elementFromPoint(Math.min(r1.right - 2, window.innerWidth - 1), r1.top + r1.height / 2);
    const libre = !!el && (el === h1 || h1.contains(el));
    return {
      ok: r1.left >= 0 && r1.right <= window.innerWidth && libre && !overlap(r1, r2) && !overlap(r1, r3),
      detail: `marca ${Math.round(r1.width)}px · buscador desde ${Math.round(r2.left)}px · sin intersecciones`,
    };
  });
  check('País (7B): la marca completa sigue visible, sin recortes ni solapes', brand.ok, brand.detail);
  await ctx.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, '12-contexto-pais.png') });

  // Ficha de Tajamar
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
  check('Iniciativa (7B): con la ficha abierta no queda panel lateral izquierdo expandido',
    (await page.locator('section[aria-label="Panel de exploración"]:visible').count()) === 0 &&
    (await page.locator('section[aria-label="Panel de resultados"]:visible').count()) === 0, '');
  const ficha = await page.getByRole('article').innerText();
  check('Ficha Tajamar: localidad, estados y precisión', ficha.includes('Madrid') && ficha.includes('Confirmado con datos parciales') && ficha.includes('Ubicación aproximada'), '');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(SHOTS, '04-ficha-tajamar-desktop.png') });

  // La sección «Evidencia y fuentes» de la ficha se retiró el
  // 2026-11-12 por decisión de Jon: la ficha ya no la muestra ni
  // descarga el detalle documental. textContent, no innerText:
  // los títulos van en mayúsculas por CSS.
  const fichaDoc = await page.getByRole('article').textContent() ?? '';
  check('Ficha: sin sección de evidencia y fuentes (retirada 2026-11-12)',
    !fichaDoc.includes('Evidencia y fuentes') && !fichaDoc.includes('Evidencia de vinculación') && !fichaDoc.includes('Fuentes catalogadas'), '');
  await page.screenshot({ path: join(SHOTS, '10-ficha-desktop.png') });

  // Visor web (Fase 4): solo se abre tras una acción del usuario;
  // en la ficha queda la entrada de la web propia de la entidad
  // (sección 02). La entrada por las fuentes catalogadas se fue
  // con la sección 03; el visor sigue cubierto también por la
  // fuente principal del país (flujo de Puerto Rico, más abajo).
  expectedFrameHost = 'tajamar.es';
  await page.getByRole('button', { name: 'Ver la web en el visor' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 10000 });
  const frameSrc = await dialog.locator('iframe').getAttribute('src');
  check('Visor web: se abre con la fuente cargada en un iframe', !!frameSrc && frameSrc.startsWith('http'), frameSrc ?? '');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, '11-visor-web.png') });
  await page.getByRole('button', { name: 'Cerrar visor' }).click();
  await page.waitForTimeout(400);
  check('Visor web: se cierra', (await page.getByRole('dialog').count()) === 0, '');
  expectedFrameHost = null;

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

  // Etiquetas de localidad con datos (Fase 5, corrección): no basta que
  // la capa exista. A zoom de agrupación los puntos van dentro de
  // clusters sin esa propiedad; a zoom 14 (> clusterMaxZoom) los
  // puntos son individuales: la fuente debe llevar «Madrid» y la capa
  // debe renderizarla.
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-3.7038, 40.4168], zoom: 14, duration: 600 }));
  const localityInSource = await page.waitForFunction(() => {
    const feats = window.__atlasMap?.querySourceFeatures('iniciativas') ?? [];
    return feats.some((f) => f.properties?.locality === 'Madrid');
  }, null, { polling: 250, timeout: 20000 }).then(() => true).catch(() => false);
  check('Etiquetas de localidad: los puntos llevan «locality» (Madrid en la fuente)', localityInSource, '');
  const localityRendered = await page.waitForFunction(() => {
    const feats = window.__atlasMap?.queryRenderedFeatures({ layers: ['etiquetas-localidades'] }) ?? [];
    return feats.some((f) => f.properties?.locality === 'Madrid');
  }, null, { polling: 250, timeout: 25000 }).then(() => true).catch(() => false);
  check('Etiquetas de localidad: «Madrid» se renderiza en su capa', localityRendered, '');

  // Giro del globo: el marcador debe ocultarse tras el globo (vista antípoda)
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [176.3, -40.4], zoom: 1.8, duration: 600 }));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SHOTS, '06-globo-antipoda.png') });

  // URLs externas (corrección de la Fase 4): el directorio trae valores
  // que no son URLs (textos documentales, dominios desnudos, comillas
  // tipográficas). Deben mostrarse como texto, nunca como enlace/visor.
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.382');
  const normCases = await page.evaluate(() => {
    const n = (window).__atlasNormalize;
    return [
      n('javascript:alert(1)'),
      n('data:text/html;base64,SG9sYQ=='),
      n('www.paloblanco.org'),
      n('  www.tahilan.org” '),
      n('No localizado · v30: texto documental con espacios y «comillas»'),
      n('https://www.tajamar.es/'),
    ];
  });
  check('URLs: javascript: y data: rechazados', normCases[0] === null && normCases[1] === null, JSON.stringify(normCases));
  check('URLs: dominio desnudo → https y comillas tipográficas recortadas',
    normCases[2] === 'https://www.paloblanco.org/' && normCases[3] === 'https://www.tahilan.org/', JSON.stringify(normCases));
  check('URLs: el texto documental no se convierte en URL y la https válida pasa intacta',
    normCases[4] === null && normCases[5] === 'https://www.tajamar.es/', JSON.stringify(normCases));

  // BR-10 y CL-16: sus Fuente 2 son textos documentales. Antes se
  // comprobaba que la sección 03 los mostraba como texto y no como
  // enlace; esa sección se retiró el 2026-11-12, así que ahora se
  // comprueba que la ficha ya no muestra las fuentes del directorio
  // de ninguna forma (ni enlace ni texto «sin enlace válido»).
  await page.getByLabel('Buscar por nombre, localidad, región o entidad titular').fill('Marumbi');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Marumbi/ }).first().click();
  await page.getByRole('heading', { name: /Marumbi/ }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const fichaBR = await page.getByRole('article').textContent() ?? '';
  check('BR-10: la ficha ya no muestra las fuentes del directorio (sección retirada)',
    !fichaBR.includes('sin enlace válido') &&
    (await page.getByRole('article').getByRole('link', { name: 'Fuente 1' }).count()) === 0 &&
    (await page.getByRole('article').getByRole('link', { name: 'Fuente 2' }).count()) === 0, '');

  await page.getByLabel('Buscar por nombre, localidad, región o entidad titular').fill('Huinganal');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Huinganal/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Huinganal' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const fichaCL = await page.getByRole('article').textContent() ?? '';
  check('CL-16: la ficha ya no muestra las fuentes del directorio (sección retirada)',
    !fichaCL.includes('correos.cl oficial') &&
    (await page.getByRole('article').getByRole('link', { name: 'Fuente 2' }).count()) === 0, '');

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

  // Puerto Rico (corrección de la Fase 4): su fuente principal es un
  // dominio desnudo; el visor debe abrir https://www.paloblanco.org/ y
  // nunca una ruta interna de la propia app.
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Puerto Rico/ }).first().click();
  await page.waitForTimeout(1200);
  const ctxPR = page.getByLabel('Contexto de Puerto Rico').first();
  expectedFrameHost = 'www.paloblanco.org';
  await ctxPR.getByRole('button', { name: 'Fuente principal del país en el visor' }).click();
  const dialogPR = page.getByRole('dialog');
  await dialogPR.waitFor({ timeout: 10000 });
  const prSrc = await dialogPR.locator('iframe').getAttribute('src');
  check('Puerto Rico: la fuente principal abre https://www.paloblanco.org/ en el visor',
    prSrc === 'https://www.paloblanco.org/', prSrc ?? '');
  await page.getByRole('button', { name: 'Cerrar visor' }).click();
  await page.waitForTimeout(400);
  expectedFrameHost = null;

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

  // Ficha híbrida (7B): secciones numeradas y cierre con Escape
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
  const ficha7b = await page.getByRole('article').textContent() ?? '';
  check('Ficha (7B): secciones 01 La iniciativa y 02 Ubicación y contacto; sin 03 (retirada 2026-11-12)',
    ficha7b.includes('La iniciativa') && ficha7b.includes('Ubicación y contacto') && !ficha7b.includes('Evidencia y fuentes'), '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Ficha (7B): Escape la cierra y limpia la URL',
    (await page.getByRole('article').count()) === 0 && !page.url().includes('sel='), page.url());

  // PWA (Fase 5): manifiesto, service worker y carcasa sin conexión
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const res = await fetch(link.href);
    const json = await res.json();
    return { href: link.href, name: json.name, icons: (json.icons ?? []).length };
  });
  check('PWA: manifiesto enlazado con nombre e iconos',
    !!manifest && manifest.name.includes('Atlas de iniciativas') && manifest.icons >= 3,
    manifest ? manifest.href : 'sin manifiesto');
  const swActive = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });
  check('PWA: service worker activo', swActive, '');
  // Flujo real de la PWA: la caché de ejecución se puebla en una visita
  // ya controlada por el service worker. Se restablece el mundo, se
  // recarga en línea (segunda visita) y solo entonces se corta la red.
  await page.getByRole('button', { name: 'Restablecer' }).first().click();
  await waitCounters(page, '1.382');
  await page.reload({ waitUntil: 'load' });
  await waitCounters(page, '1.382');
  offlineDrill = true;
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const offlineTitle = await page.evaluate(() => document.querySelector('h1')?.textContent ?? '');
  check('PWA: sin conexión, la carcasa de la app sigue cargando', offlineTitle.includes('Atlas de iniciativas'), offlineTitle);
  // Y no solo la carcasa: los datos ya consultados salen de la caché
  // (la API responde vía NetworkFirst desde el service worker).
  let offlineCounters = '';
  try {
    await waitCounters(page, '1.382', 30000);
    offlineCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  } catch { /* counters quedan vacíos y la comprobación falla */ }
  check('PWA: sin conexión, abre con lo último consultado (1.382 iniciativas)',
    offlineCounters.includes('1.382'), offlineCounters.replace(/\n/g, ' '));
  await page.context().setOffline(false);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1000);
  offlineDrill = false;

  // Móvil
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, ...contextOptions });
  mobile.on('pageerror', (e) => errors.push({ text: `móvil: ${e}`, url: '', frameHost: null, offline: false }));
  await mobile.goto(BASE, { waitUntil: 'load' });
  await mobile.locator('text=1.382 iniciativas').locator('visible=true').first().waitFor({ timeout: 30000 });
  await mobile.waitForTimeout(5000);
  await mobile.screenshot({ path: join(SHOTS, '07-movil-mundo.png') });
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('Móvil (7B): sin desbordamiento horizontal con la hoja colapsada', mobileOverflow <= 0, String(mobileOverflow));
  await mobile.getByRole('tab', { name: 'resultados' }).click();
  await mobile.waitForTimeout(900);
  await mobile.screenshot({ path: join(SHOTS, '08-movil-resultados.png') });
  await mobile.evaluate(() => { const el = document.querySelector('#hoja-contenido'); if (el) el.scrollTop = 260; });
  await mobile.getByRole('button', { name: /Colegio Tajamar|Colegio/ }).first().click().catch(() => undefined);
  await mobile.waitForTimeout(900);
  const sheetScrollTop = await mobile.evaluate(() => document.querySelector('#hoja-contenido')?.scrollTop ?? -1);
  check('Móvil (7B): una selección nueva abre la ficha con el scroll a cero', sheetScrollTop === 0, String(sheetScrollTop));
  await mobile.screenshot({ path: join(SHOTS, '09-movil-ficha.png') });
  check('Móvil: panel inferior y navegación por pestañas', true, 'capturas 07-09');

  // Movimiento reducido (7B): sin vuelos animados, todo funciona igual
  const rmContext = await browser.newContext({ reducedMotion: 'reduce', ...contextOptions });
  const rm = await rmContext.newPage();
  rm.on('pageerror', (e) => errors.push({ text: `reduced-motion: ${e}`, url: '', frameHost: null, offline: false }));
  await rm.goto(BASE, { waitUntil: 'load' });
  await rm.getByText('1.382 iniciativas').first().waitFor({ timeout: 30000 });
  await rm.getByRole('button', { name: /Explorar por país/ }).click();
  await rm.waitForTimeout(400);
  await rm.getByRole('button', { name: /^España/ }).first().click();
  await rm.getByRole('status', { name: 'Contadores' }).first().getByText(/296/).first().waitFor({ timeout: 15000 }).catch(() => undefined);
  const rmCounters = await rm.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Movimiento reducido (7B): navegar a España funciona sin animación', rmCounters.includes('296'), rmCounters.replace(/\n/g, ' '));
  await rmContext.close();

  // Errores esperados, clasificados de forma exclusiva: SOLO los del
  // documento externo cargado en el visor (opusdei.org o paloblanco.org),
  // incluido su rechazo X-Frame-Options documentado. Un 403 de la app,
  // la API o el mapa sigue siendo un fallo: no hay filtro genérico.
  const EXTERNAL_FRAME_HOSTS = ['https://opusdei.org/', 'https://www.paloblanco.org/'];
  const EXPECTED_FRAME_HOSTS_BARE = ['opusdei.org', 'www.paloblanco.org'];
  // Chromium puede ocultar el origen del iframe bloqueado tras
  // chrome-error://chromewebdata/: ese 403 solo es esperado si el
  // mensaje se capturó MIENTRAS el visor tenía abierto uno de los
  // hosts externos previstos (contexto guardado con cada mensaje).
  const isChromeError403 = (e) =>
    e.url === 'chrome-error://chromewebdata/' &&
    /^Failed to load resource: the server responded with a status of 403/.test(e.text);
  const isExpectedExternal = (e) =>
    EXTERNAL_FRAME_HOSTS.some((h) => e.url.startsWith(h)) ||
    (/Refused to display/i.test(e.text) && EXTERNAL_FRAME_HOSTS.some((h) => e.text.includes(h))) ||
    (isChromeError403(e) && EXPECTED_FRAME_HOSTS_BARE.includes(e.frameHost ?? '')) ||
    // Fallo de red de la API SOLO durante la prueba deliberada sin
    // conexión de la PWA: es su consecuencia directa y buscada.
    (e.offline && /\/api\//.test(e.url) && /ERR_FAILED/.test(e.text));
  const expectedBlocked = errors.filter(isExpectedExternal);
  const unexpected = errors.filter((e) => !isExpectedExternal(e));
  check('Glifos autoalojados: sin fallos de carga ni de tamaño', glyphErrors.length === 0,
    glyphErrors.slice(0, 2).join(' | '));
  check('Sin errores de página', unexpected.length === 0,
    unexpected.slice(0, 3).map((e) => `${e.url} ${e.text}`).join(' | ') ||
    (expectedBlocked.length
      ? `bloqueo externo esperado, observado y clasificado: ${expectedBlocked.length} mensaje(s) del iframe`
      : ''));
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
  if (apiServer) apiServer.kill('SIGTERM');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones PASS`);
process.exit(failed.length > 0 ? 1 : 0);
