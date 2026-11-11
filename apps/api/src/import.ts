/**
 * Importador del Atlas (Fase 3): Excel v14 → PostgreSQL.
 *
 * Lee los artefactos que genera el pipeline de datos
 * (`apps/web/public/data/catalog.json` y `data/generated/sources.json`,
 * ambos derivados del Excel por tools/data/build_catalog.py) y los carga
 * en PostgreSQL en UNA transacción:
 * - Upsert por ID estable: reimportar el mismo archivo no duplica.
 * - Cada fila lleva un hash de contenido: el informe distingue altas,
 *   cambios y sin cambios comparando hashes.
 * - Los registros que están en la base y no en el archivo se INFORMAN
 *   como ausentes, pero NO se borran.
 * - Las relaciones iniciativa↔fuente se crean solo por coincidencia
 *   exacta de URL; si la URL está duplicada en el catálogo, la relación
 *   es ambigua y no se crea (se cuenta). El enlace se conserva siempre
 *   en la propia iniciativa.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool, ensureMigrated, repoRoot } from './db.js';

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

function hashRow(obj: Record<string, unknown>): string {
  return createHash('sha256').update(canonical(obj)).digest('hex');
}

type Row = Record<string, any>;

async function upsertTable(
  client: any,
  table: string,
  keyField: string,
  rows: Row[],
  columns: string[],
  runId: number,
): Promise<{ inserted: number; updated: number; unchanged: number; missing: string[] }> {
  const existing = new Map<string, string>(
    (await client.query(`SELECT ${keyField} AS k, row_hash FROM ${table}`)).rows.map(
      (r: any) => [r.k as string, r.row_hash as string],
    ),
  );
  let inserted = 0, updated = 0, unchanged = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row[keyField] as string;
    seen.add(key);
    const hash = hashRow(row);
    const prev = existing.get(key);
    if (prev === hash) { unchanged++; continue; }
    const values = columns.map((c) => (c === 'row_hash' ? hash : c === 'import_run_id' ? runId : row[c] ?? null));
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = columns
      .filter((c) => c !== keyField)
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT (${keyField}) DO UPDATE SET ${updates}, updated_at = now()`,
      values,
    );
    if (prev === undefined) inserted++; else updated++;
  }
  const missing = [...existing.keys()].filter((k) => !seen.has(k));
  return { inserted, updated, unchanged, missing };
}

async function main(): Promise<void> {
  await ensureMigrated();
  const root = repoRoot();
  const catalog = JSON.parse(readFileSync(join(root, 'apps/web/public/data/catalog.json'), 'utf-8'));
  const sourcesFile = JSON.parse(readFileSync(join(root, 'data/generated/sources.json'), 'utf-8'));
  const sourceName: string = catalog.meta.sourceFile;
  const xlsx = readFileSync(join(root, 'data/source', sourceName));
  const fileSha = createHash('sha256').update(xlsx).digest('hex');

  const countries: Row[] = catalog.countries.map((c: Row, idx: number) => ({
    ord: idx,
    code: c.code, name: c.name, continent: c.continent, circumscription: c.circumscription,
    presence_evidence: c.presenceEvidence, main_source: c.mainSource, note: c.note,
    // JSONB: se serializa explícitamente (pg convertiría un array JS en
    // array de Postgres, no en JSON).
    declared_total: c.declaredTotal,
    declared_breakdown: c.declaredBreakdown ? JSON.stringify(c.declaredBreakdown) : null,
    bbox: c.bbox ? JSON.stringify(c.bbox) : null,
  }));
  const sources: Row[] = sourcesFile.sources.map((s: Row, idx: number) => ({
    ord: idx,
    id: s.id, domain: s.domain, title: s.title, url: s.url, country: s.country,
    nature: s.nature, consulted_at: s.consultedAt, notes: s.notes,
  }));
  const initiatives: Row[] = catalog.initiatives.map((i: Row, idx: number) => ({
    ord: idx,
    id: i.id, name: i.name, category: i.category, sex_raw: i.sexRaw, recipients: i.recipients,
    country_code: i.countryCode, country_name: i.country, continent: i.continent,
    region: i.region, region_raw: i.regionRaw, locality: i.locality, locality_raw: i.localityRaw,
    address: i.address, address_raw: i.addressRaw, postal_code: i.postalCode, phone: i.phone,
    web: i.web, email: i.email, entity: i.entity, entity_raw: i.entityRaw,
    linkage_type: i.linkageType, evidence: i.evidence, verification_state: i.verificationState,
    activity_state: i.activityState, activity_state_raw: i.activityStateRaw,
    consulted_at: i.consultedAt, source1_url: i.source1, source2_url: i.source2,
    double_check: i.doubleCheck, search_text: i.searchText, lat: i.lat, lng: i.lng,
    precision: i.precision, geocoding_provider: i.geocodingProvider, geoname_id: i.geonameId,
    geocoded_at: i.geocodedAt, query_used: i.queryUsed, review_status: i.reviewStatus,
  }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const run = await client.query(
      'INSERT INTO import_runs (file_name, file_sha256) VALUES ($1, $2) RETURNING id',
      [sourceName, fileSha],
    );
    const runId = run.rows[0].id as number;

    const withMeta = (cols: string[]) => [...cols, 'row_hash', 'import_run_id'];
    const cRes = await upsertTable(client, 'countries', 'code', countries,
      withMeta(['ord', 'code', 'name', 'continent', 'circumscription', 'presence_evidence', 'main_source', 'note', 'declared_total', 'declared_breakdown', 'bbox']), runId);
    const sRes = await upsertTable(client, 'sources', 'id', sources,
      withMeta(['ord', 'id', 'domain', 'title', 'url', 'country', 'nature', 'consulted_at', 'notes']), runId);
    const iRes = await upsertTable(client, 'initiatives', 'id', initiatives,
      withMeta(['ord', 'id', 'name', 'category', 'sex_raw', 'recipients', 'country_code', 'country_name', 'continent',
        'region', 'region_raw', 'locality', 'locality_raw', 'address', 'address_raw', 'postal_code', 'phone',
        'web', 'email', 'entity', 'entity_raw', 'linkage_type', 'evidence', 'verification_state',
        'activity_state', 'activity_state_raw', 'consulted_at', 'source1_url', 'source2_url', 'double_check',
        'search_text', 'lat', 'lng', 'precision', 'geocoding_provider', 'geoname_id', 'geocoded_at',
        'query_used', 'review_status']), runId);

    // Relaciones por coincidencia exacta de URL
    const byUrl = new Map<string, string[]>();
    for (const s of sources) {
      if (!s.url) continue;
      byUrl.set(s.url, [...(byUrl.get(s.url) ?? []), s.id]);
    }
    let relCreated = 0, relAmbiguous = 0, relUnmatched1 = 0, relUnmatched2 = 0;
    const relations: [string, string, string][] = [];
    for (const i of initiatives) {
      for (const [role, url] of [['fuente_1', i.source1_url], ['fuente_2', i.source2_url]] as const) {
        if (!url) continue;
        const ids = byUrl.get(url) ?? [];
        if (ids.length === 1) { relations.push([i.id, ids[0], role]); relCreated++; }
        else if (ids.length > 1) relAmbiguous++;
        else if (role === 'fuente_1') relUnmatched1++; else relUnmatched2++;
      }
    }
    await client.query('DELETE FROM initiative_sources WHERE initiative_id = ANY($1)', [initiatives.map((i) => i.id)]);
    for (const [initiativeId, sourceId, role] of relations) {
      await client.query(
        'INSERT INTO initiative_sources (initiative_id, source_id, role) VALUES ($1, $2, $3)',
        [initiativeId, sourceId, role],
      );
    }

    const located = initiatives.filter((i) => i.lat !== null && i.lat !== undefined).length;
    const summary = {
      file: sourceName,
      fileSha256: fileSha,
      countries: { inserted: cRes.inserted, updated: cRes.updated, unchanged: cRes.unchanged, missingReported: cRes.missing },
      sources: { inserted: sRes.inserted, updated: sRes.updated, unchanged: sRes.unchanged, missingReported: sRes.missing },
      initiatives: { inserted: iRes.inserted, updated: iRes.updated, unchanged: iRes.unchanged, missingReported: iRes.missing },
      relations: { created: relCreated, ambiguousUrl: relAmbiguous, unmatchedFuente1: relUnmatched1, unmatchedFuente2: relUnmatched2 },
      located,
      unlocated: initiatives.length - located,
    };
    await client.query('UPDATE import_runs SET summary = $1 WHERE id = $2', [JSON.stringify(summary), runId]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ importRunId: runId, ...summary }, null, 1));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Importación fallida:', e instanceof Error ? e.message : e);
  process.exit(1);
});
