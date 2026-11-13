/**
 * Humo de la API de la Fase 3: comprueba los endpoints contra los conteos
 * conocidos del directorio v15-6 (Fase 8C). Requiere la API en marcha con la base de
 * datos importada (`npm run api` en otra terminal, tras `npm run import`).
 *
 * Uso: node tests/api-smoke.mjs [urlApi]   (defecto http://127.0.0.1:3001)
 */
const API = (process.argv[2] || process.env.ATLAS_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
async function get(path) {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

const health = await get('/api/health');
check('health: estado ok', health.status === 200 && health.body?.status === 'ok');
check('health: conteos 1409/70/2728/2159/1387',
  health.body?.counts?.initiatives === 1409 && health.body?.counts?.countries === 70 &&
  health.body?.counts?.sources === 2728 && health.body?.counts?.relations === 2159 &&
  health.body?.counts?.located === 1387, JSON.stringify(health.body?.counts));

const catalog = await get('/api/catalog');
check('catalog: totales y países',
  catalog.body?.meta?.totalInitiatives === 1409 && catalog.body?.meta?.totalCountries === 70 &&
  catalog.body?.initiatives?.length === 1409 && catalog.body?.countries?.length === 70);
check('catalog: servido por la API', catalog.body?.meta?.servedBy === 'api');
const tajamarLite = catalog.body?.initiatives?.find((i) => i.id === 'ES-06');
check('catalog ligero: sin textos documentales largos',
  tajamarLite && !('evidence' in tajamarLite) && !('doubleCheck' in tajamarLite));
const es = catalog.body?.countries?.find((c) => c.code === 'ES');
check('catalog: España calculada 298/289', es?.computedTotal === 298 && es?.computedLocated === 289);

const detail = await get('/api/initiatives/ES-06');
check('detalle ES-06: Tajamar con evidencia y doble comprobación',
  detail.body?.name?.includes('Tajamar') && typeof detail.body?.evidence === 'string' &&
  detail.body.evidence.length > 0 && typeof detail.body?.doubleCheck === 'string');
check('detalle ES-06: fuentes catalogadas relacionadas',
  Array.isArray(detail.body?.catalogedSources) && detail.body.catalogedSources.length >= 1,
  `${detail.body?.catalogedSources?.length ?? 0} relaciones`);
const detail404 = await get('/api/initiatives/XX-99');
check('detalle inexistente: 404', detail404.status === 404);

const country = await get('/api/countries/ES');
check('país ES: 298 y Colegios 110',
  country.body?.computedTotal === 298 &&
  country.body?.byCategory?.find((c) => c.category === 'Colegios')?.n === 110);

const sources = await get('/api/sources?limit=5');
check('fuentes: paginación con total 2728',
  sources.body?.total === 2728 && sources.body?.items?.length === 5);
const search = await get('/api/sources?q=opusdei.org&limit=3');
check('fuentes: búsqueda por dominio', search.body?.total > 0, `total ${search.body?.total}`);
const source = await get('/api/sources/F-0001');
check('fuente F-0001: con iniciativas relacionadas',
  source.body?.id === 'F-0001' && Array.isArray(source.body?.initiatives) && source.body.initiatives.length >= 1,
  `${source.body?.initiatives?.length ?? 0} iniciativas`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones PASS`);
process.exit(failed.length > 0 ? 1 : 0);
