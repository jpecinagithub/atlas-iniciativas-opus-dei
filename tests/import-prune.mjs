/**
 * Prueba del modo de poda del importador (Fase 8B, vía 1): sobre una
 * restauración temporal del v14, verifica el ciclo completo de
 * `npm run import -- --prune-missing` con el manifiesto
 * apps/api/prune-manifest.v15-5.json:
 *
 * 1. Punto de partida v14 restaurado: 1.382 / 942 / 2.626 / 2.164.
 * 2. Importación SIN flag con los artefactos v15-5: reproduce 1.416
 *    iniciativas y NO borra nada (las 5 bajas siguen presentes).
 * 3. Base restablecida al v14 e importación CON flag: exactamente
 *    1.411 · 1.317 · 94 · 69 países · 2.724 fuentes · 2.167 relaciones,
 *    con prune { deleted: 5, ids: [los cinco], relationsDeleted: 5 }.
 * 4. Los cinco IDs no existen y no cuentan en ningún agregado.
 * 5. Segunda importación CON flag: inserted 0, updated 0, deleted 0.
 * 6. Aborto: con UN ausente adicional fuera del manifiesto (catálogo
 *    manipulado solo en memoria de esta prueba, restaurado después y
 *    verificado por hash), la importación con flag ABORTA y la base
 *    queda intacta (sin corrida nueva, totales v14).
 * 7. La base temporal se elimina al terminar, salga como salga.
 *
 * Requisitos: PostgreSQL local accesible con un rol con CREATEDB
 * (PG_ADMIN_URL, por defecto el de desarrollo), el dump acreditado del
 * v14 (ATLAS_V14_DUMP, gzip de pg_dump) y los artefactos v15-5 ya
 * promovidos en el árbol (apps/web/public/data + data/generated). La
 * prueba se niega a correr si el catálogo no declara el SHA del
 * manifiesto: nunca toca la base de producción ni otra base que no sea
 * la temporal que ella misma crea y borra.
 *
 * Uso: node tests/import-prune.mjs
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync } from 'node:fs';
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
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'apps/api/prune-manifest.v15-5.json'), 'utf-8'));
const CATALOG_PATH = join(ROOT, 'apps/web/public/data/catalog.json');
const CATALOG_BACKUP = join(tmpdir(), 'atlas-catalog-backup.json');
const PRUNE_IDS = [...MANIFEST.ids].sort();

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function runImporter(args = []) {
  return spawnSync(
    process.execPath,
    [tsxCli, join(ROOT, 'apps/api/src/import.ts'), ...args],
    { cwd: ROOT, encoding: 'utf-8', env: { ...process.env, DATABASE_URL: TEST_URL } },
  );
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

const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
let client = null;
async function freshClient() {
  if (client) await client.end().catch(() => {});
  client = new pg.Client({ connectionString: TEST_URL });
  await client.connect();
  return client;
}

try {
  // Guarda de seguridad: los artefactos del árbol deben ser los del
  // manifiesto (v15-5 promovido); si no, esta prueba no significa nada.
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
  check('El catálogo del árbol declara el SHA del manifiesto',
    catalog.meta.sourceSha256 === MANIFEST.sha256, catalog.meta.sourceSha256);

  // 1) Punto de partida: restauración v14.
  resetToV14();
  await freshClient();
  let t = await totals(client);
  expectTotals('v14 restaurado', t, { initiatives: 1382, located: 942, sources: 2626, relations: 2164, runs: 1 });

  // 2) Sin flag: reproduce 1.416 y no borra.
  const noFlag = runImporter();
  check('Sin flag: la importación funciona', !noFlag.error && noFlag.status === 0,
    noFlag.error ? noFlag.error.message : `código ${noFlag.status}`);
  const sumNoFlag = JSON.parse(noFlag.stdout.slice(noFlag.stdout.indexOf('{')));
  check('Sin flag: no hay clave prune en el resumen', !('prune' in sumNoFlag));
  check('Sin flag: missingReported = las 5 del manifiesto',
    JSON.stringify([...sumNoFlag.initiatives.missingReported].sort()) === JSON.stringify(PRUNE_IDS),
    sumNoFlag.initiatives.missingReported.join(', '));
  t = await totals(client);
  expectTotals('Tras importar sin flag', t, { initiatives: 1416, located: 1322, sources: 2724, relations: 2172 });
  const stillThere = (await client.query('SELECT count(*)::int AS n FROM initiatives WHERE id = ANY($1)', [PRUNE_IDS])).rows[0].n;
  check('Sin flag: las 5 bajas siguen presentes', stillThere === 5, `${stillThere}`);

  // 3) Con flag desde v14: cifras certificadas exactas y poda registrada.
  await client.end().catch(() => {});
  resetToV14();
  await freshClient();
  const withFlag = runImporter(['--prune-missing']);
  check('Con flag: la importación funciona', !withFlag.error && withFlag.status === 0,
    withFlag.error ? withFlag.error.message : `código ${withFlag.status}\n${withFlag.stdout}\n${withFlag.stderr}`);
  const sum = JSON.parse(withFlag.stdout.slice(withFlag.stdout.indexOf('{')));
  check('Con flag: prune.deleted = 5', sum.prune?.deleted === 5, JSON.stringify(sum.prune));
  check('Con flag: prune.ids = los cinco del manifiesto',
    JSON.stringify([...(sum.prune?.ids ?? [])].sort()) === JSON.stringify(PRUNE_IDS), (sum.prune?.ids ?? []).join(', '));
  check('Con flag: prune.relationsDeleted = 5', sum.prune?.relationsDeleted === 5, `${sum.prune?.relationsDeleted}`);
  check('Con flag: relaciones creadas = 2.167', sum.relations.created === 2167, `${sum.relations.created}`);
  t = await totals(client);
  expectTotals('Tras importar con flag', t,
    { initiatives: 1411, located: 1317, unlocated: 94, countries: 69, sources: 2724, relations: 2167 });

  // 4) Los cinco IDs no existen ni cuentan.
  const gone = (await client.query('SELECT count(*)::int AS n FROM initiatives WHERE id = ANY($1)', [PRUNE_IDS])).rows[0].n;
  const goneRel = (await client.query('SELECT count(*)::int AS n FROM initiative_sources WHERE initiative_id = ANY($1)', [PRUNE_IDS])).rows[0].n;
  check('Los cinco IDs no existen en initiatives', gone === 0, `${gone}`);
  check('Los cinco IDs no tienen relaciones', goneRel === 0, `${goneRel}`);

  // 5) Idempotencia: segunda corrida con flag, todo a cero.
  const again = runImporter(['--prune-missing']);
  check('Segunda con flag: funciona', !again.error && again.status === 0, `código ${again.status}`);
  const sum2 = JSON.parse(again.stdout.slice(again.stdout.indexOf('{')));
  check('Segunda: initiatives inserted/updated/deleted = 0/0/0',
    sum2.initiatives.inserted === 0 && sum2.initiatives.updated === 0 && sum2.prune?.deleted === 0,
    JSON.stringify({ i: sum2.initiatives, prune: sum2.prune }));
  check('Segunda: sources y countries sin altas ni cambios',
    sum2.sources.inserted === 0 && sum2.sources.updated === 0 && sum2.countries.inserted === 0 && sum2.countries.updated === 0);
  t = await totals(client);
  expectTotals('Tras la segunda con flag', t, { initiatives: 1411, located: 1317, relations: 2167 });

  // 6) Aborto por baja inesperada: se retira UN registro más del
  // catálogo (copia byte a byte guardada y restaurada; el hash final
  // debe volver a ser el certificado).
  await client.end().catch(() => {});
  resetToV14();
  await freshClient();
  const before = await totals(client);
  copyFileSync(CATALOG_PATH, CATALOG_BACKUP);
  try {
    const manipulated = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
    const victim = manipulated.initiatives.find((i) => i.id === 'ES-01');
    manipulated.initiatives = manipulated.initiatives.filter((i) => i.id !== 'ES-01');
    check('Catálogo manipulado: ES-01 retirado solo para esta prueba', !!victim);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(CATALOG_PATH, JSON.stringify(manipulated));
    const aborted = runImporter(['--prune-missing']);
    const out = `${aborted.stdout ?? ''}\n${aborted.stderr ?? ''}`;
    check('Con una baja fuera del manifiesto: la importación ABORTA',
      !aborted.error && aborted.status !== 0, `código ${aborted.status}`);
    check('El aborto nombra la baja inesperada (ES-01)', /ES-01/.test(out));
  } finally {
    copyFileSync(CATALOG_BACKUP, CATALOG_PATH);
  }
  const restoredHash = createHash('sha256').update(readFileSync(CATALOG_PATH)).digest('hex');
  check('Catálogo restaurado byte a byte (SHA-256 certificado)',
    restoredHash === 'dfbf5c7674351d61a5e36e75c1f97c4024fe52bc908107bd33c5c1800d59bd06', restoredHash);
  const after = await totals(client);
  check('La base queda intacta tras el aborto (totales v14, sin corrida nueva)',
    after.initiatives === before.initiatives && after.relations === before.relations && after.runs === before.runs,
    JSON.stringify(after));
} finally {
  if (client) await client.end().catch(() => {});
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
}

console.log(failures === 0 ? '\nPoda del importador: OK' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
