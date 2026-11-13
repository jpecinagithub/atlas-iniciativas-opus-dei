// Verificación contra PRODUCCIÓN (https://jpecina.duckdns.org/atlas/)
// tras un despliegue. No forma parte de la batería local.
//
// Requisito de red en esta VM: túnel SSH previo
//   ssh -F /home/hatch/.ssh/config -N -L 8443:127.0.0.1:443 oracle-jobforce
// y Chromium con --host-resolver-rules para resolver el nombre al
// túnel (el puerto 8443 mantiene un origen coherente entre visitas).
//
// Modos:
//   seed    — perfil persistente: instala el SW que producción
//             sirve AHORA (para preparar la prueba de migración).
//   migrate — el mismo perfil tras el despliegue: el SW debe
//             actualizarse a la nueva VERSION y la app seguir viva.
//   fresh   — perfil nuevo: recorrido público (mundo → país →
//             iniciativa), errores de consola y capturas públicas.
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'fase-7b');
const BASE = 'https://jpecina.duckdns.org:8443/atlas/';
const PROFILE = '/tmp/atlas-perfil-heredado';
const mode = process.argv[2];
// Titular esperado en portada; cambia con cada migración de datos
// (semilla v14 por defecto; tras migrar: ATLAS_HEADLINE='1.411 iniciativas').
const HEADLINE = process.env.ATLAS_HEADLINE ?? '1.382 iniciativas';
if (!['seed', 'migrate', 'fresh'].includes(mode)) throw new Error('Modo: seed | migrate | fresh');

const args = [
  '--no-sandbox',
  '--ignore-certificate-errors',
  '--host-resolver-rules=MAP jpecina.duckdns.org 127.0.0.1',
  '--proxy-server=direct://',
  '--proxy-bypass-list=*',
];

async function servedVersion(page) {
  return page.evaluate(async () => {
    const txt = await (await fetch('sw.js', { cache: 'no-store' })).text();
    return txt.match(/const VERSION = '([0-9a-f]+)'/)?.[1] ?? null;
  });
}
async function activeSw(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return { active: !!reg?.active, installing: !!reg?.installing, waiting: !!reg?.waiting };
  });
}

if (mode === 'seed' || mode === 'migrate') {
  const ctx = await chromium.launchPersistentContext(PROFILE, { args, viewport: { width: 1440, height: 900 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByText(HEADLINE).first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(4000);
  const version = await servedVersion(page);
  const sw = await activeSw(page);
  console.log(JSON.stringify({ mode, version, sw, errors }, null, 1));
  if (mode === 'migrate') {
    // El SW nuevo se instala al navegar; dar tiempo a la activación
    // y recargar para quedar bajo su control.
    await page.waitForTimeout(6000);
    await page.reload({ waitUntil: 'load' });
    await page.getByText(HEADLINE).first().waitFor({ timeout: 45000 });
    await page.waitForTimeout(3000);
    const sw2 = await activeSw(page);
    console.log(JSON.stringify({ mode: mode + '-tras-recarga', version: await servedVersion(page), sw: sw2, errors }, null, 1));
  }
  await ctx.close();
} else {
  rmSync('/tmp/atlas-perfil-nuevo', { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext('/tmp/atlas-perfil-nuevo', { args, viewport: { width: 1440, height: 900 } });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url().slice(0, 110)));
  page.on('response', (r) => { if (r.status() >= 400) errors.push('http ' + r.status() + ': ' + r.url().slice(0, 130)); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByText(HEADLINE).first().waitFor({ timeout: 45000 });
  await page.waitForTimeout(6500);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, 'publica-mundo.png') });
  await page.getByRole('button', { name: /Explorar por país/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^España/ }).first().click();
  await page.waitForTimeout(2600);
  await page.getByRole('button', { name: /países y categorías/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'publica-pais.png') });
  await page.getByRole('button', { name: /Categorías/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('checkbox', { name: /Colegios/ }).check();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Colegio Tajamar/ }).first().click();
  await page.getByRole('heading', { name: 'Colegio Tajamar' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, 'publica-iniciativa.png') });
  const version = await servedVersion(page);
  const counts = await page.evaluate(async () => (await (await fetch('api/health')).json()).counts);
  console.log(JSON.stringify({ mode, version, counts, errors }, null, 1));
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(BASE, { waitUntil: 'load' });
  await mob.getByRole('tab', { name: 'resultados' }).waitFor({ state: 'visible', timeout: 45000 });
  await mob.waitForTimeout(6000);
  await mob.screenshot({ path: join(OUT, 'publica-movil.png') });
  await ctx.close();
  if (errors.length) { console.error('ERRORES EN PRODUCCIÓN:', errors); process.exit(2); }
}
