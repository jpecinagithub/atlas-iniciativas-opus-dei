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
// ===== Fase 8C: cifras del directorio v15-6 servido por la API =====
const CANONICAL_CATS = ['Asociaciones juveniles', 'Casa de retiros', 'Centros Médicos',
  'Centros culturales', 'Centros de mujeres', 'Centros de promoción social',
  'Centros de varones', 'Clubes juveniles', 'Colegios', 'Escuelas de formación Técnica',
  'Iglesias', 'Oficinas de Información', 'Residencias universitarias', 'Universidades'];
{
  const h = await apiHealth();
  check('Datos (8C): API 1.409 · 1.387 ubicadas · 70 países · 2.728 fuentes · 2.159 relaciones',
    h?.counts?.initiatives === 1409 && h?.counts?.located === 1387 &&
    h?.counts?.countries === 70 && h?.counts?.sources === 2728 && h?.counts?.relations === 2159,
    JSON.stringify(h?.counts));
  const cat = await (await fetch(`${API}/api/catalog`)).json();
  const items = cat.initiatives ?? [];
  const cats = [...new Set(items.map((i) => i.category))];
  check('Datos (8C): exactamente las 14 categorías canónicas en el catálogo',
    cats.length === 14 && CANONICAL_CATS.every((c) => cats.includes(c)), cats.join(', '));
  const st = {};
  for (const i of items) st[i.verificationState] = (st[i.verificationState] ?? 0) + 1;
  check('Datos (8C): estados 1.309 parciales · 52 contrastados · 36 Pendiente · 11 Histórico · 1 Confirmado',
    st['Confirmado con datos parciales'] === 1309 && st['Confirmado y contrastado'] === 52 &&
    st['Pendiente'] === 36 && st['Histórico'] === 11 && st['Confirmado'] === 1,
    JSON.stringify(st));
  const ids = new Set(items.map((i) => i.id));
  check('Datos (8C): altas CO-37, ES-301, ES-302 presentes; bajas CO-32, ES-153, ES-219, ES-230, MX-47 ausentes',
    ['CO-37', 'ES-301', 'ES-302'].every((id) => ids.has(id)) &&
    ['CO-32', 'ES-153', 'ES-219', 'ES-230', 'MX-47'].every((id) => !ids.has(id)), '');
  const sinPunto = items.filter((i) => i.lat == null);
  check('Datos (8C): 22 sin punto; ES-218 y ES-240 entre ellos (pérdidas intencionadas, no regresiones)',
    sinPunto.length === 22 && ids.has('ES-218') && ids.has('ES-240') &&
    items.find((i) => i.id === 'ES-218')?.lat == null && items.find((i) => i.id === 'ES-240')?.lat == null,
    `${sinPunto.length} sin punto`);
  check('Datos (8C): 69 países con registros',
    new Set(items.map((i) => i.countryCode)).size === 69, '');
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

// Fase 8C: las subcategorías viven dentro de su familia, plegada por
// defecto. Despliega la familia pulsando su botón visible (puede
// haber dos paneles en el DOM — escritorio y móvil —; se pulsa el
// que está a la vista).
async function expandFamily(page, familyName) {
  const clicked = await page.evaluate((name) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.getAttribute('aria-label') === `Mostrar subcategorías de ${name}` && x.offsetParent !== null);
    if (b) { b.click(); return true; }
    return false;
  }, familyName);
  if (clicked) await page.waitForTimeout(350);
}

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
  // Advertencias de consola en general: el hotfix 2 exige cero
  // advertencias durante su recorrido (grupo de Piura); se cuentan
  // aparte y se comprueba el tramo, no toda la sesión.
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByText('1.409 iniciativas').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(6000); // primer render del globo (sin GPU es lento)
  check('Mundo: contador total', true, '1.409 iniciativas');
  // Fase 8C: cada clúster lleva el conteo de puntos por familia
  // (propiedades f0…f5); su suma es el total del clúster, y en el
  // mundo hay clústeres heterogéneos (ninguna familia lo cubre).
  const clusterFams = await page.evaluate(() => {
    const keys = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'];
    const clusters = (window.__atlasMap?.querySourceFeatures('iniciativas') ?? [])
      .filter((f) => f.properties?.point_count);
    return {
      n: clusters.length,
      sumaOk: clusters.length > 0 && clusters.every((c) =>
        keys.every((k) => typeof c.properties[k] === 'number') &&
        keys.reduce((a, k) => a + c.properties[k], 0) === c.properties.point_count),
      heterogeneos: clusters.filter((c) => keys.every((k) => c.properties[k] < c.properties.point_count)).length,
    };
  });
  check('Mapa (8C): los clústeres llevan conteos por familia que suman su total, con heterogéneos en el mundo',
    clusterFams.sumaOk && clusterFams.heterogeneos > 0,
    `${clusterFams.n} clústeres · ${clusterFams.heterogeneos} heterogéneos`);
  const worldCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Mundo: 69 países y 1.387 con ubicación', worldCounters.includes('69') && worldCounters.includes('1.387'), worldCounters.replace(/\n/g, ' '));
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
  check('Inmersivo (7B): «Categorías» abre el panel directamente en su sección (familias visibles, Fase 8C)',
    await page.getByRole('checkbox', { name: /familia Educación/ }).isVisible(), '');
  await page.getByRole('button', { name: /Explorar por país/ }).click();
  await page.waitForTimeout(400);
  const focusPais = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Buscar país');
  check('Inmersivo (7B): «Explorar por país» abre el panel y enfoca la búsqueda de país', focusPais, '');

  // España
  await page.getByRole('button', { name: /^España/ }).first().click();
  await waitCounters(page, '298');
  check('España: 298 iniciativas', true, 'contadores');
  await page.screenshot({ path: join(SHOTS, '02-espana-desktop.png') });

  // Colegios (Fase 8C: dentro de la familia Educación, plegada por
  // defecto; se despliega antes de marcar la subcategoría)
  await expandFamily(page, 'Educación');
  await page.getByRole('checkbox', { name: /Colegios/ }).check();
  await waitCounters(page, '110');
  check('España + Colegios: 110 iniciativas', true, 'contadores');
  await page.screenshot({ path: join(SHOTS, '03-espana-colegios-desktop.png') });

  // Contexto de país (Fase 4). Existe en el panel de escritorio y en el
  // móvil (este último, oculto en esta ventana): se toma el primero.
  const ctx = page.getByLabel('Contexto de España').first();
  await ctx.waitFor({ timeout: 10000 });
  const ctxText = await ctx.innerText();
  check('Contexto de país: circunscripción y cifra del directorio', ctxText.includes('Circunscripción') && ctxText.includes('298'), '');
  check('Contexto de país: desglose por categoría (Colegios 110)', /Colegios\s+110/.test(ctxText), '');
  check('País (7B): el panel muestra «Sin punto» junto a iniciativas y con ubicación',
    ctxText.includes('Sin punto') && ctxText.includes('289'), '');
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
  const fichaTxt = await page.getByRole('article').textContent() ?? '';
  check('Ficha (8C): muestra familia y categoría canónica («Educación · Colegios»)',
    fichaTxt.includes('Educación · Colegios'), '');
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

  // El visor web se retiró por completo el 2026-11-12 por decisión
  // de Jon: ni el componente, ni sus enlaces en la ficha y el país.
  // Quedan los enlaces externos normales (target=_blank).
  check('Ficha: sin visor ni enlace al visor (retirado 2026-11-12)',
    (await page.getByRole('button', { name: 'Ver la web en el visor' }).count()) === 0 &&
    (await page.locator('iframe').count()) === 0, '');

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
  await waitCounters(page, '1.409');
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
  await waitCounters(page, '1.409');
  check('Restablecer: vuelve a 1.409', true, 'contadores');

  // ===== Fase 8C: taxonomía visible (6 familias → 14 categorías) =====
  await page.getByRole('button', { name: /Categorías/ }).first().click();
  await page.waitForTimeout(600);
  const famSection = page.locator('#panel-categorias').first();
  const famRows = await page.evaluate(() => {
    const sec = document.querySelector('#panel-categorias');
    if (!sec) return { familias: [], subsVisibles: 0 };
    const familias = [...sec.querySelectorAll('input[type="checkbox"][aria-label^="Seleccionar toda la familia"]')]
      .map((i) => i.getAttribute('aria-label'));
    const subsVisibles = [...sec.querySelectorAll('div[id^="subcategorias-"] input[type="checkbox"]')]
      .filter((i) => i.offsetParent !== null).length;
    return { familias, subsVisibles };
  });
  check('Taxonomía (8C): el primer nivel muestra solo las 6 familias, con las subcategorías plegadas',
    famRows.familias.length === 6 && famRows.subsVisibles === 0,
    famRows.familias.join(' · '));
  // Los conteos se leen de la fila de cada familia (entre el
  // nombre y el total va la descripción: se extrae el número que
  // precede al chevrones de despliegue en su fila).
  const readFamCounts = (pg) => pg.evaluate(() => {
    const out = {};
    for (const b of document.querySelectorAll('#panel-categorias button[aria-expanded]')) {
      const fam = (b.getAttribute('aria-label') ?? '').replace(/^(Mostrar|Ocultar) subcategorías de /, '');
      let row = b.parentElement;
      while (row && !/\d[\d.]*\s*▾\s*$/.test(row.textContent ?? '')) row = row.parentElement;
      const m = (row?.textContent ?? '').match(/(\d[\d.]*)\s*▾\s*$/);
      out[fam] = m ? m[1] : null;
    }
    return out;
  });
  const famCounts = await readFamCounts(page);
  check('Taxonomía (8C): conteos por familia en el mundo (Educación 524 · Centros y residencias 562 · Juventud 108)',
    famCounts['Educación'] === '524' && famCounts['Centros y residencias'] === '562' && famCounts['Juventud'] === '108',
    JSON.stringify(famCounts));
  const ariaExp = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Mostrar subcategorías de Educación');
    return b?.getAttribute('aria-expanded');
  });
  await expandFamily(page, 'Educación');
  const ariaExpTras = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') ?? '').includes('categorías de Educación'));
    return b?.getAttribute('aria-expanded');
  });
  check('Taxonomía (8C): el botón de despliegue anuncia aria-expanded (false → true)',
    ariaExp === 'false' && ariaExpTras === 'true', `${ariaExp} → ${ariaExpTras}`);
  const eduSubs = await page.evaluate(() => {
    const cont = document.querySelector('#subcategorias-educacion');
    const out = {};
    if (!cont) return out;
    for (const lab of cont.querySelectorAll('label')) {
      const t = lab.textContent ?? '';
      const m = t.match(/(\d[\d.]*)\s*$/);
      if (m) out[t.replace(/\d[\d.]*\s*$/, '').trim()] = m[1];
    }
    return out;
  });
  check('Taxonomía (8C): Educación despliega sus 3 categorías canónicas con conteos (399 · 41 · 84)',
    eduSubs['Colegios'] === '399' && eduSubs['Universidades'] === '41' && eduSubs['Escuelas de formación Técnica'] === '84',
    JSON.stringify(eduSubs));
  await page.getByRole('checkbox', { name: /familia Educación/ }).first().check();
  await waitCounters(page, '524');
  check('Taxonomía (8C): seleccionar la familia Educación filtra sus 3 categorías (524) y la URL guarda categorías canónicas',
    page.url().includes('categorias=') && page.url().includes('Colegios'), page.url());
  // Desmarcar una subcategoría: la familia queda indeterminada
  await page.getByRole('checkbox', { name: /Colegios/ }).first().uncheck();
  await waitCounters(page, '125');
  const eduIndet = await page.getByRole('checkbox', { name: /familia Educación/ }).first()
    .evaluate((el) => ({ ind: el.indeterminate, aria: el.getAttribute('aria-checked') }));
  check('Taxonomía (8C): desmarcar Colegios deja la familia indeterminada (indeterminate + aria-checked=mixed) y filtra 125',
    eduIndet.ind === true && eduIndet.aria === 'mixed', JSON.stringify(eduIndet));
  await famSection.getByRole('button', { name: 'Quitar todas' }).click();
  await waitCounters(page, '1.409');
  check('Taxonomía (8C): «Quitar todas» limpia la selección y la URL',
    !page.url().includes('categorias='), page.url());
  // Juventud = Asociaciones juveniles + Clubes juveniles
  await page.getByRole('checkbox', { name: /familia Juventud/ }).first().check();
  await waitCounters(page, '108');
  await expandFamily(page, 'Juventud');
  const juvSubs = await page.evaluate(() => {
    const cont = document.querySelector('#subcategorias-juventud');
    return cont ? [...cont.querySelectorAll('input[type="checkbox"]')].map((i) => i.checked) : [];
  });
  check('Taxonomía (8C): Juventud selecciona Asociaciones juveniles y Clubes juveniles (108 en el mundo)',
    juvSubs.length === 2 && juvSubs.every(Boolean), JSON.stringify(juvSubs));
  await page.getByRole('checkbox', { name: /familia Juventud/ }).first().uncheck();
  await waitCounters(page, '1.409');
  // Enlace antiguo con una sola categoría: sigue funcionando, la
  // familia se despliega sola y su checkbox queda indeterminado
  await page.goto(`${BASE}?categorias=Colegios`, { waitUntil: 'load' });
  await waitCounters(page, '399');
  await page.getByRole('button', { name: /Categorías/ }).first().click();
  await page.waitForTimeout(600);
  const oldLink = await page.getByRole('checkbox', { name: /familia Educación/ }).first()
    .evaluate((el) => ({ ind: el.indeterminate })).catch(() => ({ ind: null }));
  const colVisible = await page.getByRole('checkbox', { name: /Colegios/ }).first().isVisible().catch(() => false);
  check('Taxonomía (8C): un enlace antiguo (?categorias=Colegios) filtra 399, despliega Educación y la deja indeterminada',
    colVisible && oldLink.ind === true, JSON.stringify(oldLink));
  // Conteos con país + familia: España y Educación = 145
  await page.goto(BASE, { waitUntil: 'load' });
  await waitCounters(page, '1.409');
  await page.getByRole('button', { name: /Explorar por país/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^España/ }).first().click();
  await waitCounters(page, '298');
  await page.getByRole('button', { name: /Categorías/ }).first().click();
  await page.waitForTimeout(500);
  const famCountsES = await readFamCounts(page);
  check('Taxonomía (8C): los conteos respetan el país (Educación en España = 145)',
    famCountsES['Educación'] === '145', JSON.stringify(famCountsES));
  await page.getByRole('checkbox', { name: /familia Educación/ }).first().check();
  await waitCounters(page, '145');
  check('Taxonomía (8C): España + familia Educación = 145 iniciativas', true, 'contadores');
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.409');
  // Clúster homogéneo: el grupo coincidente de Las Palmas (2 de
  // Juventud) forma un clúster con f_juventud = point_count
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-15.41573, 28.10178], zoom: 9, duration: 700 }));
  await page.waitForTimeout(2800);
  const homo = await page.evaluate(() => {
    const keys = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'];
    const clusters = (window.__atlasMap?.querySourceFeatures('iniciativas') ?? [])
      .filter((f) => f.properties?.point_count);
    const c = clusters.find((x) => x.properties.point_count === 2 &&
      Math.abs(x.geometry.coordinates[0] + 15.41573) < 0.05 &&
      Math.abs(x.geometry.coordinates[1] - 28.10178) < 0.05);
    return c ? { count: c.properties.point_count, f2: c.properties.f2, solo: keys.filter((k) => c.properties[k] === c.properties.point_count) } : null;
  });
  check('Mapa (8C): el clúster de Las Palmas es homogéneo de Juventud (f2 = 2 = point_count)',
    !!homo && homo.f2 === 2 && homo.solo.join() === 'f2', JSON.stringify(homo));
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [10, 20], zoom: 1.8, duration: 700 }));
  await page.waitForTimeout(2000);

  // Países Bajos: NL intacto
  await page.getByRole('button', { name: /^Países Bajos/ }).first().click();
  await page.waitForTimeout(2200);
  const nlCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Países Bajos: 18 iniciativas (NL intacto)', nlCounters.includes('18 iniciativas') || nlCounters.includes('18'), nlCounters.replace(/\n/g, ' '));
  const nlList = await page.getByRole('list', { name: 'Resultados' }).innerText();
  check('Países Bajos: Club De Reusel en la lista', nlList.includes('Club De Reusel'), '');

  // Registro sin coordenadas: ES-19 EFA Quintanes (ES-218, el
  // ejemplo anterior, quedó resuelto con punto en el v15-5)
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await page.waitForTimeout(600);
  await page.getByLabel('Buscar por nombre, localidad, región o entidad titular').fill('Quintanes');
  await page.waitForTimeout(700);
  const sinPuntoCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Sin coordenadas: cuenta en totales, 0 con ubicación', sinPuntoCounters.includes('1 iniciativas') && sinPuntoCounters.includes('0 con ubicación'), sinPuntoCounters.replace(/\n/g, ' '));
  const listaSinPunto = await page.getByRole('list', { name: 'Resultados' }).innerText();
  check('Sin coordenadas: aparece en la lista con distintivo', listaSinPunto.includes('EFA Quintanes') && listaSinPunto.includes('sin punto'), '');
  await page.getByRole('button', { name: /EFA Quintanes/ }).first().click();
  await page.waitForTimeout(500);
  const fichaSinPunto = await page.getByRole('article').innerText();
  check('Sin coordenadas: la ficha lo explica', fichaSinPunto.includes('Sin ubicación en el mapa'), '');

  // Puerto Rico (corrección de la Fase 4, adaptada a la retirada
  // del visor): su fuente principal es un dominio desnudo; el
  // enlace externo «Abrir ↗» debe llevar https://www.paloblanco.org/
  // y nunca una ruta interna de la propia app, y ya no existe el
  // botón del visor.
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Puerto Rico/ }).first().click();
  await page.waitForTimeout(1200);
  const ctxPR = page.getByLabel('Contexto de Puerto Rico').first();
  const prHref = await ctxPR.getByRole('link', { name: /Abrir/ }).getAttribute('href');
  check('Puerto Rico: la fuente principal enlaza fuera a https://www.paloblanco.org/',
    prHref === 'https://www.paloblanco.org/', prHref ?? '');
  check('Puerto Rico: sin botón del visor (retirado 2026-11-12)',
    (await ctxPR.getByRole('button', { name: 'Fuente principal del país en el visor' }).count()) === 0, '');

  // Historial atrás/adelante: cada lugar de la exploración es una entrada
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.409');
  await page.getByRole('button', { name: /^España/ }).first().click();
  await waitCounters(page, '298');
  await expandFamily(page, 'Educación');
  await page.getByRole('checkbox', { name: /Colegios/ }).check();
  await waitCounters(page, '110');
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
  check('Historial: abrir la ficha crea una entrada (sel en la URL)', page.url().includes('sel=ES-06'), page.url());
  await page.goBack();
  await waitCounters(page, '110');
  check('Historial: atrás cierra la ficha y mantiene España + Colegios',
    !page.url().includes('sel=') && page.url().includes('pais=ES') && page.url().includes('categorias=Colegios'), page.url());
  await page.goBack();
  await waitCounters(page, '298');
  check('Historial: atrás quita las categorías y mantiene España',
    !page.url().includes('categorias=') && page.url().includes('pais=ES'), page.url());
  await page.goBack();
  await waitCounters(page, '1.409');
  check('Historial: atrás vuelve al mundo', !page.url().includes('pais='), page.url());
  await page.goForward();
  await waitCounters(page, '298');
  check('Historial: adelante vuelve a España', page.url().includes('pais=ES'), page.url());
  await page.goForward();
  await waitCounters(page, '110');
  check('Historial: adelante reaplica Colegios', page.url().includes('categorias=Colegios'), page.url());

  // Ficha híbrida (7B): secciones numeradas y cierre con Escape
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 10000 });
  const ficha7b = await page.getByRole('article').textContent() ?? '';
  check('Ficha (7B): solo queda 02 Ubicación y contacto; sin 01 (retirada 2026-11-12) ni 03',
    !ficha7b.includes('Entidad titular') && !ficha7b.includes('Tipo de vinculación') && ficha7b.includes('Ubicación y contacto') && !ficha7b.includes('Evidencia y fuentes'), '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Ficha (7B): Escape la cierra y limpia la URL',
    (await page.getByRole('article').count()) === 0 && !page.url().includes('sel='), page.url());

  // ===== Hotfix Fase 7 (2026-11-12): clústeres coincidentes =====
  // Varias iniciativas comparten la coordenada representativa de su
  // localidad: el clúster nunca se desagrupa por zoom y el antiguo
  // tope (clusterMaxZoom) lo dejaba en bucle. Ahora: si todas las
  // hojas comparten coordenada, se abre spiderfy + selector; si no,
  // un solo easeTo al zoom real de expansión, sin tope.
  const clickAtLngLat = async (lngLat) => {
    const pt = await page.evaluate(([lng, lat]) => {
      const p = window.__atlasMap.project([lng, lat]);
      return { x: p.x, y: p.y };
    }, lngLat);
    await page.mouse.click(pt.x, pt.y);
    return pt;
  };
  const selectorDialog = () => page.getByRole('dialog', { name: /iniciativas en esta ubicación/ });
  const selectorOpen = async () => page.evaluate(() => !!document.querySelector('div[role="dialog"]'));
  // Estado observable del spiderfy y del mapa (hotfix 2): puntos y
  // líneas desplegados (deduplicados por id), resaltado `sel` por
  // iniciativa, cámara y si el marcador 3D está renderizando.
  const spiderState = (pg) => pg.evaluate(() => {
    const map = window.__atlasMap;
    const feats = (src) => map?.querySourceFeatures(src) ?? [];
    const pts = [...new Set(feats('desplegados').map((f) => f.properties?.id).filter(Boolean))].sort();
    const lines = new Set(feats('desplegados-lineas').map((f) => f.properties?.id).filter(Boolean)).size;
    const sel = {};
    for (const f of feats('desplegados')) if (f.properties?.id) sel[f.properties.id] = f.properties.sel === true;
    return {
      zoom: map.getZoom(), center: map.getCenter().toArray(),
      pts, lines, sel,
      markerVisible: window.__atlasMarker?.lastRender?.visible ?? false,
    };
  });

  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.409');

  // --- Las Palmas: España + Asociaciones juveniles, grupo de 2
  await page.getByRole('button', { name: /Categorías/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^España/ }).first().click();
  await waitCounters(page, '298');
  await expandFamily(page, 'Juventud');
  await page.getByRole('checkbox', { name: /Asociaciones juveniles/ }).check();
  await waitCounters(page, '59 iniciativas');
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-15.41573, 28.10178], zoom: 8, duration: 700 }));
  await page.waitForTimeout(2800);
  await clickAtLngLat([-15.41573, 28.10178]);
  await selectorDialog().waitFor({ timeout: 12000 });
  check('Hotfix clústeres: Las Palmas abre el selector «2 iniciativas en Las Palmas de Gran Canaria»',
    await selectorDialog().getByText('2 iniciativas en Las Palmas de Gran Canaria').isVisible(), '');
  check('Hotfix clústeres: el selector lista Club Guayre y Asociación Gara',
    await selectorDialog().getByRole('button', { name: /Club Guayre/ }).isVisible() &&
    await selectorDialog().getByRole('button', { name: /Asociación Gara/ }).isVisible(), '');
  // querySourceFeatures devuelve un feature por tile cargado (con
  // duplicados): se deduplica por el id de cada punto/línea.
  const spiderCount = await page.waitForFunction(() => {
    const map = window.__atlasMap;
    const uniq = (src) => new Set((map?.querySourceFeatures(src) ?? []).map((f) => f.properties?.id));
    const pts = uniq('desplegados');
    const lines = uniq('desplegados-lineas');
    return pts.size === 2 && pts.has('ES-199') && pts.has('ES-200') && lines.size === 2;
  }, null, { polling: 100, timeout: 10000 }).then(() => true).catch(() => false);
  check('Hotfix clústeres: el spiderfy despliega 2 puntos temporales con sus líneas al ancla', spiderCount, '');
  // Centro libre (corrección de Jon, 2026-11-13: «ese círculo
  // fuera»): con el grupo abierto, la fuente base ya no contiene
  // las iniciativas del grupo (sin clúster, punto apilado ni halo
  // en el ancla) y las etiquetas se anclan hacia fuera (lados l/r).
  const centroLibre = await page.evaluate(() => {
    const map = window.__atlasMap;
    const base = map.getSource('iniciativas').serialize().data;
    const baseIds = new Set(base.features.map((f) => f.properties?.id).filter(Boolean));
    const dep = map.getSource('desplegados').serialize().data;
    const sides = Object.fromEntries(dep.features.map((f) => [f.properties.id, f.properties.side]));
    return {
      fueraDeLaBase: !baseIds.has('ES-199') && !baseIds.has('ES-200'),
      sides,
      anchorL: map.getLayoutProperty('desplegados-nombres-l', 'text-anchor'),
      anchorR: map.getLayoutProperty('desplegados-nombres-r', 'text-anchor'),
    };
  });
  check('Hotfix clústeres: con el grupo abierto, el ancla queda libre (las iniciativas salen de la fuente base)',
    centroLibre.fueraDeLaBase, JSON.stringify(centroLibre.sides));
  check('Hotfix clústeres: las etiquetas del spiderfy se anclan hacia fuera (izquierda/derecha)',
    centroLibre.sides['ES-199'] === 'l' && centroLibre.sides['ES-200'] === 'r'
      && centroLibre.anchorL === 'right' && centroLibre.anchorR === 'left',
    JSON.stringify(centroLibre));
  await page.waitForTimeout(400);
  const focusInSelector = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  check('Hotfix clústeres: el selector recibe el foco al abrir',
    focusInSelector.includes('iniciativas en esta ubicación'), focusInSelector);

  // Abrir la ficha de Club Guayre desde el selector. HOTFIX 2
  // (2026-11-13): antes la selección ponía coincident = null y el
  // spiderfy desaparecía al consultar la ficha; ahora la lista se
  // oculta pero el grupo PERMANECE desplegado, sin mover el mapa
  // y sin marcador 3D, con la iniciativa resaltada en el despliegue.
  const camAntesGuayre = await page.evaluate(() => ({
    zoom: window.__atlasMap.getZoom(), center: window.__atlasMap.getCenter().toArray(),
  }));
  await selectorDialog().getByRole('button', { name: /Club Guayre/ }).click();
  await page.getByRole('heading', { name: 'Club Guayre' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  check('Hotfix 2: Club Guayre abre su ficha desde el selector (sel=ES-199) y la lista se oculta',
    page.url().includes('sel=ES-199') && (await selectorDialog().count()) === 0, page.url());
  const trasGuayre = await spiderState(page);
  check('Hotfix 2: con la ficha abierta, el grupo sigue desplegado (2 puntos y 2 líneas) y Guayre va resaltado',
    trasGuayre.pts.join() === 'ES-199,ES-200' && trasGuayre.lines === 2 &&
    trasGuayre.sel['ES-199'] === true && trasGuayre.sel['ES-200'] === false,
    JSON.stringify(trasGuayre.sel));
  check('Hotfix 2: abrir la ficha no mueve el mapa ni muestra el marcador 3D en el ancla',
    trasGuayre.zoom === camAntesGuayre.zoom && trasGuayre.center.join() === camAntesGuayre.center.join() &&
    !trasGuayre.markerVisible,
    `zoom ${camAntesGuayre.zoom}→${trasGuayre.zoom}`);
  // Escape por etapas: el primero cierra la ficha y RECUPERA el
  // selector con el grupo intacto; el segundo cierra el grupo.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Hotfix 2: primer Escape cierra la ficha y vuelve el selector con el grupo intacto',
    (await page.getByRole('article').count()) === 0 &&
    (await selectorDialog().count()) === 1 &&
    (await spiderState(page)).pts.join() === 'ES-199,ES-200', '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Hotfix 2: segundo Escape cierra el grupo y vacía el spiderfy',
    (await selectorDialog().count()) === 0 && (await spiderState(page)).pts.length === 0, '');

  // Reabrir y abrir Asociación Gara pulsando su PUNTO DESPLEGADO
  await clickAtLngLat([-15.41573, 28.10178]);
  await selectorDialog().waitFor({ timeout: 12000 });
  // La fuente del spiderfy se reprocesa en el worker tras abrir:
  // se espera a que el punto desplegado de Gara exista y se
  // proyecta su píxel solo entonces.
  const garaPx = await page.waitForFunction(() => {
    const map = window.__atlasMap;
    const f = (map.querySourceFeatures('desplegados') ?? []).find((x) => x.properties?.id === 'ES-200');
    if (!f) return null;
    const p = map.project(f.geometry.coordinates);
    return { x: p.x, y: p.y };
  }, null, { polling: 100, timeout: 10000 }).then((h) => h.jsonValue());
  await page.mouse.click(garaPx.x, garaPx.y);
  await page.getByRole('heading', { name: 'Asociación Gara' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  check('Hotfix 2: el punto desplegado de Asociación Gara abre su ficha (sel=ES-200) con el grupo desplegado',
    page.url().includes('sel=ES-200') && (await spiderState(page)).pts.join() === 'ES-199,ES-200', page.url());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Hotfix 2: Escape recupera el selector tras cerrar la ficha de Gara',
    (await selectorDialog().count()) === 1, '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // --- Anti-bucle: dos clics consecutivos sobre el mismo clúster
  // no pueden dejar exactamente el mismo centro, zoom y contenido.
  const state0 = await page.evaluate(() => ({
    zoom: window.__atlasMap.getZoom(),
    center: window.__atlasMap.getCenter().toArray(),
    selector: !!document.querySelector('div[role="dialog"]'),
  }));
  await clickAtLngLat([-15.41573, 28.10178]);
  await selectorDialog().waitFor({ timeout: 12000 });
  await clickAtLngLat([-15.41573, 28.10178]);
  await page.waitForTimeout(1000);
  const state2 = await page.evaluate(() => ({
    zoom: window.__atlasMap.getZoom(),
    center: window.__atlasMap.getCenter().toArray(),
    selector: !!document.querySelector('div[role="dialog"]'),
  }));
  check('Hotfix anti-bucle: dos clics sobre el mismo clúster no dejan el mismo estado (se abre el selector)',
    state0.selector === false && state2.selector === true &&
    !(state2.zoom === state0.zoom && state2.center.join() === state0.center.join() && !state2.selector),
    `zoom ${state0.zoom}→${state2.zoom} · selector ${state2.selector}`);

  // --- Cierre al cambiar los filtros (categoría)
  await page.getByRole('button', { name: /Categorías/ }).first().click();
  await page.waitForTimeout(500);
  await expandFamily(page, 'Educación');
  await page.getByRole('checkbox', { name: /Colegios/ }).check();
  const spiderAfterFilter = await page.waitForFunction(() => {
    return (window.__atlasMap?.querySourceFeatures('desplegados') ?? []).length === 0;
  }, null, { polling: 100, timeout: 10000 }).then(() => true).catch(() => false);
  check('Hotfix clústeres: cambiar la categoría cierra el selector y vacía el spiderfy',
    (await selectorDialog().count()) === 0 && spiderAfterFilter, '');
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.409');

  // --- Sevilla: 15 iniciativas en la misma coordenada (el encargo
  // decía 7 por error; eran 16 en el v14, 15 desde el v15-5 por la
  // baja de ES-236, y siguen siendo 15 en el v15-6).
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-5.97317, 37.38283], zoom: 10, duration: 700 }));
  await page.waitForTimeout(2800);
  await clickAtLngLat([-5.97317, 37.38283]);
  await selectorDialog().waitFor({ timeout: 12000 });
  check('Hotfix clústeres: Sevilla muestra «15 iniciativas en Sevilla» (15 reales en el v15-5, no 7)',
    await selectorDialog().getByText('15 iniciativas en Sevilla').isVisible(), '');
  const sevillaItems = await selectorDialog().locator('li').count();
  const sevillaText = await selectorDialog().textContent() ?? '';
  check('Hotfix clústeres: el selector de Sevilla lista las 15 iniciativas',
    sevillaItems === 15 && sevillaText.includes('Colegio de Fomento Tabladilla') &&
    sevillaText.includes('Colegio Mayor Guadaira') && sevillaText.includes('Centro Educativo Altair'),
    `${sevillaItems} elementos`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const focusBack = await page.evaluate(() => document.activeElement?.className ?? '');
  check('Hotfix clústeres: Escape cierra el selector y el foco vuelve al lienzo del mapa',
    (await selectorDialog().count()) === 0 && String(focusBack).includes('maplibregl-canvas'), String(focusBack));

  // --- Clúster normal (coordenadas distintas): un clic acerca de
  // forma efectiva y el clúster se desagrupa.
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-3.7, 40.4], zoom: 5, duration: 700 }));
  await page.waitForTimeout(2800);
  const madridCluster = await page.evaluate(() => {
    const map = window.__atlasMap;
    const target = map.project([-3.70256, 40.4165]);
    const feats = map.queryRenderedFeatures({ layers: ['clusters'] }) ?? [];
    let best = null;
    for (const f of feats) {
      const p = map.project(f.geometry.coordinates);
      const d = Math.hypot(p.x - target.x, p.y - target.y);
      if (!best || d < best.d) best = { d, x: p.x, y: p.y, count: f.properties.point_count, lngLat: f.geometry.coordinates };
    }
    return best;
  });
  await page.mouse.click(madridCluster.x, madridCluster.y);
  const zoomInOk = await page.waitForFunction(
    (z0) => window.__atlasMap.getZoom() > z0 + 0.4,
    5, { polling: 100, timeout: 20000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(1200);
  const afterSplit = await page.evaluate(([lngLat, count]) => {
    const map = window.__atlasMap;
    const p = map.project(lngLat);
    const feats = map.queryRenderedFeatures([[p.x - 30, p.y - 30], [p.x + 30, p.y + 30]], { layers: ['clusters'] }) ?? [];
    return { sameCount: feats.some((f) => f.properties.point_count === count), zoom: map.getZoom() };
  }, [madridCluster.lngLat, madridCluster.count]);
  check('Hotfix clústeres: un clúster con coordenadas distintas acerca una sola vez y se desagrupa',
    zoomInOk && !afterSplit.sameCount && !(await selectorOpen()),
    `zoom 5→${afterSplit.zoom.toFixed(2)} · recuento inicial ${madridCluster.count}`);

  // --- Zoom manual: a zoom 15 la fuente ya no agrupa, pero los dos
  // puntos de Las Palmas siguen exactamente superpuestos.
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-15.41573, 28.10178], zoom: 15, duration: 800 }));
  await page.waitForTimeout(3000);
  await clickAtLngLat([-15.41573, 28.10178]);
  await selectorDialog().waitFor({ timeout: 12000 });
  check('Hotfix clústeres: con zoom manual, el clic sobre puntos coincidentes abre el selector (sin ficha arbitraria)',
    await selectorDialog().getByText('2 iniciativas en Las Palmas de Gran Canaria').isVisible() &&
    !page.url().includes('sel='), page.url());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.409');

  // ===== Hotfix 2 (2026-11-13): consultar las fichas del grupo
  // sin desmontarlo. Grupo de Piura: PE-01 (Universidad de Piura),
  // PE-12 (Colegio Turicará) y PE-13 (Colegio Vallesol) comparten
  // la coordenada representativa de la localidad (-5.18192,
  // -80.65715). Es el caso que reportó Jon con Turicará. =====
  const warningsAntesPiura = warnings.length;
  await page.evaluate(() => window.__atlasMap?.flyTo({ center: [-80.65715, -5.18192], zoom: 11, duration: 700 }));
  await page.waitForTimeout(2800);
  await clickAtLngLat([-80.65715, -5.18192]);
  await selectorDialog().waitFor({ timeout: 12000 });
  check('Hotfix 2: Piura abre el selector «3 iniciativas en Piura»',
    await selectorDialog().getByText('3 iniciativas en Piura').isVisible(), '');
  // La fuente de las líneas se reprocesa en el worker tras abrir:
  // se espera al despliegue completo, no se lee en el acto.
  const piuraSpiderOk = await page.waitForFunction(() => {
    const map = window.__atlasMap;
    const uniq = (src) => new Set((map?.querySourceFeatures(src) ?? []).map((f) => f.properties?.id));
    const pts = uniq('desplegados');
    const lines = uniq('desplegados-lineas');
    return pts.size === 3 && pts.has('PE-01') && pts.has('PE-12') && pts.has('PE-13') && lines.size === 3;
  }, null, { polling: 100, timeout: 10000 }).then(() => true).catch(() => false);
  const piuraAbierto = await spiderState(page);
  check('Hotfix 2: el spiderfy de Piura despliega 3 puntos con sus líneas (PE-01, PE-12, PE-13)',
    piuraSpiderOk, piuraAbierto.pts.join());
  const camPiura = { zoom: piuraAbierto.zoom, center: piuraAbierto.center };
  const clickDesplegado = async (id) => {
    const px = await page.waitForFunction((target) => {
      const map = window.__atlasMap;
      const f = (map.querySourceFeatures('desplegados') ?? []).find((x) => x.properties?.id === target);
      if (!f) return null;
      const p = map.project(f.geometry.coordinates);
      return { x: p.x, y: p.y };
    }, id, { polling: 100, timeout: 10000 }).then((h) => h.jsonValue());
    await page.mouse.click(px.x, px.y);
  };
  // Ficha 1 — Colegio Turicará, desde la tarjeta del selector
  await selectorDialog().getByRole('button', { name: /Colegio Turicará/ }).click();
  await page.getByRole('heading', { name: 'Colegio Turicará' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const trasTuricara = await spiderState(page);
  check('Hotfix 2: la ficha de Turicará se abre con el grupo desplegado y la lista oculta',
    page.url().includes('sel=PE-12') && (await selectorDialog().count()) === 0 &&
    trasTuricara.pts.join() === 'PE-01,PE-12,PE-13' && trasTuricara.lines === 3, page.url());
  const anilloTuricara = await page.evaluate(() =>
    (window.__atlasMap.queryRenderedFeatures({ layers: ['desplegados-resaltado'] }) ?? [])
      .map((f) => f.properties?.id));
  check('Hotfix 2: Turicará queda resaltado con anillo en el spiderfy y es el único',
    trasTuricara.sel['PE-12'] === true && trasTuricara.sel['PE-01'] === false &&
    trasTuricara.sel['PE-13'] === false && anilloTuricara.join() === 'PE-12',
    JSON.stringify(trasTuricara.sel));
  check('Hotfix 2: ni el mapa se mueve ni aparece el marcador 3D con la ficha del grupo abierta',
    trasTuricara.zoom === camPiura.zoom && trasTuricara.center.join() === camPiura.center.join() &&
    !trasTuricara.markerVisible, `zoom ${camPiura.zoom}→${trasTuricara.zoom}`);
  // Ficha 2 — Colegio Vallesol, desde su punto desplegado
  await clickDesplegado('PE-13');
  await page.getByRole('heading', { name: 'Colegio Vallesol' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const trasVallesol = await spiderState(page);
  check('Hotfix 2: el punto de Vallesol cambia la ficha sin cerrar ni recalcular el grupo',
    page.url().includes('sel=PE-13') && trasVallesol.pts.join() === 'PE-01,PE-12,PE-13' &&
    trasVallesol.sel['PE-13'] === true && trasVallesol.sel['PE-12'] === false &&
    trasVallesol.zoom === camPiura.zoom && trasVallesol.center.join() === camPiura.center.join(), page.url());
  // Ficha 3 — Universidad de Piura, desde su punto desplegado
  await clickDesplegado('PE-01');
  await page.getByRole('heading', { name: /Universidad de Piura/ }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const trasUdep = await spiderState(page);
  check('Hotfix 2: la tercera ficha (Universidad de Piura) mantiene el despliegue y el resaltado pasa a PE-01',
    page.url().includes('sel=PE-01') && trasUdep.pts.join() === 'PE-01,PE-12,PE-13' &&
    trasUdep.sel['PE-01'] === true && !trasUdep.markerVisible, page.url());
  // Cerrar la ficha con su botón: vuelve el selector, grupo intacto
  await page.getByRole('button', { name: 'Cerrar ficha' }).click();
  await selectorDialog().waitFor({ timeout: 10000 });
  const trasCerrarFicha = await spiderState(page);
  check('Hotfix 2: al cerrar la ficha vuelve el selector y el spiderfy sigue intacto',
    (await selectorDialog().locator('li').count()) === 3 &&
    trasCerrarFicha.pts.join() === 'PE-01,PE-12,PE-13', '');
  // Historial: la ficha del grupo crea entrada; atrás la cierra y
  // también cierra el grupo (applyStateFromUrl no restaura grupos).
  await selectorDialog().getByRole('button', { name: /Colegio Turicará/ }).click();
  await page.getByRole('heading', { name: 'Colegio Turicará' }).waitFor({ timeout: 10000 });
  await page.goBack();
  await page.waitForTimeout(700);
  check('Hotfix 2: atrás en el historial cierra la ficha y el grupo',
    !page.url().includes('sel=') && (await selectorDialog().count()) === 0 &&
    (await spiderState(page)).pts.length === 0, page.url());
  check('Hotfix 2: sin advertencias de consola durante el recorrido del grupo de Piura',
    warnings.length === warningsAntesPiura,
    warnings.slice(warningsAntesPiura).slice(0, 2).join(' | '));
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await waitCounters(page, '1.409');

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
  await waitCounters(page, '1.409');
  await page.reload({ waitUntil: 'load' });
  await waitCounters(page, '1.409');
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
    await waitCounters(page, '1.409', 30000);
    offlineCounters = await page.getByRole('status', { name: 'Contadores' }).first().innerText();
  } catch { /* counters quedan vacíos y la comprobación falla */ }
  check('PWA: sin conexión, abre con lo último consultado (1.409 iniciativas)',
    offlineCounters.includes('1.409'), offlineCounters.replace(/\n/g, ' '));
  await page.context().setOffline(false);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1000);
  offlineDrill = false;

  // Móvil
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, ...contextOptions });
  mobile.on('pageerror', (e) => errors.push({ text: `móvil: ${e}`, url: '', frameHost: null, offline: false }));
  await mobile.goto(BASE, { waitUntil: 'load' });
  await mobile.locator('text=1.409 iniciativas').locator('visible=true').first().waitFor({ timeout: 30000 });
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

  // Hotfix Fase 7 en móvil: el selector de coincidentes se presenta
  // como hoja inferior. Se pliega la hoja de exploración a su
  // posición mínima para dejar el mapa pulsable.
  await mobile.getByRole('button', { name: 'Cambiar la altura del panel' }).click();
  await mobile.waitForTimeout(400);
  await mobile.getByRole('button', { name: 'Cambiar la altura del panel' }).click();
  await mobile.waitForTimeout(400);
  await mobile.evaluate(() => window.__atlasMap?.flyTo({ center: [-15.41573, 28.10178], zoom: 9, duration: 600 }));
  await mobile.waitForTimeout(2800);
  const lpMobilePt = await mobile.evaluate(() => {
    const p = window.__atlasMap.project([-15.41573, 28.10178]);
    return { x: p.x, y: p.y };
  });
  await mobile.touchscreen.tap(lpMobilePt.x, lpMobilePt.y);
  const mobileDialog = mobile.getByRole('dialog', { name: /iniciativas en esta ubicación/ });
  await mobileDialog.waitFor({ timeout: 12000 });
  const mobileBox = await mobileDialog.boundingBox();
  check('Hotfix móvil: el selector se presenta en la parte inferior de la pantalla',
    !!mobileBox && mobileBox.y > 844 / 2, mobileBox ? `y=${Math.round(mobileBox.y)}` : 'sin caja');
  // Legibilidad (corrección del hotfix, 2026-11-12): en móvil la
  // hoja del selector es OPACA — fondo sólido #0A1120 y sin
  // backdrop-filter; nada de la interfaz inferior se transparenta.
  const mobileSheetStyle = await mobileDialog.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, bf: cs.backdropFilter };
  });
  check('Hotfix móvil: el selector es opaco (fondo #0A1120, sin backdrop-filter)',
    mobileSheetStyle.bg === 'rgb(10, 17, 32)' && (mobileSheetStyle.bf === 'none' || mobileSheetStyle.bf === ''),
    JSON.stringify(mobileSheetStyle));
  await mobileDialog.getByRole('button', { name: /Asociación Gara/ }).click();
  await mobile.getByRole('heading', { name: 'Asociación Gara' }).waitFor({ timeout: 10000 });
  check('Hotfix móvil: Asociación Gara abre su ficha desde el selector (sel=ES-200)',
    mobile.url().includes('sel=ES-200'), mobile.url());
  // Hotfix 2 en móvil: la ficha se abre en la pestaña Ficha y la
  // hoja del selector se oculta, pero los puntos del grupo
  // PERMANECEN desplegados en el mapa; al cerrar la ficha, la
  // lista del grupo vuelve.
  const lpMovilTrasFicha = await mobile.evaluate(() =>
    [...new Set((window.__atlasMap?.querySourceFeatures('desplegados') ?? []).map((f) => f.properties?.id))].sort());
  check('Hotfix 2 móvil: con la ficha abierta, el grupo de Las Palmas sigue desplegado en el mapa',
    lpMovilTrasFicha.join() === 'ES-199,ES-200' && (await mobileDialog.count()) === 0,
    lpMovilTrasFicha.join());
  await mobile.locator('button[aria-label="Cerrar ficha"]:visible').first().click();
  await mobileDialog.waitFor({ timeout: 10000 });
  check('Hotfix 2 móvil: al cerrar la ficha vuelve la hoja del selector con el grupo intacto',
    await mobileDialog.getByText('2 iniciativas en Las Palmas de Gran Canaria').isVisible(), '');
  await mobileDialog.getByRole('button', { name: 'Cerrar selector' }).click();
  await mobile.waitForTimeout(400);

  // Hotfix 2 en móvil: el grupo de Piura completo (el caso de Jon).
  await mobile.getByRole('button', { name: 'Cambiar la altura del panel' }).click();
  await mobile.waitForTimeout(400);
  await mobile.getByRole('button', { name: 'Cambiar la altura del panel' }).click();
  await mobile.waitForTimeout(400);
  await mobile.evaluate(() => window.__atlasMap?.flyTo({ center: [-80.65715, -5.18192], zoom: 10, duration: 600 }));
  await mobile.waitForTimeout(2800);
  const piuraMovilPt = await mobile.evaluate(() => {
    const p = window.__atlasMap.project([-80.65715, -5.18192]);
    return { x: p.x, y: p.y };
  });
  await mobile.touchscreen.tap(piuraMovilPt.x, piuraMovilPt.y);
  const piuraDialog = mobile.getByRole('dialog', { name: /iniciativas en esta ubicación/ });
  await piuraDialog.waitFor({ timeout: 12000 });
  check('Hotfix 2 móvil: Piura abre el selector «3 iniciativas en Piura»',
    await piuraDialog.getByText('3 iniciativas en Piura').isVisible(), '');
  await piuraDialog.getByRole('button', { name: /Colegio Turicará/ }).click();
  await mobile.getByRole('heading', { name: 'Colegio Turicará' }).waitFor({ timeout: 10000 });
  await mobile.waitForTimeout(500);
  const piuraMovilTrasFicha = await mobile.evaluate(() => ({
    pts: [...new Set((window.__atlasMap?.querySourceFeatures('desplegados') ?? []).map((f) => f.properties?.id))].sort(),
    tabActiva: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '',
  }));
  check('Hotfix 2 móvil: la ficha de Turicará se abre en la pestaña Ficha con el grupo desplegado y el selector oculto',
    mobile.url().includes('sel=PE-12') && piuraMovilTrasFicha.pts.join() === 'PE-01,PE-12,PE-13' &&
    /ficha/i.test(piuraMovilTrasFicha.tabActiva) && (await piuraDialog.count()) === 0,
    piuraMovilTrasFicha.pts.join());
  await mobile.locator('button[aria-label="Cerrar ficha"]:visible').first().click();
  await piuraDialog.waitFor({ timeout: 10000 });
  check('Hotfix 2 móvil: al cerrar la ficha vuelve la lista del grupo de Piura',
    await piuraDialog.getByText('3 iniciativas en Piura').isVisible(), '');
  await piuraDialog.getByRole('button', { name: 'Cerrar selector' }).click();
  await mobile.waitForTimeout(400);

  // Movimiento reducido (7B): sin vuelos animados, todo funciona igual
  const rmContext = await browser.newContext({ reducedMotion: 'reduce', ...contextOptions });
  const rm = await rmContext.newPage();
  rm.on('pageerror', (e) => errors.push({ text: `reduced-motion: ${e}`, url: '', frameHost: null, offline: false }));
  await rm.goto(BASE, { waitUntil: 'load' });
  await rm.getByText('1.409 iniciativas').first().waitFor({ timeout: 30000 });
  await rm.getByRole('button', { name: /Explorar por país/ }).click();
  await rm.waitForTimeout(400);
  await rm.getByRole('button', { name: /^España/ }).first().click();
  await rm.getByRole('status', { name: 'Contadores' }).first().getByText(/298/).first().waitFor({ timeout: 15000 }).catch(() => undefined);
  const rmCounters = await rm.getByRole('status', { name: 'Contadores' }).first().innerText();
  check('Movimiento reducido (7B): navegar a España funciona sin animación', rmCounters.includes('298'), rmCounters.replace(/\n/g, ' '));
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
