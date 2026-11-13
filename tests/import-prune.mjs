/**
 * Prueba permanente del modo de poda del importador en el escenario
 * MULTI-MANIFIESTO (Fase 8C; adaptada en la corrección de Jon de
 * 2026-11-13 a la migración v15-5 → v15-6). Sobre bases temporales
 * verifica el ciclo completo del modo de poda del importador
 * con los dos manifiestos versionados (apps/api/prune-manifest.
 * v15-5.json y prune-manifest.v15-6.json). La antigua invocación
 * `npm run import -- --prune-missing` NO propagaba el flag a
 * través de los dos niveles de npm (corrección operativa de la
 * Fase 8C, 2026-11-13): el comando público es ahora
 * `npm run import:prune`. La importación positiva v15-6 (paso 4)
 * se lanza por ESE camino del operador; el resto de ejecuciones
 * invocan el importador directamente, porque su objeto es el
 * comportamiento del importador y no el comando:
 *
 * 1. Punto de partida: restauración del dump acreditado del v14
 *    (1.382 / 942 / 2.626 / 2.164, 1 corrida).
 * 2. Base v15-5: importación con flag desde los artefactos del árbol
 *    (el importador SELECCIONA AUTOMÁTICAMENTE el manifiesto v15-5
 *    por el SHA entrante): poda { deleted: 5, ids v15-5,
 *    relationsDeleted: 5 } y totales 1.411 · 1.317 · 94 · 69 ·
 *    2.724 · 2.167.
 * 3. RECHAZO del manifiesto v15-5: con los artefactos ya en v15-6,
 *    forzar PRUNE_MANIFEST_PATH al manifiesto v15-5 ABORTA por SHA
 *    sin escribir: ni corrida nueva ni ningún total se mueve.
 * 4. Importación v15-6 con poda, lanzada por el CAMINO DEL
 *    OPERADOR (`npm run import:prune` desde la raíz del repo;
 *    selección automática del manifiesto v15-6 por SHA): la salida
 *    debe acreditar literalmente la clave `prune`, el manifiesto
 *    prune-manifest.v15-6.json, deleted 5 y relationsDeleted 7;
 *    poda exacta de las 5 bajas del manifiesto (CO-32, ES-153,
 *    ES-219, ES-230, MX-47), relaciones creadas 2.159 y totales en
 *    base 1.409 · 1.387 · 22 · 69 · 2.728 · 2.159.
 * 5. Las cinco bajas no existen ni tienen relaciones.
 * 6. Idempotencia: segunda importación v15-6 con flag: inserted 0,
 *    updated 0, deleted 0 y totales intactos.
 * 7. ABORTO ante una SEXTA baja: base restablecida a v15-5 y
 *    catálogo v15-6 manipulado (ES-01 retirada, solo en la copia
 *    intercambiada): la importación con flag ABORTA nombrando la
 *    baja fuera del manifiesto y la base queda EXACTAMENTE en su
 *    estado v15-5 (totales y corridas).
 * 8. Los artefactos del árbol quedan restaurados byte a byte a los
 *    certificados v15-5 (verificado por SHA-256) y la base temporal
 *    se elimina al terminar, salga como salga.
 *
 * Requisitos: PostgreSQL local accesible con un rol con CREATEDB
 * (PG_ADMIN_URL, por defecto el de desarrollo), el dump acreditado
 * del v14 (ATLAS_V14_DUMP, gzip de pg_dump), los artefactos v15-5
 * certificados en el árbol (apps/web/public/data/catalog.json y
 * data/generated/sources.json) y los de prueba v15-6 en
 * data/generated/v15-6-trial/. La prueba se niega a correr si los
 * hashes no son los certificados: nunca toca la base de producción
 * ni otra base que no sea la temporal que ella misma crea y borra.
 *
 * Uso: node tests/import-prune.mjs
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_URL = process.env.PG_ADMIN_URL ?? 'postgres://atlas:atlas_dev@127.0.0.1:5432/postgres';
const TEST_DB = 'atlas_prune_test';
const TEST_URL = process.env.PG_ADMIN_URL
  ? ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`)
  : `postgres://atlas:atlas_dev@127.0.0.1:5432/${TEST_DB}`;
const DUMP = process.env.ATLAS_V14_DUMP ?? '/tmp/atlas-pre-v15-5.sql.gz';
const MANIFEST5 = JSON.parse(readFileSync(join(ROOT, 'apps/api/prune-manifest.v15-5.json'), 'utf-8'));
const MANIFEST6 = JSON.parse(readFileSync(join(ROOT, 'apps/api/prune-manifest.v15-6.json'), 'utf-8'));
const MANIFEST5_PATH = join(ROOT, 'apps/api/prune-manifest.v15-5.json');
const CATALOG_PATH = join(ROOT, 'apps/web/public/data/catalog.json');
const SOURCES_PATH = join(ROOT, 'data/generated/sources.json');
const TRIAL_CATALOG = join(ROOT, 'data/generated/v15-6-trial/catalog.json');
const TRIAL_SOURCES = join(ROOT, 'data/generated/v15-6-trial/sources.json');
const CATALOG_BACKUP = join(tmpdir(), 'atlas-prune-catalog-backup.json');
const SOURCES_BACKUP = join(tmpdir(), 'atlas-prune-sources-backup.json');
// Hashes de fichero certificados de los artefactos v15-5 del árbol.
const TREE_CATALOG_SHA256 = 'dfbf5c7674351d61a5e36e75c1f97c4024fe52bc908107bd33c5c1800d59bd06';
const TREE_SOURCES_SHA256 = '257e8536545821e5a25dcabdeb0da00a73c2b4cbe627c445c9e03ded93853978';
const PRUNE5_IDS = [...MANIFEST5.ids].sort();
const PRUNE6_IDS = [...MANIFEST6.ids].sort();

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function runImporter(args = [], extraEnv = {}) {
  const env = { ...process.env, DATABASE_URL: TEST_URL };
  delete env.PRUNE_MANIFEST_PATH;
  Object.assign(env, extraEnv);
  return spawnSync(
    process.execPath,
    [tsxCli, join(ROOT, 'apps/api/src/import.ts'), ...args],
    { cwd: ROOT, encoding: 'utf-8', env },
  );
}

// Camino del operador: el comando público documentado
// (`npm run import:prune` en la raíz del repo), con la base
// temporal en el entorno, igual que lo ejecutaría quien importa
// a mano. Si el comando dejara de transmitir el flag, la salida
// no llevaría clave `prune` y el paso 4 fallaría.
function runImporterOperator(extraEnv = {}) {
  const env = { ...process.env, DATABASE_URL: TEST_URL };
  delete env.PRUNE_MANIFEST_PATH;
  Object.assign(env, extraEnv);
  return spawnSync('npm', ['run', 'import:prune'],
    { cwd: ROOT, encoding: 'utf-8', env });
}

function parseSummary(result) {
  return JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
}

function psql(db, sql) {
  const r = spawnSync('psql', [db === TEST_DB ? TEST_URL : ADMIN_URL, '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
    { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`psql falló: ${r.stderr}`);
  return r.stdout.trim();
}

function resetToV14() {
  psql('admin', `DROP DATABASE IF EXISTS ${TEST_DB}`);
  psql('admin', `CREATE DATABASE ${TEST_DB}`);
  const r = spawnSync('bash', ['-c', `gunzip -c "${DUMP}" | psql "${TEST_URL}" -v ON_ERROR_STOP=1 -q -o /dev/null`],
    { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`restauración falló: ${r.stderr.slice(-500)}`);
}

async function totals(client) {
  const r = (await client.query(`
    SELECT (SELECT count(*)::int FROM initiatives) AS initiatives,
           (SELECT count(*)::int FROM initiatives WHERE lat IS NOT NULL) AS located,
           (SELECT count(*)::int FROM initiatives WHERE lat IS NULL) AS unlocated,
           (SELECT count(DISTINCT country_code)::int FROM initiatives) AS countries,
           (SELECT count(*)::int FROM sources) AS sources,
           (SELECT count(*)::int FROM initiative_sources) AS relations,
           (SELECT count(*)::int FROM import_runs) AS runs`)).rows[0];
  return r;
}

function expectTotals(label, t, exp) {
  for (const [k, v] of Object.entries(exp)) {
    check(`${label}: ${k} = ${v}`, t[k] === v, `obtenido ${t[k]}`);
  }
}

function swapToTrial() {
  copyFileSync(TRIAL_CATALOG, CATALOG_PATH);
  copyFileSync(TRIAL_SOURCES, SOURCES_PATH);
}

function restoreTree() {
  copyFileSync(CATALOG_BACKUP, CATALOG_PATH);
  copyFileSync(SOURCES_BACKUP, SOURCES_PATH);
}

const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
let client = null;
async function freshClient() {
  if (client) await client.end().catch(() => {});
  client = new pg.Client({ connectionString: TEST_URL });
  await client.connect();
  return client;
}

// Copias de seguridad de los artefactos del árbol ANTES de tocar nada.
copyFileSync(CATALOG_PATH, CATALOG_BACKUP);
copyFileSync(SOURCES_PATH, SOURCES_BACKUP);

try {
  // Guardas: sin los artefactos certificados, esta prueba no
  // significa nada.
  check('El dump acreditado del v14 está disponible', existsSync(DUMP), DUMP);
  check('El catálogo del árbol es el certificado v15-5 (SHA-256 de fichero)',
    sha256File(CATALOG_PATH) === TREE_CATALOG_SHA256, sha256File(CATALOG_PATH));
  check('Las fuentes del árbol son las certificadas v15-5 (SHA-256 de fichero)',
    sha256File(SOURCES_PATH) === TREE_SOURCES_SHA256, sha256File(SOURCES_PATH));
  const treeCatalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  check('El catálogo del árbol declara el SHA del manifiesto v15-5',
    treeCatalog.meta.sourceSha256 === MANIFEST5.sha256, treeCatalog.meta.sourceSha256);
  const trialCatalog = JSON.parse(readFileSync(TRIAL_CATALOG, 'utf-8'));
  check('El catálogo de prueba declara el SHA del manifiesto v15-6',
    trialCatalog.meta.sourceSha256 === MANIFEST6.sha256, trialCatalog.meta.sourceSha256);
  check('Los manifiestos listan las bajas esperadas (5 + 5)',
    JSON.stringify(PRUNE5_IDS) === JSON.stringify(['CH-06', 'DO-01', 'ES-236', 'TW-01', 'TW-02'])
    && JSON.stringify(PRUNE6_IDS) === JSON.stringify(['CO-32', 'ES-153', 'ES-219', 'ES-230', 'MX-47']),
    `v15-5: ${PRUNE5_IDS.join(', ')} · v15-6: ${PRUNE6_IDS.join(', ')}`);

  // 1) Punto de partida: restauración v14.
  resetToV14();
  await freshClient();
  let t = await totals(client);
  expectTotals('v14 restaurado', t, { initiatives: 1382, located: 942, sources: 2626, relations: 2164, runs: 1 });

  // 2) Base v15-5: importación con flag; el manifiesto v15-5 se
  // selecciona automáticamente por el SHA entrante.
  const toV155 = runImporter(['--prune-missing']);
  check('v15-5: la importación con flag funciona', !toV155.error && toV155.status === 0,
    toV155.error ? toV155.error.message : `código ${toV155.status}\n${toV155.stderr ?? ''}`);
  const sum155 = parseSummary(toV155);
  check('v15-5: prune.deleted = 5 (manifiesto v15-5 auto-seleccionado)',
    sum155.prune?.deleted === 5 && JSON.stringify([...(sum155.prune?.ids ?? [])].sort()) === JSON.stringify(PRUNE5_IDS),
    JSON.stringify(sum155.prune));
  check('v15-5: prune.relationsDeleted = 5', sum155.prune?.relationsDeleted === 5,
    `${sum155.prune?.relationsDeleted}`);
  t = await totals(client);
  expectTotals('Base en v15-5', t,
    { initiatives: 1411, located: 1317, unlocated: 94, countries: 69, sources: 2724, relations: 2167, runs: 2 });

  // 3) Artefactos a v15-6 y RECHAZO del manifiesto v15-5 forzado:
  // aborta por SHA sin escribir; la base queda intacta.
  swapToTrial();
  const rejected = runImporter(['--prune-missing'], { PRUNE_MANIFEST_PATH: MANIFEST5_PATH });
  const rejectedOut = `${rejected.stdout ?? ''}\n${rejected.stderr ?? ''}`;
  check('Rechazo v15-5: forzar el manifiesto v15-5 contra el libro v15-6 ABORTA',
    !rejected.error && rejected.status !== 0, `código ${rejected.status}`);
  check('Rechazo v15-5: el motivo es la no coincidencia de SHA', /no coincide con el del manifiesto/.test(rejectedOut));
  t = await totals(client);
  expectTotals('Tras el rechazo v15-5, la base sigue en v15-5', t,
    { initiatives: 1411, located: 1317, sources: 2724, relations: 2167, runs: 2 });

  // 4) Importación v15-6 con poda por el CAMINO DEL OPERADOR:
  // `npm run import:prune` desde la raíz (selección automática
  // del manifiesto v15-6 por SHA). Se exige que la salida
  // acredite la poda literalmente: clave `prune`, manifiesto
  // v15-6, deleted 5 y relationsDeleted 7.
  const toV156 = runImporterOperator();
  check('v15-6 (operador): `npm run import:prune` funciona', !toV156.error && toV156.status === 0,
    toV156.error ? toV156.error.message : `código ${toV156.status}\n${toV156.stderr ?? ''}`);
  check('v15-6 (operador): la salida incluye la clave `prune`',
    /"prune"\s*:/.test(toV156.stdout ?? ''));
  check('v15-6 (operador): la salida nombra el manifiesto prune-manifest.v15-6.json',
    /prune-manifest\.v15-6\.json/.test(toV156.stdout ?? ''));
  const sum156 = parseSummary(toV156);
  check('v15-6: prune.deleted = 5 (manifiesto v15-6 auto-seleccionado)',
    sum156.prune?.deleted === 5 && JSON.stringify([...(sum156.prune?.ids ?? [])].sort()) === JSON.stringify(PRUNE6_IDS),
    JSON.stringify(sum156.prune));
  check('v15-6: prune.relationsDeleted = 7', sum156.prune?.relationsDeleted === 7,
    `${sum156.prune?.relationsDeleted}`);
  check('v15-6: el resumen acredita el manifiesto v15-6',
    (sum156.prune?.manifest ?? '').endsWith('prune-manifest.v15-6.json'), sum156.prune?.manifest ?? '');
  check('v15-6: relaciones creadas = 2.159', sum156.relations.created === 2159, `${sum156.relations.created}`);
  t = await totals(client);
  expectTotals('Base en v15-6', t,
    { initiatives: 1409, located: 1387, unlocated: 22, countries: 69, sources: 2728, relations: 2159, runs: 3 });

  // 5) Las cinco bajas no existen ni tienen relaciones.
  const gone = (await client.query('SELECT count(*)::int AS n FROM initiatives WHERE id = ANY($1)', [PRUNE6_IDS])).rows[0].n;
  const goneRel = (await client.query('SELECT count(*)::int AS n FROM initiative_sources WHERE initiative_id = ANY($1)', [PRUNE6_IDS])).rows[0].n;
  check('Las cinco bajas v15-6 no existen en initiatives', gone === 0, `${gone}`);
  check('Las cinco bajas v15-6 no tienen relaciones', goneRel === 0, `${goneRel}`);

  // 6) Idempotencia: segunda importación v15-6 con flag, todo a cero.
  const again = runImporter(['--prune-missing']);
  check('Segunda v15-6 con flag: funciona', !again.error && again.status === 0, `código ${again.status}`);
  const sumAgain = parseSummary(again);
  check('Segunda: initiatives inserted/updated/deleted = 0/0/0',
    sumAgain.initiatives.inserted === 0 && sumAgain.initiatives.updated === 0 && sumAgain.prune?.deleted === 0,
    JSON.stringify({ i: sumAgain.initiatives, prune: sumAgain.prune }));
  check('Segunda: sources y countries sin altas ni cambios',
    sumAgain.sources.inserted === 0 && sumAgain.sources.updated === 0
    && sumAgain.countries.inserted === 0 && sumAgain.countries.updated === 0);
  t = await totals(client);
  expectTotals('Tras la segunda v15-6', t, { initiatives: 1409, located: 1387, sources: 2728, relations: 2159 });

  // 7) ABORTO ante una sexta baja: base restablecida a v15-5,
  // artefactos de vuelta al árbol para reconstruirla, e
  // intercambio otra vez al v15-6 manipulado (ES-01 retirada solo
  // de la copia intercambiada; el trial del repo no se toca).
  await client.end().catch(() => {});
  restoreTree();
  resetToV14();
  await freshClient();
  const rebuild = runImporter(['--prune-missing']);
  check('Reconstrucción v15-5 para la prueba de aborto: funciona',
    !rebuild.error && rebuild.status === 0, `código ${rebuild.status}`);
  const beforeAbort = await totals(client);
  expectTotals('Base reconstruida en v15-5', beforeAbort,
    { initiatives: 1411, located: 1317, sources: 2724, relations: 2167, runs: 2 });
  swapToTrial();
  const manipulated = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  const victim = manipulated.initiatives.find((i) => i.id === 'ES-01');
  manipulated.initiatives = manipulated.initiatives.filter((i) => i.id !== 'ES-01');
  check('Catálogo manipulado: ES-01 retirada solo para esta prueba', !!victim);
  writeFileSync(CATALOG_PATH, JSON.stringify(manipulated));
  const aborted = runImporter(['--prune-missing']);
  const abortedOut = `${aborted.stdout ?? ''}\n${aborted.stderr ?? ''}`;
  check('Con una sexta baja fuera del manifiesto: la importación ABORTA',
    !aborted.error && aborted.status !== 0, `código ${aborted.status}`);
  check('El aborto nombra la baja inesperada (ES-01)', /ES-01/.test(abortedOut));
  const afterAbort = await totals(client);
  check('La base queda intacta tras el aborto (totales y corridas de v15-5)',
    afterAbort.initiatives === beforeAbort.initiatives && afterAbort.sources === beforeAbort.sources
    && afterAbort.relations === beforeAbort.relations && afterAbort.runs === beforeAbort.runs,
    JSON.stringify(afterAbort));
} finally {
  if (client) await client.end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
  // Los artefactos del árbol vuelven a los certificados v15-5,
  // verificado por hash, pase lo que pase.
  restoreTree();
}

check('Árbol restaurado: catalog.json vuelve al certificado v15-5 (SHA-256)',
  sha256File(CATALOG_PATH) === TREE_CATALOG_SHA256, sha256File(CATALOG_PATH));
check('Árbol restaurado: sources.json vuelve al certificado v15-5 (SHA-256)',
  sha256File(SOURCES_PATH) === TREE_SOURCES_SHA256, sha256File(SOURCES_PATH));

console.log(failures === 0 ? '\nPoda multi-manifiesto del importador: OK' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
