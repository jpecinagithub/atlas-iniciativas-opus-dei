import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useAtlas, filterInitiatives, syncUrl, applyStateFromUrl } from './store';
// Carga diferida del motor cartográfico y de Three.js (no bloquean la lista)
const MapView = lazy(() => import('./components/MapView'));
import { FiltersPanel, ResultsList, DetailPanel, StatsBar, ActiveChips, CountryContext } from './components/Panels';
import { WebViewer } from './components/WebViewer';
import { categoryColor } from './categories';
import { fmt } from './format';
import { normalizeExternalUrl } from './urls';

// Gancho de comprobación (como __atlasMap): el recorrido funcional
// verifica la normalización de URLs directamente en el navegador.
(window as unknown as { __atlasNormalize?: typeof normalizeExternalUrl }).__atlasNormalize = normalizeExternalUrl;

type MobileTab = 'resultados' | 'filtros' | 'ficha';
type SheetLevel = 0 | 1 | 2;
const SHEET_HEIGHTS = ['h-[19vh]', 'h-[54vh]', 'h-[88vh]'];

const PILL = 'pointer-events-auto flex h-11 items-center rounded-full border border-white/15 bg-[#0a1120]/85 px-4 text-sm text-slate-100 shadow-lg backdrop-blur transition hover:bg-[#101c33]';

export default function App() {
  const status = useAtlas((s) => s.status);
  const error = useAtlas((s) => s.error);
  const catalog = useAtlas((s) => s.catalog);
  const load = useAtlas((s) => s.load);
  const query = useAtlas((s) => s.query);
  const setQuery = useAtlas((s) => s.setQuery);
  const reset = useAtlas((s) => s.reset);
  const countryCode = useAtlas((s) => s.countryCode);
  const categories = useAtlas((s) => s.categories);
  const selectedId = useAtlas((s) => s.selectedId);
  const select = useAtlas((s) => s.select);
  const setCountry = useAtlas((s) => s.setCountry);
  const [mobileTab, setMobileTab] = useState<MobileTab>('resultados');
  const [sheetLevel, setSheetLevel] = useState<SheetLevel>(0);
  const [showMethod, setShowMethod] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [stripOpen, setStripOpen] = useState(true);
  const [explored, setExplored] = useState(false);
  const [forcePanels, setForcePanels] = useState(false);
  const exploreRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<{ explore: boolean; results: boolean } | null>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLElement>(null);

  useEffect(() => { void load(); }, [load]);

  const state = useAtlas();
  useEffect(() => { if (status === 'ready') syncUrl(state); }, [state, status]);

  // Navegación atrás/adelante del navegador: reaplicar el estado de la URL
  useEffect(() => {
    if (status !== 'ready') return;
    const onPopState = () => applyStateFromUrl();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [status]);

  useEffect(() => {
    const prev = prevSelectedRef.current;
    if (selectedId && !prev) {
      snapshotRef.current = { explore: exploreOpen, results: resultsOpen };
    }
    if (!selectedId && prev && snapshotRef.current) {
      setExploreOpen(snapshotRef.current.explore);
      setResultsOpen(snapshotRef.current.results);
      setForcePanels(false);
      snapshotRef.current = null;
    }
    prevSelectedRef.current = selectedId;
    if (selectedId) {
      setMobileTab('ficha');
      setSheetLevel(1);
      requestAnimationFrame(() => {
        sheetScrollRef.current?.scrollTo({ top: 0 });
        detailScrollRef.current?.scrollTo({ top: 0 });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // La pista de arrastre se retira en cuanto el usuario explora el globo
  useEffect(() => {
    const onExplored = () => setExplored(true);
    window.addEventListener('atlas:explored', onExplored);
    return () => window.removeEventListener('atlas:explored', onExplored);
  }, []);

  // Buscar con una ficha abierta es una intención expresa de seguir
  // explorando: los paneles vuelven para poder saltar a otro resultado
  // (la foto/restauración al cerrar la ficha se mantiene).
  useEffect(() => {
    if (query.trim()) setForcePanels(true);
  }, [query]);

  // Escape cierra la ficha (el visor gestiona su propio Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useAtlas.getState().selectedId && !useAtlas.getState().viewerUrl) {
        useAtlas.getState().select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(
    () => (catalog ? filterInitiatives(catalog.initiatives, countryCode, categories, query) : []),
    [catalog, countryCode, categories, query],
  );
  const firstResults = useMemo(
    () => [...filtered].sort((a, b) => a.country.localeCompare(b.country, 'es') || (a.locality ?? '').localeCompare(b.locality ?? '', 'es') || a.name.localeCompare(b.name, 'es')),
    [filtered],
  );

  const selectedCountry = catalog?.countries.find((c) => c.code === countryCode);
  const selectedRec = catalog?.initiatives.find((i) => i.id === selectedId);
  const filtersActive = Boolean(countryCode || categories.length > 0 || query.trim());
  const filteredCountries = new Set(filtered.map((i) => i.countryCode)).size;
  const filteredLocated = filtered.filter((i) => i.lat !== null).length;

  const openExplore = (anchor?: 'categorias') => {
    setExploreOpen(true);
    requestAnimationFrame(() => {
      if (anchor === 'categorias') {
        exploreRef.current?.querySelector('#panel-categorias')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else {
        exploreRef.current?.querySelector<HTMLInputElement>('input[aria-label="Buscar país"]')?.focus({ preventScroll: true });
      }
    });
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-[#04070d] text-slate-100">
      {/* Mapa a pantalla completa: siempre el protagonista */}
      <main className="absolute inset-0">
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#04070d]" role="status">
            <p className="animate-pulse text-slate-300">Cargando el directorio…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#04070d] p-6" role="alert">
            <div className="max-w-md text-center">
              <p className="font-medium text-slate-100">No se ha podido cargar el catálogo</p>
              <p className="mt-1 text-sm text-[#8ca3c7]">{error}. Comprueba que la API del Atlas está en marcha y la base de datos importada (<code>npm run api</code> y <code>npm run import</code>).</p>
              <button type="button" onClick={() => void load()} className="mt-4 h-11 rounded-full bg-[#e8a33d] px-5 text-sm font-semibold text-[#1a1206]">Reintentar</button>
            </div>
          </div>
        )}
        {status === 'ready' && (
          <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center" role="status"><p className="animate-pulse text-slate-400">Cargando el mapa…</p></div>}>
            <MapView />
          </Suspense>
        )}
      </main>

      {/* Barra superior flotante */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-start gap-x-3 gap-y-2 p-3 sm:p-4">
        <div className="pointer-events-auto shrink-0">
          <h1 className="whitespace-nowrap text-[13px] font-semibold uppercase leading-tight tracking-[0.18em] text-slate-50">
            Atlas <span className="hidden min-[480px]:inline">de iniciativas </span><span className="text-[#e8a33d]">·</span> Opus Dei
          </h1>
          <p className="mt-0.5 hidden text-[11px] tracking-wide text-[#8ca3c7] sm:block">Directorio mundial de iniciativas</p>
          {(selectedCountry || selectedRec) && (
            <nav aria-label="Miga de pan" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#8ca3c7]">
              <button type="button" onClick={() => setCountry(null)} className="rounded px-1 py-0.5 hover:text-white">← Mundo</button>
              {selectedCountry && (
                <>
                  <span aria-hidden>/</span>
                  {selectedRec
                    ? <button type="button" onClick={() => select(null)} className="rounded px-1 py-0.5 hover:text-white">{selectedCountry.name}</button>
                    : <span className="px-1 py-0.5 font-medium text-slate-100">{selectedCountry.name}</span>}
                </>
              )}
              {selectedRec && (
                <>
                  <span aria-hidden>/</span>
                  <span className="max-w-44 truncate px-1 py-0.5 font-medium text-slate-100">{selectedRec.name}</span>
                </>
              )}
            </nav>
          )}
        </div>

        <div className="order-3 flex w-full min-w-0 justify-center sm:order-none sm:w-auto sm:flex-1">
          <div className="pointer-events-auto w-full max-w-xl">
            <label className="sr-only" htmlFor="buscador">Buscar por nombre, localidad, región o entidad titular</label>
            <input
              id="buscador"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca un lugar, una iniciativa, una entidad…"
              className="h-12 w-full rounded-full border border-white/20 bg-[#0a1120]/85 px-5 text-sm text-slate-50 shadow-xl backdrop-blur placeholder:text-[#8ca3c7] focus:border-[#e8a33d] focus:outline-none"
            />
          </div>
        </div>

        <div className="pointer-events-auto ml-auto flex gap-2 sm:ml-0">
          <button
            type="button"
            onClick={() => { reset(); setMobileTab('resultados'); }}
            className={PILL}
          >
            Restablecer
          </button>
          <button
            type="button"
            onClick={() => setShowMethod((v) => !v)}
            className={PILL}
            aria-expanded={showMethod}
          >
            Método
          </button>
        </div>
      </div>

      {/* Panel de método */}
      {showMethod && catalog && (
        <div className="glass absolute right-3 top-[76px] z-30 max-h-[70dvh] w-[min(430px,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-4 text-sm leading-relaxed text-slate-200 sm:right-4" role="note">
          <p>
            <strong className="text-slate-50">Qué muestra este atlas:</strong> los {fmt(catalog.meta.totalInitiatives)} registros
            del directorio v14 ({catalog.meta.totalCountries} países o territorios, 14 categorías), tal como constan en el archivo,
            con sus estados de verificación originales. Las ubicaciones son <em>puntos representativos de la localidad</em> resueltos
            con GeoNames (CC BY 4.0) con reglas conservadoras: {fmt(catalog.meta.located)} registros tienen punto;
            el resto sigue en la lista y en los recuentos sin dibujarse. Una iniciativa vinculada no es necesariamente propiedad
            del Opus Dei: la ficha distingue entidad titular, tipo de vinculación y evidencia. Límites de países: Natural Earth.
            Las etiquetas del mapa usan glifos generados desde Noto Sans (licencia OFL 1.1) y servidos desde la propia app, sin
            servicios externos. La app es instalable (PWA): sin conexión conserva la carcasa y la última información consultada.
          </p>
          <p className="mt-2 text-xs text-[#8ca3c7]">
            Datos: Directorio Opus Dei MUNDIAL v14 (consulta 2026-11-08 a 2026-11-11) · Ubicaciones: GeoNames (CC BY 4.0), punto
            representativo de localidad · Límites: Natural Earth · Sin clave CARTO: base local limitada a países, sin detalle de calles.
          </p>
          <button type="button" onClick={() => setShowMethod(false)} className="mt-3 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/5">
            Cerrar
          </button>
        </div>
      )}

      {/* Columna flotante de exploración (escritorio) */}
      {status === 'ready' && (!selectedId || forcePanels) && (
        <div className="absolute bottom-[132px] left-4 top-[92px] z-20 hidden w-[344px] flex-col gap-3 overflow-y-auto pr-1 lg:flex" ref={exploreRef}>
          {selectedCountry && (
            <section className="glass shrink-0 rounded-2xl p-4">
              <CountryContext />
            </section>
          )}
          <section className="glass shrink-0 rounded-2xl" aria-label="Panel de exploración">
            <button
              type="button"
              onClick={() => setExploreOpen((v) => !v)}
              aria-expanded={exploreOpen}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f5d9a8]">Explorar · países y categorías</span>
              <span className="text-[#8ca3c7]" aria-hidden>{exploreOpen ? '▴' : '▾'}</span>
            </button>
            {exploreOpen && (
              <div className="space-y-4 px-4 pb-4">
                <ActiveChips />
                <FiltersPanel />
              </div>
            )}
          </section>
          {filtersActive && (
            <section className="glass flex min-h-0 flex-1 flex-col rounded-2xl" aria-label="Panel de resultados">
              <button
                type="button"
                onClick={() => setResultsOpen((v) => !v)}
                aria-expanded={resultsOpen}
                className="flex w-full shrink-0 items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f5d9a8]">
                  Resultados · {fmt(filtered.length)}
                </span>
                <span className="text-[#8ca3c7]" aria-hidden>{resultsOpen ? '▴' : '▾'}</span>
              </button>
              {resultsOpen && (
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <ResultsList />
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Ficha flotante (escritorio) */}
      {selectedId && status === 'ready' && (
        <aside ref={detailScrollRef} className="glass absolute right-4 top-[92px] z-20 hidden max-h-[calc(100dvh-190px)] w-[min(400px,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-5 lg:block" aria-label="Ficha de la iniciativa">
          <DetailPanel />
        </aside>
      )}

      {/* Tira de primeras iniciativas del país (escritorio) */}
      {status === 'ready' && selectedCountry && !selectedId && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[104px] z-10 hidden justify-center pl-[384px] pr-4 lg:flex">
          <div className="pointer-events-auto w-full max-w-[880px]">
            <div className="mb-1.5 flex items-center gap-2 pl-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8ca3c7]">Primeras iniciativas · {selectedCountry.name}</span>
              <button type="button" onClick={() => setStripOpen((v) => !v)} aria-expanded={stripOpen} className="rounded-full border border-white/15 bg-[#0a1120]/80 px-2 py-0.5 text-[10px] text-slate-200">
                {stripOpen ? 'Plegar ▾' : 'Mostrar ▸'}
              </button>
            </div>
            {stripOpen && (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Primeras iniciativas del país">
                {firstResults.slice(0, 5).map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => select(i.id)}
                    className="glass w-52 shrink-0 rounded-xl px-3.5 py-3 text-left transition hover:border-[#e8a33d]/50"
                  >
                    <span className="block truncate text-sm font-medium text-slate-50">{i.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[#8ca3c7]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(i.category) }} aria-hidden />
                      {i.category} · {i.locality ?? i.country}
                    </span>
                    <span className="mt-1.5 block text-xs font-medium text-[#f5d9a8]">Abrir ficha →</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setResultsOpen(true); exploreRef.current?.scrollTo({ top: 0 }); }}
                  className="flex w-40 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/25 px-3 py-3 text-center text-sm font-medium text-[#f5d9a8] hover:bg-white/5"
                >
                  Ver las {fmt(filtered.length)} iniciativas
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra inferior: cifras y acciones (escritorio) */}
      {status === 'ready' && (!selectedId || forcePanels) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-end justify-between p-4 lg:flex">
          <div className="glass pointer-events-auto rounded-2xl px-5 py-4">
            <StatsBar filtered={filtered} />
          </div>
          <div className="pointer-events-auto flex gap-2">
            <button type="button" onClick={() => openExplore('categorias')} className={PILL}>
              ▦ Categorías
            </button>
            <button
              type="button"
              onClick={() => openExplore()}
              className="pointer-events-auto flex h-11 items-center rounded-full bg-[#e8a33d] px-5 text-sm font-semibold text-[#1a1206] shadow-lg transition hover:bg-[#f0b45a]"
            >
              Explorar por país →
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && selectedId && (
        <button
          type="button"
          onClick={() => setForcePanels((v) => !v)}
          aria-expanded={forcePanels}
          aria-label={forcePanels ? 'Ocultar filtros y resultados' : 'Mostrar filtros y resultados'}
          className="glass absolute bottom-4 right-4 z-30 hidden h-11 items-center rounded-full px-4 text-sm text-slate-100 transition hover:border-[#e8a33d]/50 lg:flex"
        >
          {forcePanels ? 'Ocultar paneles' : '☰ Filtros'}
        </button>
      )}

      {/* Pista sutil de interacción con el globo */}
      {status === 'ready' && !explored && !countryCode && (
        <p className="pointer-events-none absolute bottom-24 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-white/10 bg-[#0a1120]/70 px-3.5 py-1.5 text-xs text-[#8ca3c7] backdrop-blur lg:block" aria-hidden>
          Arrastra para girar el globo · acércate con scroll o pellizco
        </p>
      )}

      {/* Hoja inferior móvil: tres posiciones */}
      {status === 'ready' && (
        <section
          className={`glass absolute inset-x-0 bottom-0 z-20 flex ${SHEET_HEIGHTS[sheetLevel]} flex-col rounded-t-3xl shadow-2xl transition-[height] duration-300 lg:hidden`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Panel de exploración"
        >
          <button
            type="button"
            onClick={() => setSheetLevel(((sheetLevel + 1) % 3) as SheetLevel)}
            className="flex min-h-9 w-full shrink-0 items-center justify-center"
            aria-label="Cambiar la altura del panel"
          >
            <span className="h-1.5 w-12 rounded-full bg-slate-500" aria-hidden />
          </button>
          {sheetLevel === 0 && (
            <p className="shrink-0 px-5 pb-1 text-[15px] leading-snug text-slate-100" role="status">
              <strong className="font-semibold text-[#e8a33d]">{fmt(filtered.length)}</strong> iniciativas en{' '}
              <strong className="font-semibold text-[#e8a33d]">{fmt(filteredCountries)}</strong> países
              <span className="block text-xs text-[#8ca3c7]">{fmt(filteredLocated)} con ubicación en el mapa · Directorio v14 verificado</span>
            </p>
          )}
          <div className="flex shrink-0 gap-1 px-3 pb-2" role="tablist" aria-label="Secciones del panel">
            {(['resultados', 'filtros', 'ficha'] as MobileTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mobileTab === tab}
                onClick={() => { setMobileTab(tab); if (sheetLevel === 0) setSheetLevel(1); }}
                className={`min-h-11 flex-1 rounded-full px-3 text-sm capitalize transition ${mobileTab === tab ? 'bg-[#e8a33d]/20 text-[#f5d9a8]' : 'text-slate-300 hover:bg-white/5'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div id="hoja-contenido" ref={sheetScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            {sheetLevel > 0 && mobileTab === 'resultados' && (
              <div className="space-y-3">
                <StatsBar filtered={filtered} />
                <ActiveChips />
                <CountryContext />
                <ResultsList onPick={() => setMobileTab('ficha')} />
              </div>
            )}
            {sheetLevel > 0 && mobileTab === 'filtros' && <FiltersPanel />}
            {sheetLevel > 0 && mobileTab === 'ficha' && (
              selectedId ? <DetailPanel /> : (
                <p className="p-2 text-sm text-[#8ca3c7]">Selecciona una iniciativa en la lista o en el mapa para ver su ficha.</p>
              )
            )}
          </div>
        </section>
      )}

      <WebViewer />
    </div>
  );
}
