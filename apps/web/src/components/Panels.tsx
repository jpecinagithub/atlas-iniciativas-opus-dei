import { useEffect, useMemo, useState } from 'react';
import { useAtlas, filterInitiatives } from '../store';
import { categoryColor, RECIPIENT_LABELS } from '../categories';
import type { Initiative } from '../types';
import { fmt } from '../format';

const PAGE = 120;

export function precisionLabel(i: Initiative): string {
  if (i.lat === null || i.lng === null) return 'Sin ubicación en el mapa';
  if (i.precision === 'locality') return 'Ubicación aproximada (localidad)';
  if (i.precision === 'address') return 'Ubicación por dirección';
  return `Ubicación: ${i.precision}`;
}

function verificationBadge(state: string) {
  const styles: Record<string, string> = {
    'Confirmado y contrastado': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'Confirmado con datos parciales': 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    'Confirmado': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'Pendiente': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'Histórico': 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[state] ?? styles['Pendiente']}`}>
      {state}
    </span>
  );
}

export function FiltersPanel() {
  const catalog = useAtlas((s) => s.catalog);
  const countryCode = useAtlas((s) => s.countryCode);
  const categories = useAtlas((s) => s.categories);
  const setCountry = useAtlas((s) => s.setCountry);
  const toggleCategory = useAtlas((s) => s.toggleCategory);
  const setCategories = useAtlas((s) => s.setCategories);
  const [countrySearch, setCountrySearch] = useState('');

  const countryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of catalog?.countries ?? []) counts.set(c.code, c.computedTotal);
    return counts;
  }, [catalog]);

  const categoryCounts = useMemo(() => {
    if (!catalog) return new Map<string, number>();
    const base = filterInitiatives(catalog.initiatives, countryCode, [], '');
    const counts = new Map<string, number>();
    for (const i of base) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return counts;
  }, [catalog, countryCode]);

  if (!catalog) return null;
  const countries = catalog.countries
    .filter((c) => c.name.toLowerCase().includes(countrySearch.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <div className="space-y-5">
      <section aria-label="País o territorio">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">País o territorio</h3>
        <input
          value={countrySearch}
          onChange={(e) => setCountrySearch(e.target.value)}
          placeholder="Buscar país…"
          className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
          aria-label="Buscar país"
        />
        <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => setCountry(null)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${countryCode === null ? 'bg-sky-500/20 text-sky-200' : 'text-slate-200 hover:bg-slate-800'}`}
            aria-pressed={countryCode === null}
          >
            <span>Todo el mundo</span>
            <span className="text-xs text-slate-400">{catalog.meta.totalInitiatives}</span>
          </button>
          {countries.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCountry(c.code)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${countryCode === c.code ? 'bg-sky-500/20 text-sky-200' : 'text-slate-200 hover:bg-slate-800'}`}
              aria-pressed={countryCode === c.code}
            >
              <span>{c.name}</span>
              <span className="text-xs text-slate-400">{countryCounts.get(c.code) ?? 0}</span>
            </button>
          ))}
          {countries.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Sin países con ese nombre.</p>}
        </div>
      </section>

      <section aria-label="Categorías">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Categorías</h3>
          {categories.length > 0 && (
            <button type="button" onClick={() => setCategories([])} className="text-xs text-sky-300 hover:underline">
              Quitar todas
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {catalog.meta.categories.map((cat) => {
            const active = categories.includes(cat);
            const count = categoryCounts.get(cat) ?? 0;
            return (
              <label
                key={cat}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? 'bg-slate-800 text-slate-100' : 'text-slate-300 hover:bg-slate-800/60'} ${count === 0 ? 'opacity-45' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleCategory(cat)}
                  className="h-4 w-4 shrink-0 accent-sky-400"
                />
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(cat) }} aria-hidden />
                <span className="flex-1">{cat}</span>
                <span className="text-xs text-slate-500">{count}</span>
              </label>
            );
          })}
        </div>
        {countryCode && categories.length > 0 && (
          <button
            type="button"
            onClick={() => setCountry(null)}
            className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-sky-300 hover:bg-slate-800"
          >
            Ver esta categoría en el mundo
          </button>
        )}
      </section>
    </div>
  );
}

export function ResultsList({ onPick }: { onPick?: () => void }) {
  const catalog = useAtlas((s) => s.catalog);
  const countryCode = useAtlas((s) => s.countryCode);
  const categories = useAtlas((s) => s.categories);
  const query = useAtlas((s) => s.query);
  const selectedId = useAtlas((s) => s.selectedId);
  const select = useAtlas((s) => s.select);
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(
    () => (catalog ? filterInitiatives(catalog.initiatives, countryCode, categories, query)
      .sort((a, b) => a.country.localeCompare(b.country, 'es') || (a.locality ?? '').localeCompare(b.locality ?? '', 'es') || a.name.localeCompare(b.name, 'es')) : []),
    [catalog, countryCode, categories, query],
  );

  if (!catalog) return null;
  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center" role="status">
        <p className="font-medium text-slate-200">Sin resultados con estos filtros</p>
        <p className="mt-1 text-sm text-slate-400">Prueba a quitar una categoría, cambiar el país o borrar la búsqueda.</p>
      </div>
    );
  }
  return (
    <div>
      <ul className="space-y-1.5" aria-label="Resultados">
        {filtered.slice(0, shown).map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => { select(i.id); onPick?.(); }}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${selectedId === i.id ? 'border-sky-400/60 bg-sky-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}
              aria-current={selectedId === i.id}
            >
              <span className="flex items-start gap-2.5">
                <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(i.category) }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-100">{i.name}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {i.category} · {[i.locality, i.country].filter(Boolean).join(', ')}
                  </span>
                </span>
                {i.lat === null && (
                  <span className="shrink-0 rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400" title="Este registro no se representa como punto en el mapa">
                    sin punto
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {filtered.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          Mostrar más ({filtered.length - shown} restantes)
        </button>
      )}
    </div>
  );
}

export function DetailPanel() {
  const catalog = useAtlas((s) => s.catalog);
  const selectedId = useAtlas((s) => s.selectedId);
  const select = useAtlas((s) => s.select);
  const detail = useAtlas((s) => (selectedId ? s.details[selectedId] : undefined));
  const detailFailedFor = useAtlas((s) => s.detailFailedFor);
  const loadDetail = useAtlas((s) => s.loadDetail);
  const openViewer = useAtlas((s) => s.openViewer);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);
  if (!catalog || !selectedId) return null;
  const rec = catalog.initiatives.find((i) => i.id === selectedId);
  if (!rec) return null;
  const colocated = rec.lat !== null && rec.lng !== null
    ? catalog.initiatives.filter((i) => i.id !== rec.id && i.lat === rec.lat && i.lng === rec.lng)
    : [];

  return (
    <article aria-label={`Ficha de ${rec.name}`} className="space-y-4">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-snug text-slate-50">{rec.name}</h2>
          <button
            type="button"
            onClick={() => select(null)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
            aria-label="Cerrar ficha"
          >
            ✕
          </button>
        </div>
        <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-300">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: categoryColor(rec.category) }} aria-hidden />
          {rec.category}
          <span className="text-slate-500">· {rec.id}</span>
        </p>
      </header>

      <dl className="space-y-2.5 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Lugar</dt>
          <dd className="text-slate-200">
            {[rec.locality, rec.region, rec.country].filter(Boolean).join(', ') || rec.country}
            {rec.address && <span className="block text-slate-400">{rec.address}{rec.postalCode ? ` · CP ${rec.postalCode}` : ''}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Ubicación en el mapa</dt>
          <dd className="text-slate-200">
            {precisionLabel(rec)}
            {rec.lat !== null && rec.geocodingProvider && (
              <span className="block text-xs text-slate-500">
                Punto representativo de la localidad ({rec.geocodingProvider}
                {rec.geonameId ? `, GeoNames ${rec.geonameId}` : ''}). No es la dirección exacta.
              </span>
            )}
            {rec.lat === null && (
              <span className="block text-xs text-slate-500">
                Este registro cuenta en la lista y en los totales, pero no se dibuja como punto: su ubicación no se ha resuelto de forma verificable.
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Destinatarios</dt>
          <dd className="text-slate-200">{rec.sexRaw ?? 'No consta'}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          {verificationBadge(rec.verificationState)}
          <span className="inline-block rounded-full border border-slate-600 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            Actividad: {rec.activityStateRaw ?? rec.activityState}
          </span>
        </div>
        {rec.entity && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Entidad titular</dt>
            <dd className="text-slate-200">{rec.entity}</dd>
          </div>
        )}
        {rec.linkageType && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Tipo de vinculación</dt>
            <dd className="text-slate-200">{rec.linkageType}</dd>
          </div>
        )}
        {(rec.web || rec.phone || rec.email) && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Contacto publicado</dt>
            <dd className="space-y-0.5 text-slate-200">
              {rec.web && <a className="block truncate text-sky-300 hover:underline" href={rec.web} target="_blank" rel="noreferrer">{rec.web}</a>}
              {rec.web && (
                <button type="button" onClick={() => openViewer(rec.web!)} className="text-xs font-medium text-sky-300 hover:underline">
                  Ver la web en el visor
                </button>
              )}
              {rec.phone && <span className="block">{rec.phone}</span>}
              {rec.email && <span className="block">{rec.email}</span>}
            </dd>
          </div>
        )}
        {rec.consultedAt && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Fecha de consulta</dt>
            <dd className="text-slate-200">{rec.consultedAt}</dd>
          </div>
        )}
        {(rec.source1 || rec.source2) && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Fuentes</dt>
            <dd className="space-y-0.5">
              {rec.source1 && <a className="block truncate text-sky-300 hover:underline" href={rec.source1} target="_blank" rel="noreferrer">Fuente 1</a>}
              {rec.source2 && <a className="block truncate text-sky-300 hover:underline" href={rec.source2} target="_blank" rel="noreferrer">Fuente 2</a>}
            </dd>
          </div>
        )}
      </dl>

      {/* Documentación completa (Fase 4): llega del detalle de la API. La
          ficha básica de arriba es la del catálogo y se ve al instante. */}
      {!detail && detailFailedFor !== rec.id && (
        <p className="text-xs text-slate-500" role="status">Cargando la documentación completa…</p>
      )}
      {!detail && detailFailedFor === rec.id && (
        <p className="text-xs text-slate-500">La documentación completa no está disponible ahora; la ficha básica es la del catálogo.</p>
      )}
      {detail?.evidence && (
        <section aria-label="Evidencia de vinculación">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Evidencia de vinculación</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{detail.evidence}</p>
        </section>
      )}
      {detail?.doubleCheck && (
        <section aria-label="Doble comprobación">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Doble comprobación</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{detail.doubleCheck}</p>
        </section>
      )}
      {detail && detail.catalogedSources.length > 0 && (
        <section aria-label="Fuentes catalogadas">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Fuentes catalogadas ({detail.catalogedSources.length})
          </h3>
          <ul className="space-y-2">
            {detail.catalogedSources.map((cs) => (
              <li key={cs.role} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {cs.role === 'fuente_1' ? 'Fuente 1' : 'Fuente 2'} · coincidencia exacta de URL
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-slate-100" title={cs.source.title ?? undefined}>
                  {cs.source.title ?? cs.source.domain ?? cs.source.id}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {[cs.source.domain, cs.source.nature].filter(Boolean).join(' · ')}
                </p>
                {cs.source.consultedAt && (
                  <p className="text-xs text-slate-500">Consultada el {cs.source.consultedAt} · {cs.source.id}</p>
                )}
                {cs.source.url && (
                  <p className="mt-1.5 flex gap-3 text-xs font-medium">
                    <button type="button" onClick={() => openViewer(cs.source.url!)} className="text-sky-300 hover:underline">
                      Ver en el visor
                    </button>
                    <a href={cs.source.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                      Abrir en pestaña nueva ↗
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rec.lat !== null && (
        <button
          type="button"
          onClick={() => select(rec.id, true)}
          className="w-full rounded-lg bg-sky-500/90 px-3 py-2.5 text-sm font-medium text-white hover:bg-sky-400"
        >
          Acercar a esta iniciativa
        </button>
      )}

      {colocated.length > 0 && (
        <section aria-label="Otras iniciativas en esta misma localidad">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            En esta misma localidad ({colocated.length})
          </h3>
          <ul className="space-y-1">
            {colocated.slice(0, 12).map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => select(i.id)} className="w-full rounded-lg border border-slate-800 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-600">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: categoryColor(i.category) }} aria-hidden />
                  {i.name}
                  <span className="block pl-5 text-xs text-slate-500">{i.category}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">Comparten el punto representativo de la localidad; no es la misma dirección.</p>
        </section>
      )}
    </article>
  );
}

/**
 * Contexto del país seleccionado (Fase 4): lo que la hoja Países declara
 * y lo que el Directorio contiene, sin mezclarlos. Los desgloses se
 * calculan de las iniciativas del país en el catálogo (D6), ignorando
 * los demás filtros activos.
 */
export function CountryContext() {
  const catalog = useAtlas((s) => s.catalog);
  const countryCode = useAtlas((s) => s.countryCode);
  const openViewer = useAtlas((s) => s.openViewer);
  const [showNote, setShowNote] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  useEffect(() => { setShowNote(false); setShowEvidence(false); }, [countryCode]);

  const country = catalog?.countries.find((c) => c.code === countryCode);
  const byCategory = useMemo(() => {
    if (!catalog || !country) return [];
    const counts = new Map<string, number>();
    for (const i of catalog.initiatives) {
      if (i.countryCode === country.code) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [catalog, country]);

  if (!catalog || !country) return null;
  let declaredSum: number | null = null;
  if (country.declaredBreakdown) {
    declaredSum = 0;
    for (const v of Object.values(country.declaredBreakdown)) {
      if (typeof v === 'number') declaredSum += v;
    }
  }

  return (
    <section aria-label={`Contexto de ${country.name}`} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
      <header>
        <h3 className="text-base font-semibold text-slate-50">{country.name}</h3>
        <p className="text-xs text-slate-400">
          {country.continent}
          {country.circumscription ? ` · Circunscripción: ${country.circumscription}` : ''}
        </p>
      </header>

      <p className="text-sm text-slate-300">
        <strong className="text-slate-50">{fmt(country.computedTotal)}</strong> registros en el directorio ·{' '}
        <strong className="text-slate-50">{fmt(country.computedLocated)}</strong> con ubicación
      </p>
      {country.declaredTotal !== null && (
        <p className="text-xs text-slate-400">
          {country.declaredTotal === country.computedTotal
            ? `Coincide con lo declarado en la hoja Países (${fmt(country.declaredTotal)}).`
            : `La hoja Países declara ${fmt(country.declaredTotal)}${declaredSum !== null && declaredSum !== country.declaredTotal ? `, aunque su desglose por estados suma ${fmt(declaredSum)}` : ''}; el Directorio contiene ${fmt(country.computedTotal)}, que es la cifra que manda.`}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" aria-label="Estados de verificación en el país">
        {Object.entries(country.computedVerification).map(([state, n]) => (
          <span key={state} className="inline-flex items-center gap-1.5">
            {verificationBadge(state)}
            <span className="text-xs text-slate-400">{n}</span>
          </span>
        ))}
      </div>

      {byCategory.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Por categoría</h4>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-300">
            {byCategory.map(([cat, n]) => (
              <li key={cat} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(cat) }} aria-hidden />
                <span className="flex-1 truncate" title={cat}>{cat}</span>
                <span className="text-slate-500">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {country.presenceEvidence && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Evidencia de presencia</h4>
          <p className={`whitespace-pre-line text-xs leading-relaxed text-slate-300 ${showEvidence ? '' : 'line-clamp-3'}`}>
            {country.presenceEvidence}
          </p>
          {country.presenceEvidence.length > 220 && (
            <button type="button" onClick={() => setShowEvidence((v) => !v)} className="mt-0.5 text-xs font-medium text-sky-300 hover:underline">
              {showEvidence ? 'Leer menos' : 'Leer más'}
            </button>
          )}
        </div>
      )}

      {country.mainSource && (
        <p className="flex gap-3 text-xs font-medium">
          <button type="button" onClick={() => openViewer(country.mainSource!)} className="text-sky-300 hover:underline">
            Fuente principal del país en el visor
          </button>
          <a href={country.mainSource} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
            Abrir ↗
          </a>
        </p>
      )}

      {country.note && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nota del directorio</h4>
          <div className={`whitespace-pre-line text-xs leading-relaxed text-slate-400 ${showNote ? 'max-h-64 overflow-y-auto pr-1' : 'line-clamp-3'}`}>
            {country.note}
          </div>
          {country.note.length > 220 && (
            <button type="button" onClick={() => setShowNote((v) => !v)} className="mt-0.5 text-xs font-medium text-sky-300 hover:underline">
              {showNote ? 'Leer menos' : 'Leer más'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function StatsBar({ filtered }: { filtered: Initiative[] }) {
  const countriesCount = new Set(filtered.map((i) => i.countryCode)).size;
  const located = filtered.filter((i) => i.lat !== null).length;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" role="status" aria-label="Contadores">
      <span><strong className="text-slate-50">{fmt(filtered.length)}</strong> <span className="text-slate-400">iniciativas</span></span>
      <span><strong className="text-slate-50">{countriesCount}</strong> <span className="text-slate-400">países o territorios</span></span>
      <span><strong className="text-slate-50">{fmt(located)}</strong> <span className="text-slate-400">con ubicación en el mapa</span></span>
    </div>
  );
}

export function ActiveChips() {
  const catalog = useAtlas((s) => s.catalog);
  const countryCode = useAtlas((s) => s.countryCode);
  const categories = useAtlas((s) => s.categories);
  const query = useAtlas((s) => s.query);
  const setCountry = useAtlas((s) => s.setCountry);
  const toggleCategory = useAtlas((s) => s.toggleCategory);
  const setQuery = useAtlas((s) => s.setQuery);
  const country = catalog?.countries.find((c) => c.code === countryCode);
  if (!country && categories.length === 0 && !query.trim()) return null;
  const chip = 'inline-flex items-center gap-1.5 rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-200';
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Filtros activos">
      {country && (
        <span className={chip}>
          {country.name}
          <button type="button" onClick={() => setCountry(null)} aria-label="Quitar filtro de país" className="text-slate-400 hover:text-white">✕</button>
        </span>
      )}
      {categories.map((cat) => (
        <span key={cat} className={chip}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor(cat) }} aria-hidden />
          {cat}
          <button type="button" onClick={() => toggleCategory(cat)} aria-label={`Quitar categoría ${cat}`} className="text-slate-400 hover:text-white">✕</button>
        </span>
      ))}
      {query.trim() && (
        <span className={chip}>
          «{query.trim()}»
          <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="text-slate-400 hover:text-white">✕</button>
        </span>
      )}
    </div>
  );
}

export { RECIPIENT_LABELS };
