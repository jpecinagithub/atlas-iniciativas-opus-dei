import { Pool } from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://atlas:atlas_dev@127.0.0.1:5432/atlas';

export const pool = new Pool({ connectionString: DATABASE_URL });

/** Raíz del repo (apps/api/src o apps/api/dist → ../../..). */
export function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

let migrated = false;

/** Aplica las migraciones SQL de db/migrations que falten (idempotente). */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  const dir = join(repoRoot(), 'db', 'migrations');
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name as string),
  );
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(dir, file), 'utf-8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  }
  migrated = true;
}
