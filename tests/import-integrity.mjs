/**
 * Prueba de integridad de la importación (Fase 3): si el Excel se
 * sustituye y los artefactos generados (catalog.json / sources.json) son
 * de la versión anterior, `npm run import` debe RECHAZAR la importación
 * y no crear ninguna corrida en import_runs.
 *
 * Qué hace:
 * 1. Cuenta las corridas registradas en la base (pg, DATABASE_URL o el
 *    valor por defecto de desarrollo).
 * 2. Copia el Excel a una copia de seguridad y le añade un byte (su
 *    SHA-256 cambia; el importador nunca parsea el Excel, solo lo
 *    hashea, así que el byte no afecta a nada más).
 * 3. Ejecuta el importador: debe salir con error y nombrar el hash.
 * 4. Comprueba que import_runs no ha crecido.
 * 5. Restaura el Excel y ejecuta el importador: debe funcionar.
 *
 * Uso: node tests/import-integrity.mjs   (requiere PostgreSQL accesible)
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// El CLI real de tsx, resuelto como módulo: el shim de node_modules/.bin
// no es ejecutable directamente en Windows (spawnSync devuelve ENOENT y
// status null). Se lanza siempre con el propio Node: process.execPath.
const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = join(ROOT, 'data/source/Directorio_Opus_Dei_MUNDIAL_v14.xlsx');
const BACKUP = join(tmpdir(), 'atlas-excel-backup.xlsx');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://atlas:atlas_dev@127.0.0.1:5432/atlas';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function runCount(client) {
  const r = await client.query('SELECT count(*)::int AS n FROM import_runs');
  return r.rows[0].n;
}

function runImporter() {
  return spawnSync(
    process.execPath,
    [tsxCli, join(ROOT, 'apps/api/src/import.ts')],
    { cwd: ROOT, encoding: 'utf-8', env: { ...process.env, DATABASE_URL } },
  );
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  const before = await runCount(client);
  check('Base accesible con corridas previas', before >= 1, `${before} corridas`);

  copyFileSync(XLSX, BACKUP);
  try {
    appendFileSync(XLSX, Buffer.from([0]));
    const rejected = runImporter();
    const out = `${rejected.stdout ?? ''}\n${rejected.stderr ?? ''}`;
    // Debe haber ARRANCADO y salido con error: un status null con error
    // (p. ej. ENOENT al lanzar el proceso) no es un rechazo válido.
    check('Excel nuevo + artefactos antiguos: importación rechazada',
      !rejected.error && rejected.status !== 0,
      rejected.error ? `error al lanzar: ${rejected.error.message}` : `código de salida ${rejected.status}`);
    check('El rechazo nombra el problema de hash', /sourceSha256|hash/i.test(out));
    check('No se creó ninguna corrida al rechazar', (await runCount(client)) === before);
  } finally {
    copyFileSync(BACKUP, XLSX);
  }

  const restoredSha = readFileSync(XLSX).length;
  const okRun = runImporter();
  check('Excel restaurado: la importación vuelve a funcionar', !okRun.error && okRun.status === 0,
    okRun.error ? `error al lanzar: ${okRun.error.message}` : `bytes del Excel restaurado: ${restoredSha}`);
  check('La corrida válida sí se registra', (await runCount(client)) === before + 1);
} finally {
  await client.end();
}

console.log(failures === 0 ? '\nIntegridad de importación: OK' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
