/**
 * API del Atlas (Fase 3) — Fastify + PostgreSQL.
 *
 * Sirve los mismos datos que antes viajaban en el catalog.json estático,
 * ahora desde la base de datos importada:
 * - GET /api/catalog            catálogo ligero (sin textos documentales
 *                               largos: evidencia y doble comprobación van
 *                               solo en el detalle)
 * - GET /api/initiatives/:id    ficha completa + fuentes catalogadas
 * - GET /api/countries/:code    país con conteos calculados
 * - GET /api/sources            catálogo de fuentes (paginado, con búsqueda)
 * - GET /api/sources/:id        fuente + iniciativas relacionadas
 * - GET /api/health             estado y conteos
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool, ensureMigrated } from './db.js';

type Row = Record<string, any>;

function initiativeOut(r: Row, detail = false) {
  const out: Row = {
    id: r.id, name: r.name, category: r.category, sexRaw: r.sex_raw, recipients: r.recipients,
    country: r.country_name, countryCode: r.country_code, continent: r.continent,
    region: r.region, regionRaw: r.region_raw, locality: r.locality, localityRaw: r.locality_raw,
    address: r.address, addressRaw: r.address_raw, postalCode: r.postal_code, phone: r.phone,
    web: r.web, entity: r.entity, entityRaw: r.entity_raw, linkageType: r.linkage_type,
    verificationState: r.verification_state, activityStateRaw: r.activity_state_raw,
    activityState: r.activity_state, consultedAt: r.consulted_at,
    source1: r.source1_url, source2: r.source2_url, email: r.email, searchText: r.search_text,
    lat: r.lat, lng: r.lng, precision: r.precision, geocodingProvider: r.geocoding_provider,
    geonameId: r.geoname_id, geocodedAt: r.geocoded_at, queryUsed: r.query_used,
    reviewStatus: r.review_status,
  };
  if (detail) {
    out.evidence = r.evidence;
    out.doubleCheck = r.double_check;
  }
  return out;
}

function sourceOut(r: Row) {
  return {
    id: r.id, domain: r.domain, title: r.title, url: r.url, country: r.country,
    nature: r.nature, consultedAt: r.consulted_at, notes: r.notes,
  };
}

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

app.get('/api/health', async () => {
  const counts = await pool.query(`
    SELECT (SELECT count(*)::int FROM initiatives) AS initiatives,
           (SELECT count(*)::int FROM initiatives WHERE lat IS NOT NULL) AS located,
           (SELECT count(*)::int FROM countries) AS countries,
           (SELECT count(*)::int FROM sources) AS sources,
           (SELECT count(*)::int FROM initiative_sources) AS relations`);
  const run = await pool.query(
    'SELECT id, file_name, imported_at, summary FROM import_runs ORDER BY id DESC LIMIT 1');
  return { status: 'ok', counts: counts.rows[0], lastImport: run.rows[0] ?? null };
});

app.get('/api/catalog', async () => {
  const [countriesRes, initiativesRes, runRes, aggRes] = await Promise.all([
    pool.query(`
      SELECT c.*, COALESCE(cc.total, 0)::int AS computed_total,
             COALESCE(cc.located, 0)::int AS computed_located
      FROM countries c
      LEFT JOIN (
        SELECT country_code,
               count(*) AS total,
               count(*) FILTER (WHERE lat IS NOT NULL) AS located
        FROM initiatives GROUP BY country_code
      ) cc ON cc.country_code = c.code
      ORDER BY c.ord`),
    pool.query('SELECT * FROM initiatives ORDER BY ord'),
    pool.query('SELECT file_name, imported_at FROM import_runs ORDER BY id DESC LIMIT 1'),
    pool.query(`
      SELECT (SELECT count(*)::int FROM initiatives) AS total,
             (SELECT count(*)::int FROM initiatives WHERE lat IS NOT NULL) AS located,
             (SELECT array_agg(DISTINCT category ORDER BY category) FROM initiatives) AS categories,
             (SELECT array_agg(DISTINCT continent ORDER BY continent) FROM initiatives WHERE continent IS NOT NULL) AS continents,
             (SELECT array_agg(DISTINCT verification_state ORDER BY verification_state) FROM initiatives) AS states`),
  ]);
  // Conteos de verificación por país, calculados sin ambigüedad:
  const verif = await pool.query(`
    SELECT country_code, verification_state, count(*)::int AS n
    FROM initiatives GROUP BY country_code, verification_state`);
  const verifByCountry = new Map<string, Record<string, number>>();
  for (const r of verif.rows) {
    const m = verifByCountry.get(r.country_code) ?? {};
    m[r.verification_state] = r.n;
    verifByCountry.set(r.country_code, m);
  }
  const countries = countriesRes.rows.map((c) => ({
    name: c.name, code: c.code, continent: c.continent, circumscription: c.circumscription,
    presenceEvidence: c.presence_evidence, mainSource: c.main_source, note: c.note,
    declaredTotal: c.declared_total, declaredBreakdown: c.declared_breakdown,
    computedTotal: c.computed_total, computedLocated: c.computed_located,
    computedVerification: verifByCountry.get(c.code) ?? {},
    bbox: c.bbox,
  }));
  const agg = aggRes.rows[0];
  const run = runRes.rows[0];
  return {
    meta: {
      sourceFile: run?.file_name ?? null,
      generatedAt: run?.imported_at ?? null,
      totalInitiatives: agg.total,
      totalCountries: countries.length,
      categories: agg.categories ?? [],
      continents: agg.continents ?? [],
      verificationStates: agg.states ?? [],
      located: agg.located,
      attribution: 'Ubicaciones de localidad: GeoNames (CC BY 4.0), punto representativo de la localidad. Límites: Natural Earth.',
      servedBy: 'api',
    },
    countries,
    initiatives: initiativesRes.rows.map((r) => initiativeOut(r)),
  };
});

app.get('/api/initiatives/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const res = await pool.query('SELECT * FROM initiatives WHERE id = $1', [id]);
  if (res.rowCount === 0) return reply.code(404).send({ error: 'not_found', id });
  const rel = await pool.query(`
    SELECT is2.role, is2.match_method, s.*
    FROM initiative_sources is2 JOIN sources s ON s.id = is2.source_id
    WHERE is2.initiative_id = $1 ORDER BY is2.role`, [id]);
  const out = initiativeOut(res.rows[0], true);
  out.catalogedSources = rel.rows.map((r) => ({
    role: r.role, matchMethod: r.match_method, source: sourceOut(r),
  }));
  return out;
});

app.get('/api/countries/:code', async (req, reply) => {
  const { code } = req.params as { code: string };
  const res = await pool.query('SELECT * FROM countries WHERE code = $1', [code]);
  if (res.rowCount === 0) return reply.code(404).send({ error: 'not_found', code });
  const c = res.rows[0];
  const byCategory = await pool.query(`
    SELECT category, count(*)::int AS n, count(*) FILTER (WHERE lat IS NOT NULL)::int AS located
    FROM initiatives WHERE country_code = $1 GROUP BY category ORDER BY category`, [code]);
  const verif = await pool.query(`
    SELECT verification_state, count(*)::int AS n FROM initiatives
    WHERE country_code = $1 GROUP BY verification_state ORDER BY verification_state`, [code]);
  return {
    name: c.name, code: c.code, continent: c.continent, circumscription: c.circumscription,
    presenceEvidence: c.presence_evidence, mainSource: c.main_source, note: c.note,
    declaredTotal: c.declared_total, declaredBreakdown: c.declared_breakdown, bbox: c.bbox,
    computedTotal: byCategory.rows.reduce((a, r) => a + r.n, 0),
    byCategory: byCategory.rows,
    verification: Object.fromEntries(verif.rows.map((r) => [r.verification_state, r.n])),
  };
});

app.get('/api/sources', async (req) => {
  const q = req.query as { q?: string; limit?: string; offset?: string };
  const limit = Math.min(Math.max(parseInt(q.limit ?? '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(q.offset ?? '0', 10) || 0, 0);
  const where = q.q
    ? 'WHERE id ILIKE $1 OR title ILIKE $1 OR domain ILIKE $1 OR url ILIKE $1'
    : '';
  const params = q.q ? [`%${q.q}%`] : [];
  const total = await pool.query(`SELECT count(*)::int AS n FROM sources ${where}`, params);
  const items = await pool.query(
    `SELECT * FROM sources ${where} ORDER BY ord LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]);
  return { total: total.rows[0].n, limit, offset, items: items.rows.map(sourceOut) };
});

app.get('/api/sources/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const res = await pool.query('SELECT * FROM sources WHERE id = $1', [id]);
  if (res.rowCount === 0) return reply.code(404).send({ error: 'not_found', id });
  const rel = await pool.query(`
    SELECT i.id, i.name, is2.role FROM initiative_sources is2
    JOIN initiatives i ON i.id = is2.initiative_id
    WHERE is2.source_id = $1 ORDER BY i.id`, [id]);
  return { ...sourceOut(res.rows[0]), initiatives: rel.rows };
});

await ensureMigrated();
const port = parseInt(process.env.PORT ?? '3001', 10);
await app.listen({ port, host: '127.0.0.1' });
console.log(`Atlas API en http://127.0.0.1:${port}`);
