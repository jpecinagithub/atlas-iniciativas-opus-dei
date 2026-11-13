import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtlas, filterInitiatives } from '../store';
import { normalizeExternalUrl } from '../urls';
import { categoryColor, RECIPIENT_LABELS } from '../categories';
import { FAMILIES, familyOf, type Family } from '../taxonomy';
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
    'Confirmado y contrastado': 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    'Confirmado con datos parciales': 'border-[#e8a33d]/50 bg-[#e8a33d]/10 text-[#f5d9a8]',
    'Confirmado': 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    'Pendiente': 'border-slate-400/40 bg-slate-400/10 text-slate-200',
    'Histórico': 'border-zinc-400/30 bg-zinc-400/10 text-zinc-300',
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[state] ?? styles['Pendiente']}`}>
      {state}
    </span>
  );
}

const SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8ca3c7]';
const ROW_BUTTON = 'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition';

/**
 * Checkbox de familia (Fase 8C): nativo, con estado indeterminado
 * real cuando solo están seleccionadas algunas de sus subcategorías.
 * La propiedad `indeterminate` no es un atributo React: se aplica
 * sobre el DOM y los lectores de pantalla anuncian «mixto».
 */
function FamilyCheckbox({ checked, indeterminate, onChange, label }: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      aria-checked={indeterminate ? 'mixed' : checked}
      className="h-4 w-4 shrink-0 accent-[#e8a33d]"
    />
  );
}

export function FiltersPanel() {
  const catalog = useAtlas((s) => s.catalog);
  const countryCode = useAtlas((s) => s.countryCode);
  const categories = useAtlas((s) => s.categories);
  const query = useAtlas((s) => s.query);
  const setCountry = useAtlas((s) => s.setCountry);
  const toggleCategory = useAtlas((s) => s.toggleCategory);
  const setCategories = useAtlas((s) => s.setCategories);
  const [countrySearch, setCountrySearch] = useState('');
  // Familias desplegadas en el filtro (Fase 8C): cerradas por defecto;
  // una familia con subcategorías seleccionadas se despliega sola
  // (p. ej. al recuperar el filtro desde la URL o el historial).
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (categories.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const cat of categories) {
        const fam = familyOf(cat);
        if (fam) next.add(fam.id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [categories]);
  const toggleExpanded = (fam: Family) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fam.id)) next.delete(fam.id); else next.add(fam.id);
      return next;
    });
  const toggleFamily = (fam: Family) => {
    const member = fam.categories as readonly string[];
    const allOn = member.every((c) => categories.includes(c));
    if (allOn) setCategories(categories.filter((c) => !member.includes(c)));
    else setCategories([...new Set([...categories, ...member])]);
  };

  const countryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of catalog?.countries ?? []) counts.set(c.code, c.computedTotal);
    return counts;
  }, [catalog]);

  // Conteos por categoría respetando país y búsqueda activos (la
  // propia selección de categorías no se aplica: el conteo dice
  // cuántas iniciativas aportaría cada subcategoría al resultado).
  const categoryCounts = useMemo(() => {
    if (!catalog) return new Map<string, number>();
    const base = filterInitiatives(catalog.initiatives, countryCode, [], query);
    const counts = new Map<string, number>();
    for (const i of base) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return counts;
  }, [catalog, countryCode, query]);

  if (!catalog) return null;
  const countries = catalog.countries
    .filter((c) => c.name.toLowerCase().includes(countrySearch.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <div className="space-y-5">
      <section aria-label="País o territorio">
        <h3 className={`mb-2 ${SECTION_TITLE}`}>País o territorio</h3>
        <input
          value={countrySearch}
          onChange={(e) => setCountrySearch(e.target.value)}
          placeholder="Buscar país…"
          className="mb-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#e8a33d] focus:outline-none"
          aria-label="Buscar país"
        />
        <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => setCountry(null)}
            className={`${ROW_BUTTON} ${countryCode === null ? 'bg-[#e8a33d]/15 text-[#f5d9a8]' : 'text-slate-200 hover:bg-white/5'}`}
            aria-pressed={countryCode === null}
          >
            <span>Todo el mundo</span>
            <span className="text-xs text-[#8ca3c7]">{catalog.meta.totalInitiatives}</span>
          </button>
          {countries.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCountry(c.code)}
              className={`${ROW_BUTTON} ${countryCode === c.code ? 'bg-[#e8a33d]/15 text-[#f5d9a8]' : 'text-slate-200 hover:bg-white/5'}`}
              aria-pressed={countryCode === c.code}
            >
              <span>{c.name}</span>
              <span className="text-xs text-[#8ca3c7]">{countryCounts.get(c.code) ?? 0}</span>
            </button>
          ))}
          {countries.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Sin países con ese nombre.</p>}
        </div>
      </section>

      <section aria-label="Familias y categorías" id="panel-categorias">
        <div className="mb-2 flex items-center justify-between">
          <h3 className={SECTION_TITLE}>Familias</h3>
          {categories.length > 0 && (
            <button type="button" onClick={() => setCategories([])} className="text-xs text-[#f5d9a8] hover:underline">
              Quitar todas
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {FAMILIES.map((fam) => {
            const member = fam.categories as readonly string[];
            const selected = member.filter((c) => categories.includes(c)).length;
            const allOn = selected === member.length;
            const someOn = selected > 0 && !allOn;
            const famCount = member.reduce((n, c) => n + (categoryCounts.get(c) ?? 0), 0);
            const isOpen = expanded.has(fam.id);
            return (
              <div key={fam.id}>
                <div
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${allOn ? 'bg-white/10 text-slate-50' : someOn ? 'bg-white/[0.06] text-slate-100' : 'text-slate-200 hover:bg-white/5'} ${famCount === 0 ? 'opacity-45' : ''}`}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <FamilyCheckbox
                      checked={allOn}
                      indeterminate={someOn}
                      onChange={() => toggleFamily(fam)}
                      label={`Seleccionar toda la familia ${fam.label}`}
                    />
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: fam.color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block leading-snug">{fam.label}</span>
                      <span className="block truncate text-[11px] font-normal text-[#8ca3c7]">{fam.description}</span>
                    </span>
                    <span className="text-xs text-[#8ca3c7]">{famCount}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(fam)}
                    aria-expanded={isOpen}
                    aria-controls={`subcategorias-${fam.id}`}
                    aria-label={`${isOpen ? 'Ocultar' : 'Mostrar'} subcategorías de ${fam.label}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8ca3c7] transition hover:bg-white/10 hover:text-white"
                  >
                    <span aria-hidden>{isOpen ? '▴' : '▾'}</span>
                  </button>
                </div>
                {isOpen && (
                  <div id={`subcategorias-${fam.id}`} className="mb-1 ml-9 space-y-0.5">
                    {member.map((cat) => {
                      const active = categories.includes(cat);
                      const count = categoryCounts.get(cat) ?? 0;
                      return (
                        <label
                          key={cat}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${active ? 'bg-white/10 text-slate-50' : 'text-slate-300 hover:bg-white/5'} ${count === 0 ? 'opacity-45' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleCategory(cat)}
                            className="h-4 w-4 shrink-0 accent-[#e8a33d]"
                          />
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(cat) }} aria-hidden />
                          <span className="flex-1">{cat}</span>
                          <span className="text-xs text-[#8ca3c7]">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {countryCode && categories.length > 0 && (
          <button
            type="button"
            onClick={() => setCountry(null)}
            className="mt-3 w-full rounded-lg border border-white/15 px-3 py-2 text-sm text-[#f5d9a8] hover:bg-white/5"
          >
            Ver esta selección en el mundo
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
      <div className="rounded-xl border border-dashed border-white/15 p-6 text-center" role="status">
        <p className="font-medium text-slate-100">Sin resultados con estos filtros</p>
        <p className="mt-1 text-sm text-[#8ca3c7]">Prueba a quitar una categoría, cambiar el país o borrar la búsqueda.</p>
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
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${selectedId === i.id ? 'border-[#e8a33d]/60 bg-[#e8a33d]/10' : 'border-white/10 bg-white/[0.03] hover:border-white/30'}`}
              aria-current={selectedId === i.id}
            >
              <span className="flex items-start gap-2.5">
                <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(i.category) }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-50">{i.name}</span>
                  <span className="block truncate text-xs text-[#8ca3c7]">
                    {i.category} · {[i.locality, i.country].filter(Boolean).join(', ')}
                  </span>
                </span>
                {i.lat === null && (
                  <span className="shrink-0 rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] text-[#8ca3c7]" title="Este registro no se representa como punto en el mapa">
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
          className="mt-3 w-full rounded-lg border border-white/15 px-3 py-2.5 text-sm text-slate-100 hover:bg-white/5"
        >
          Mostrar más ({filtered.length - shown} restantes)
        </button>
      )}
    </div>
  );
}

/**
 * Ficha híbrida (Fase 7B): tarjeta inmersiva de la propuesta B con el
 * interior editorial de la A. Por decisión de Jon (2026-11-12) se
 * retiraron de la ficha la sección 03 «Evidencia y fuentes» y la
 * sección 01 «La iniciativa» (destinatarios, entidad titular, tipo
 * de vinculación y fecha de consulta): queda el resumen con sus
 * chips y la sección 02 «Ubicación y contacto», que conserva su
 * numeración. Los datos retirados siguen en el catálogo y la API.
 */
export function DetailPanel() {
  const catalog = useAtlas((s) => s.catalog);
  const selectedId = useAtlas((s) => s.selectedId);
  const select = useAtlas((s) => s.select);
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedId) {
      articleRef.current?.focus({ preventScroll: true });
    }
  }, [selectedId]);
  if (!catalog || !selectedId) return null;
  const rec = catalog.initiatives.find((i) => i.id === selectedId);
  if (!rec) return null;
  const colocated = rec.lat !== null && rec.lng !== null
    ? catalog.initiatives.filter((i) => i.id !== rec.id && i.lat === rec.lat && i.lng === rec.lng)
    : [];

  return (
    <article ref={articleRef} tabIndex={-1} aria-label={`Ficha de ${rec.name}`} className="space-y-5 outline-none">
      <header>
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f5d9a8]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: categoryColor(rec.category) }} aria-hidden />
            {familyOf(rec.category) ? `${familyOf(rec.category)!.label} · ` : ''}{rec.category}
            <span className="font-normal normal-case tracking-normal text-[#8ca3c7]">· {rec.id}</span>
          </p>
          <button
            type="button"
            onClick={() => select(null)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-200 hover:bg-white/5"
            aria-label="Cerrar ficha"
          >
            ✕
          </button>
        </div>
        <h2 className="font-display mt-2 text-[26px] font-normal leading-tight text-slate-50">{rec.name}</h2>
        <p className="mt-1 text-sm text-[#b9c9e2]">
          {[rec.locality, rec.region, rec.country].filter(Boolean).join(', ') || rec.country}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {verificationBadge(rec.verificationState)}
          <span className="inline-block rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-medium text-slate-200">
            Actividad: {rec.activityStateRaw ?? rec.activityState}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">
          {rec.category} en {[rec.locality, rec.country].filter(Boolean).join(', ')}. {precisionLabel(rec)}
          {rec.lat !== null ? ': el punto marca la localidad, no la dirección exacta.' : ': consta en la lista y en los totales, pero su ubicación no se ha resuelto de forma verificable.'}
        </p>
      </header>

      <section aria-label="Ubicación y contacto">
        <h3 className="mb-2.5 flex items-baseline gap-2">
          <span className="font-display text-sm italic text-[#e8a33d]">02</span>
          <span className={SECTION_TITLE}>Ubicación y contacto</span>
        </h3>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-[#8ca3c7]">Lugar</dt>
            <dd className="mt-0.5 text-slate-100">
              {[rec.locality, rec.region, rec.country].filter(Boolean).join(', ') || rec.country}
              {rec.address && <span className="block text-[#b9c9e2]">{rec.address}{rec.postalCode ? ` · CP ${rec.postalCode}` : ''}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-[#8ca3c7]">Precisión geográfica</dt>
            <dd className="mt-0.5 text-slate-100">
              {precisionLabel(rec)}
              {rec.lat !== null && rec.geocodingProvider && (
                <span className="block text-xs leading-relaxed text-[#8ca3c7]">
                  Punto representativo de la localidad ({rec.geocodingProvider}
                  {rec.geonameId ? `, GeoNames ${rec.geonameId}` : ''}). No es la dirección exacta.
                </span>
              )}
              {rec.lat === null && (
                <span className="block text-xs leading-relaxed text-[#8ca3c7]">
                  Este registro cuenta en la lista y en los totales, pero no se dibuja como punto: su ubicación no se ha resuelto de forma verificable.
                </span>
              )}
            </dd>
          </div>
          {(rec.web || rec.phone || rec.email) && (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-[#8ca3c7]">Contacto publicado</dt>
              <dd className="mt-0.5 space-y-0.5 text-slate-100">
                {rec.web && (normalizeExternalUrl(rec.web)
                  ? <a className="block truncate text-[#f5d9a8] hover:underline" href={normalizeExternalUrl(rec.web)!} target="_blank" rel="noreferrer">{rec.web}</a>
                  : <span className="block truncate" title={rec.web}>{rec.web}</span>)}
                {rec.phone && <span className="block">{rec.phone}</span>}
                {rec.email && <span className="block">{rec.email}</span>}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {rec.lat !== null && (
        <button
          type="button"
          onClick={() => select(rec.id, true)}
          className="w-full rounded-lg bg-[#e8a33d] px-3 py-2.5 text-sm font-semibold text-[#1a1206] transition hover:bg-[#f0b45a]"
        >
          Acercar a esta iniciativa
        </button>
      )}

      {colocated.length > 0 && (
        <section aria-label="Otras iniciativas en esta misma localidad">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[#8ca3c7]">
            En esta misma localidad ({colocated.length})
          </h3>
          <ul className="space-y-1">
            {colocated.slice(0, 12).map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => select(i.id)} className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-slate-100 hover:border-white/30">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: categoryColor(i.category) }} aria-hidden />
                  {i.name}
                  <span className="block pl-5 text-xs text-[#8ca3c7]">{i.category}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-[#8ca3c7]">Comparten el punto representativo de la localidad; no es la misma dirección.</p>
        </section>
      )}
    </article>
  );
}

/**
 * Contexto del país seleccionado (Fase 4): lo que la hoja Países declara
 * y lo que el Directorio contiene, sin mezclarlos. Los desgloses se
 * calculan de las iniciativas del país en el catálogo (D6), ignorando
 * los demás filtros activos. En la Fase 7B el desglose por categoría
 * actúa también como filtro (chips con conteo).
 */
export function CountryContext() {
  const catalog = useAtlas((s) => s.catalog);
  const countryCode = useAtlas((s) => s.countryCode);
  const categories = useAtlas((s) => s.categories);
  const toggleCategory = useAtlas((s) => s.toggleCategory);
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
  const sinPunto = country.computedTotal - country.computedLocated;

  return (
    <section aria-label={`Contexto de ${country.name}`} className="space-y-3.5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f5d9a8]">
          País · {country.continent}
        </p>
        <h3 className="font-display mt-1 text-[30px] font-normal leading-none text-slate-50">{country.name}</h3>
        <p className="mt-1.5 text-xs text-[#8ca3c7]">
          {country.circumscription ? `Circunscripción: ${country.circumscription} · ` : ''}Presencia documentada en el directorio
        </p>
      </header>

      <div className="flex gap-6" role="group" aria-label="Cifras del país">
        <span>
          <strong className="block text-[24px] font-extralight leading-none text-slate-50">{fmt(country.computedTotal)}</strong>
          <span className="mt-1 block text-[12px] tracking-[0.08em] text-[#8ca3c7] [font-variant:small-caps]">Iniciativas</span>
        </span>
        <span>
          <strong className="block text-[24px] font-extralight leading-none text-slate-50">{fmt(country.computedLocated)}</strong>
          <span className="mt-1 block text-[12px] tracking-[0.08em] text-[#8ca3c7] [font-variant:small-caps]">Con ubicación</span>
        </span>
        <span>
          <strong className="block text-[24px] font-extralight leading-none text-[#f5d9a8]">{fmt(sinPunto)}</strong>
          <span className="mt-1 block text-[12px] tracking-[0.08em] text-[#8ca3c7] [font-variant:small-caps]">Sin punto</span>
        </span>
      </div>
      {country.declaredTotal !== null && (
        <p className="text-xs leading-relaxed text-[#8ca3c7]">
          {country.declaredTotal === country.computedTotal
            ? `Coincide con lo declarado en la hoja Países (${fmt(country.declaredTotal)}).`
            : `La hoja Países declara ${fmt(country.declaredTotal)}${declaredSum !== null && declaredSum !== country.declaredTotal ? `, aunque su desglose por estados suma ${fmt(declaredSum)}` : ''}; el Directorio contiene ${fmt(country.computedTotal)}, que es la cifra que manda.`}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" aria-label="Estados de verificación en el país">
        {Object.entries(country.computedVerification).map(([state, n]) => (
          <span key={state} className="inline-flex items-center gap-1.5">
            {verificationBadge(state)}
            <span className="text-xs text-[#8ca3c7]">{n}</span>
          </span>
        ))}
      </div>

      {byCategory.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#8ca3c7]">Por categoría · pulsa para filtrar</h4>
          <div className="flex flex-wrap gap-1.5">
            {byCategory.map(([cat, n]) => {
              const active = categories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${active ? 'border-[#e8a33d]/70 bg-[#e8a33d]/15 text-[#f5d9a8]' : 'border-white/15 text-slate-200 hover:bg-white/5'}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(cat) }} aria-hidden />
                  {cat} <span className="text-[#8ca3c7]">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {country.presenceEvidence && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#8ca3c7]">Evidencia de presencia</h4>
          <p className={`whitespace-pre-line text-xs leading-relaxed text-slate-200 ${showEvidence ? '' : 'line-clamp-3'}`}>
            {country.presenceEvidence}
          </p>
          {country.presenceEvidence.length > 220 && (
            <button type="button" onClick={() => setShowEvidence((v) => !v)} className="mt-0.5 text-xs font-medium text-[#f5d9a8] hover:underline">
              {showEvidence ? 'Leer menos' : 'Leer más'}
            </button>
          )}
        </div>
      )}

      {country.mainSource && (normalizeExternalUrl(country.mainSource) ? (
        <p className="flex gap-3 text-xs font-medium">
          <a href={normalizeExternalUrl(country.mainSource)!} target="_blank" rel="noreferrer" className="text-[#f5d9a8] hover:underline">
            Abrir ↗
          </a>
        </p>
      ) : (
        <p className="text-xs text-slate-300">
          <span className="text-[#8ca3c7]">Fuente principal del país (sin enlace válido): </span>
          {country.mainSource}
        </p>
      ))}

      {country.note && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#8ca3c7]">Nota del directorio</h4>
          <div className={`whitespace-pre-line text-xs leading-relaxed text-[#8ca3c7] ${showNote ? 'max-h-64 overflow-y-auto pr-1' : 'line-clamp-3'}`}>
            {country.note}
          </div>
          {country.note.length > 220 && (
            <button type="button" onClick={() => setShowNote((v) => !v)} className="mt-0.5 text-xs font-medium text-[#f5d9a8] hover:underline">
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
  // La etiqueta va en versalitas por font-variant, no por text-transform:
  // el texto real conserva su caso (lo leen los lectores de pantalla y las
  // comprobaciones de contadores).
  const stat = (value: string, label: string, amber = false) => (
    <span key={label}>
      <strong className={`text-[26px] font-extralight leading-none ${amber ? 'text-[#e8a33d]' : 'text-slate-50'}`}>{value}</strong>{' '}
      <span className="text-[12px] tracking-[0.08em] text-[#8ca3c7] [font-variant:small-caps]">{label}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2" role="status" aria-label="Contadores">
      {stat(fmt(filtered.length), 'iniciativas')}
      {stat(fmt(countriesCount), 'países o territorios')}
      {stat(fmt(located), 'con ubicación en el mapa', true)}
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
  const chip = 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs text-slate-100';
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Filtros activos">
      {country && (
        <span className={chip}>
          {country.name}
          <button type="button" onClick={() => setCountry(null)} aria-label="Quitar filtro de país" className="text-[#8ca3c7] hover:text-white">✕</button>
        </span>
      )}
      {categories.map((cat) => (
        <span key={cat} className={chip}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(cat) }} aria-hidden />
          <span className="truncate">{cat}</span>
          <button type="button" onClick={() => toggleCategory(cat)} aria-label={`Quitar categoría ${cat}`} className="text-[#8ca3c7] hover:text-white">✕</button>
        </span>
      ))}
      {query.trim() && (
        <span className={chip}>
          <span className="truncate">«{query.trim()}»</span>
          <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="text-[#8ca3c7] hover:text-white">✕</button>
        </span>
      )}
    </div>
  );
}

export { RECIPIENT_LABELS };
