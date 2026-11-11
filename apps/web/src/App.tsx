import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useAtlas, filterInitiatives, syncUrl, applyStateFromUrl } from './store';
// Carga diferida del motor cartográfico y de Three.js (no bloquean la lista)
const MapView = lazy(() => import('./components/MapView'));
import { FiltersPanel, ResultsList, DetailPanel, StatsBar, ActiveChips } from './components/Panels';
import { fmt } from './format';

type MobileTab = 'resultados' | 'filtros' | 'ficha';
type SheetLevel = 0 | 1 | 2;
const SHEET_HEIGHTS = ['h-[24vh]', 'h-[54vh]', 'h-[88vh]'];

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
  const viewResultsOnMap = useAtlas((s) => s.viewResultsOnMap);
  const [mobileTab, setMobileTab] = useState<MobileTab>('resultados');
  const [sheetLevel, setSheetLevel] = useState<SheetLevel>(0);
  const [showMethod, setShowMethod] = useState(false);

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
    if (selectedId) { setMobileTab('ficha'); setSheetLevel(1); }
  }, [selectedId]);

  const filtered = useMemo(
    () => (catalog ? filterInitiatives(catalog.initiatives, countryCode, categories, query) : []),
    [catalog, countryCode, categories, query],
  );

  const selectedCountry = catalog?.countries.find((c) => c.code === countryCode);

  return (
    <div className="flex h-dvh flex-col bg-[#0a1120] text-slate-100">
      {/* Cabecera compacta */}
      <header className="z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 bg-[#0d1526] px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">Atlas de iniciativas · Opus Dei</h1>
          <p className="hidden text-xs text-slate-400 sm:block">Presencia e iniciativas vinculadas documentadas en el directorio v14</p>
        </div>
        <div className="order-3 flex w-full items-center gap-2 sm:order-none sm:w-auto sm:flex-1 sm:justify-end">
          <label className="sr-only" htmlFor="buscador">Buscar por nombre, localidad, región o entidad titular</label>
          <input
            id="buscador"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nombre, localidad, región, entidad…"
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800/70 px-3 text-sm placeholder:text-slate-500 focus:border-sky-400 focus:outline-none sm:max-w-sm"
          />
          <button
            type="button"
            onClick={() => viewResultsOnMap()}
            className="hidden h-11 shrink-0 rounded-lg border border-slate-700 px-3 text-sm hover:bg-slate-800 md:block"
          >
            Ver resultados en el mapa
          </button>
          <button
            type="button"
            onClick={() => { reset(); setMobileTab('resultados'); }}
            className="h-11 shrink-0 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-900 hover:bg-white"
          >
            Restablecer
          </button>
          <button
            type="button"
            onClick={() => setShowMethod((v) => !v)}
            className="h-11 shrink-0 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800"
            aria-expanded={showMethod}
          >
            Método
          </button>
        </div>
      </header>

      {showMethod && catalog && (
        <div className="z-20 border-b border-slate-800 bg-[#0d1526] px-4 py-3 text-sm text-slate-300" role="note">
          <p>
            <strong className="text-slate-100">Qué muestra este atlas:</strong> los {fmt(catalog.meta.totalInitiatives)} registros
            del directorio v14 ({catalog.meta.totalCountries} países o territorios, 14 categorías), tal como constan en el archivo,
            con sus estados de verificación originales. Las ubicaciones son <em>puntos representativos de la localidad</em> resueltos
            con GeoNames (CC BY 4.0) con reglas conservadoras: {fmt(catalog.meta.located)} registros tienen punto;
            el resto sigue en la lista y en los recuentos sin dibujarse. Una iniciativa vinculada no es necesariamente propiedad
            del Opus Dei: la ficha distingue entidad titular, tipo de vinculación y evidencia. Límites de países: Natural Earth.
            {selectedCountry && (
              <> Estás viendo <strong className="text-slate-100">{selectedCountry.name}</strong>
              {selectedCountry.circumscription ? <> · Circunscripción: {selectedCountry.circumscription}</> : null}
              {typeof selectedCountry.declaredTotal === 'number' && selectedCountry.declaredTotal !== selectedCountry.computedTotal
                ? <> · La hoja Países declara {selectedCountry.declaredTotal} registros y el Directorio contiene {selectedCountry.computedTotal}.</>
                : null}
              </>
            )}
          </p>
        </div>
      )}

      {/* Cuerpo */}
      <div className="relative flex min-h-0 flex-1">
        {/* Panel izquierdo escritorio */}
        <aside className="z-10 hidden w-[330px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 bg-[#0d1526] p-4 lg:flex" aria-label="Filtros y resultados">
          <StatsBar filtered={filtered} />
          <ActiveChips />
          <FiltersPanel />
          <div className="border-t border-slate-800 pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Resultados</h3>
            <ResultsList />
          </div>
        </aside>

        {/* Mapa */}
        <main className="relative min-w-0 flex-1">
          {status === 'loading' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a1120]" role="status">
              <p className="animate-pulse text-slate-300">Cargando el directorio…</p>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a1120] p-6" role="alert">
              <div className="max-w-md text-center">
                <p className="font-medium text-slate-100">No se ha podido cargar el catálogo</p>
                <p className="mt-1 text-sm text-slate-400">{error}. Comprueba que la API del Atlas está en marcha y la base de datos importada (<code>npm run api</code> y <code>npm run import</code>).</p>
                <button type="button" onClick={() => void load()} className="mt-4 h-11 rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-900">Reintentar</button>
              </div>
            </div>
          )}
          {status === 'ready' && (
            <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center" role="status"><p className="animate-pulse text-slate-400">Cargando el mapa…</p></div>}>
              <MapView />
            </Suspense>
          )}
          {/* Contadores flotantes en móvil */}
          {status === 'ready' && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl bg-[#0d1526]/90 px-3 py-2 shadow-lg backdrop-blur lg:hidden">
              <StatsBar filtered={filtered} />
            </div>
          )}
        </main>

        {/* Panel derecho escritorio: ficha */}
        {selectedId && (
          <aside className="z-10 hidden w-[350px] shrink-0 overflow-y-auto border-l border-slate-800 bg-[#0d1526] p-4 lg:block" aria-label="Ficha de la iniciativa">
            <DetailPanel />
          </aside>
        )}

        {/* Panel inferior móvil */}
        {status === 'ready' && (
          <section
            className={`absolute inset-x-0 bottom-0 z-20 flex ${SHEET_HEIGHTS[sheetLevel]} flex-col rounded-t-2xl border-t border-slate-700 bg-[#0d1526] shadow-2xl transition-[height] duration-300 lg:hidden`}
            aria-label="Panel de exploración"
          >
            <button
              type="button"
              onClick={() => setSheetLevel(((sheetLevel + 1) % 3) as SheetLevel)}
              className="flex min-h-11 w-full shrink-0 items-center justify-center"
              aria-label="Cambiar la altura del panel"
            >
              <span className="h-1.5 w-12 rounded-full bg-slate-600" aria-hidden />
            </button>
            <div className="flex shrink-0 gap-1 px-3 pb-2" role="tablist" aria-label="Secciones del panel">
              {(['resultados', 'filtros', 'ficha'] as MobileTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab}
                  onClick={() => { setMobileTab(tab); if (sheetLevel === 0) setSheetLevel(1); }}
                  className={`min-h-11 flex-1 rounded-lg px-3 text-sm capitalize ${mobileTab === tab ? 'bg-sky-500/20 text-sky-200' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {mobileTab === 'resultados' && (
                <div className="space-y-3">
                  <StatsBar filtered={filtered} />
                  <ActiveChips />
                  <ResultsList onPick={() => setMobileTab('ficha')} />
                </div>
              )}
              {mobileTab === 'filtros' && <FiltersPanel />}
              {mobileTab === 'ficha' && (
                selectedId ? <DetailPanel /> : (
                  <p className="p-2 text-sm text-slate-400">Selecciona una iniciativa en la lista o en el mapa para ver su ficha.</p>
                )
              )}
            </div>
          </section>
        )}
      </div>

      <footer className="z-10 hidden border-t border-slate-800 bg-[#0d1526] px-4 py-1.5 text-[11px] text-slate-500 sm:block">
        Datos: Directorio Opus Dei MUNDIAL v14 (consulta 2026-11-08 a 2026-11-11) · Ubicaciones: GeoNames (CC BY 4.0), punto representativo de localidad · Límites: Natural Earth · Sin clave CARTO: base local limitada a países, sin detalle de calles.
      </footer>
    </div>
  );
}
