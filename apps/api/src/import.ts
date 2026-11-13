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
 * - Integridad: catalog.json y sources.json declaran el SHA-256 del
 *   Excel del que proceden (sourceSha256, puesto por el pipeline). Si no
 *   coincide con el Excel presente, la importación se RECHAZA antes de
 *   abrir la transacción: ninguna corrida puede acreditar una versión
 *   que no es la importada.
 *
 * Modo de poda (opt-in, Fase 8B; selección por SHA en la Fase 8C):
 * con `--prune-missing` el importador puede BORRAR las iniciativas
 * ausentes, pero solo las listadas en el manifiesto versionado
 * apps/api/prune-manifest.<versión>.json QUE CORRESPONDA al SHA-256
 * del Excel entrante (se escanean los manifiestos presentes y se
 * elige el de hash coincidente; PRUNE_MANIFEST_PATH fuerza uno
 * concreto) y solo tras comprobar, antes de escribir nada, que:
 *   1. el SHA-256 del Excel entrante es EXACTAMENTE el del manifiesto;
 *   2. ningún ID del manifiesto aparece en el conjunto entrante;
 *   3. el conjunto de ausentes en base coincide con el manifiesto:
 *      ninguna baja adicional (de iniciativas, países o fuentes) fuera
 *      de él — si la hay, la corrida ABORTA sin escribir.
 * Upserts, recreación de relaciones y borrados van en la MISMA
 * transacción: cualquier discrepancia la revierte entera. La corrida
 * registra la poda (deleted, ids, relationsDeleted) en su resumen.
 * Sin el flag, el comportamiento es el de siempre: no se borra nada.
 * La poda es idempotente: repetir la corrida da deleted: 0.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool, ensureMigrated, repoRoot } from './db.js';

// Modo de poda: solo con el flag explícito. Sin él, nada se borra.
const PRUNE = process.argv.slice(2).includes('--prune-missing');
const PRUNE_MANIFEST_PATH = process.env.PRUNE_MANIFEST_PATH ?? null;

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

/**
 * Carga y valida UN manifiesto de poda desde su fichero. Un manifiesto
 * ausente o mal formado aborta la importación antes de abrir la
 * transacción.
 */
interface PruneManifest { file: string; sha256: string; ids: string[] }

function readPruneManifest(path: string): PruneManifest {
  if (!existsSync(path)) {
    throw new Error(`--prune-missing: no existe el manifiesto de poda (${path}). Importación abortada sin escribir.`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const ids: unknown = raw.ids;
  if (typeof raw.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(raw.sha256)
      || !Array.isArray(ids) || ids.length === 0
      || !ids.every((x) => typeof x === 'string' && x.length > 0)
      || new Set(ids as string[]).size !== (ids as string[]).length) {
    throw new Error(`--prune-missing: manifiesto de poda mal formado (${path}). Importación abortada sin escribir.`);
  }
  return { file: path, sha256: raw.sha256 as string, ids: ids as string[] };
}

/**
 * Selecciona el manifiesto de poda que corresponde al Excel entrante
 * (Fase 8C): sin PRUNE_MANIFEST_PATH se escanean los
 * apps/api/prune-manifest.*.json versionados y se elige el cuyo
 * sha256 coincide EXACTAMENTE con el del archivo entrante. Si ninguno
 * coincide, la poda aborta sin escribir: jamás se poda con el
 * manifiesto de otra versión. Sin el flag no se lee ningún manifiesto.
 */
function selectPruneManifest(root: string, fileSha: string): PruneManifest {
  if (PRUNE_MANIFEST_PATH) return readPruneManifest(PRUNE_MANIFEST_PATH);
  const dir = join(root, 'apps/api');
  const candidates = readdirSync(dir)
    .filter((f) => /^prune-manifest\..+\.json$/.test(f))
    .sort();
  const parsed = candidates.map((f) => readPruneManifest(join(dir, f)));
  const match = parsed.find((m) => m.sha256 === fileSha);
  if (!match) {
    throw new Error(
      `--prune-missing: ningún manifiesto de poda corresponde al SHA-256 del Excel entrante (${fileSha}); ` +
      `manifiestos conocidos: ${parsed.map((m) => `${m.sha256.slice(0, 8)}… (${m.file.split('/').pop()})`).join(', ') || 'ninguno'}. ` +
      'Poda abortada sin escribir.',
    );
  }
  return match;
}

async function main(): Promise<void> {
  const root = repoRoot();
  const catalog = JSON.parse(readFileSync(join(root, 'apps/web/public/data/catalog.json'), 'utf-8'));
  const sourcesFile = JSON.parse(readFileSync(join(root, 'data/generated/sources.json'), 'utf-8'));
  const sourceName: string = catalog.meta.sourceFile;
  const xlsx = readFileSync(join(root, 'data/source', sourceName));
  const fileSha = createHash('sha256').update(xlsx).digest('hex');
  // La selección del manifiesto va DESPUÉS de conocer el hash del
  // Excel entrante: cada versión se poda solo con su manifiesto.
  const manifest = PRUNE ? selectPruneManifest(root, fileSha) : null;

  // Integridad: los artefactos deben proceder EXACTAMENTE del Excel
  // presente. Si el Excel se sustituyó sin regenerar (`npm run data`),
  // importar acreditaría en import_runs una versión que no está en la
  // base. Se comprueba ANTES de migrar o abrir la transacción: si falta
  // el hash o difiere, se aborta sin crear ninguna corrida.
  const problems: string[] = [];
  if (!catalog.meta.sourceSha256) problems.push('catalog.json no declara sourceSha256');
  else if (catalog.meta.sourceSha256 !== fileSha) problems.push('catalog.json procede de otro Excel (hash distinto)');
  if (!sourcesFile.sourceSha256) problems.push('sources.json no declara sourceSha256');
  else if (sourcesFile.sourceSha256 !== fileSha) problems.push('sources.json procede de otro Excel (hash distinto)');
  if (problems.length > 0) {
    throw new Error(
      `Importación rechazada: ${problems.join('; ')}. ` +
      `El hash del Excel presente es ${fileSha}. Regenera los artefactos con «npm run data» y vuelve a intentarlo.`,
    );
  }

  // Modo de poda, comprobaciones previas SIN base de datos (antes de
  // migrar y de abrir la transacción): el SHA entrante debe ser el del
  // manifiesto y ningún ID del manifiesto puede venir en el archivo.
  if (manifest) {
    if (fileSha !== manifest.sha256) {
      throw new Error(
        `--prune-missing: el SHA-256 del Excel entrante (${fileSha}) no coincide con el del manifiesto ` +
        `(${manifest.sha256}). Poda abortada sin escribir.`,
      );
    }
    const present = manifest.ids.filter((id) => (catalog.initiatives as Row[]).some((i) => i.id === id));
    if (present.length > 0) {
      throw new Error(
        `--prune-missing: el manifiesto lista IDs que SÍ vienen en el archivo entrante (${present.join(', ')}). ` +
        'Poda abortada sin escribir.',
      );
    }
  }

  await ensureMigrated();

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

    // Modo de poda: DENTRO de la transacción pero ANTES de cualquier
    // escritura, el conjunto de ausentes (en base, no en el archivo)
    // debe coincidir con el manifiesto. Lo que se borrará es
    // exactamente ese conjunto intersectado con el manifiesto; una
    // baja adicional fuera de él (o cualquier ausente de países o
    // fuentes) aborta y la transacción se revierte sin haber escrito.
    let pruneIds: string[] = [];
    if (manifest) {
      const missingOf = async (table: string, keyField: string, incoming: string[]): Promise<string[]> => {
        const inDb = (await client.query(`SELECT ${keyField} AS k FROM ${table}`)).rows.map((r: any) => r.k as string);
        const seen = new Set(incoming);
        return inDb.filter((k) => !seen.has(k));
      };
      const missCountries = await missingOf('countries', 'code', countries.map((c) => c.code));
      const missSources = await missingOf('sources', 'id', sources.map((s) => s.id));
      const missInitiatives = await missingOf('initiatives', 'id', initiatives.map((i) => i.id));
      const inManifest = new Set(manifest.ids);
      const offManifest = [
        ...missCountries.map((k) => `país ${k}`),
        ...missSources.map((k) => `fuente ${k}`),
        ...missInitiatives.filter((k) => !inManifest.has(k)),
      ];
      if (offManifest.length > 0) {
        throw new Error(
          `--prune-missing: hay bajas en base FUERA del manifiesto (${offManifest.join(', ')}). ` +
          'Poda abortada: la transacción se revierte sin escribir.',
        );
      }
      pruneIds = manifest.ids.filter((id) => missInitiatives.includes(id));
      console.log(`--prune-missing: manifiesto verificado; bajas a podar: ${pruneIds.length} (${pruneIds.join(', ') || 'ninguna'})`);
    }

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

    // Modo de poda: en la MISMA transacción, borrar primero las
    // relaciones de las bajas (no heredadas por las entrantes, que ya
    // se recrearon arriba) y después las iniciativas. Las bajas NO
    // pasan a Histórico: desaparecen del conjunto certificado.
    let pruneSummary: { manifest: string; deleted: number; ids: string[]; relationsDeleted: number } | undefined;
    if (manifest) {
      let relationsDeleted = 0;
      let deleted = 0;
      if (pruneIds.length > 0) {
        relationsDeleted = (await client.query(
          'DELETE FROM initiative_sources WHERE initiative_id = ANY($1)', [pruneIds],
        )).rowCount ?? 0;
        deleted = (await client.query(
          'DELETE FROM initiatives WHERE id = ANY($1)', [pruneIds],
        )).rowCount ?? 0;
        if (deleted !== pruneIds.length) {
          throw new Error(
            `--prune-missing: se esperaban borrar ${pruneIds.length} iniciativas y se borraron ${deleted}. ` +
            'La transacción se revierte entera.',
          );
        }
      }
      pruneSummary = { manifest: manifest.file, deleted, ids: pruneIds, relationsDeleted };
    }

    const located = initiatives.filter((i) => i.lat !== null && i.lat !== undefined).length;
    const summary = {
      file: sourceName,
      fileSha256: fileSha,
      countries: { inserted: cRes.inserted, updated: cRes.updated, unchanged: cRes.unchanged, missingReported: cRes.missing },
      sources: { inserted: sRes.inserted, updated: sRes.updated, unchanged: sRes.unchanged, missingReported: sRes.missing },
      initiatives: { inserted: iRes.inserted, updated: iRes.updated, unchanged: iRes.unchanged, missingReported: iRes.missing },
      relations: { created: relCreated, ambiguousUrl: relAmbiguous, unmatchedFuente1: relUnmatched1, unmatchedFuente2: relUnmatched2 },
      ...(pruneSummary ? { prune: pruneSummary } : {}),
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
