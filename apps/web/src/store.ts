import { create } from 'zustand';
import type { Catalog, Initiative, InitiativeDetail } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface CameraRequest {
  seq: number;
  kind: 'world' | 'country' | 'point';
  countryCode?: string;
  lng?: number;
  lat?: number;
}

/**
 * Grupo de iniciativas que comparten EXACTAMENTE la misma coordenada
 * representativa de localidad (hotfix Fase 7): el mapa las despliega
 * visualmente (spiderfy) y este estado alimenta el selector. Es un
 * estado transitorio de interacción: se limpia al cambiar filtros,
 * país, búsqueda, selección o al restablecer. Los desplazamientos
 * del spiderfy son solo visuales; nunca se guardan como coordenadas.
 */
export interface CoincidentGroup {
  anchor: [number, number];
  ids: string[];
  locality: string;
}

interface AtlasState {
  status: LoadStatus;
  error: string | null;
  catalog: Catalog | null;
  countryCode: string | null;
  categories: string[];
  query: string;
  selectedId: string | null;
  camera: CameraRequest | null;
  /** Grupo coincidente abierto (spiderfy + selector), o null. */
  coincident: CoincidentGroup | null;
  openCoincident: (group: CoincidentGroup) => void;
  closeCoincident: () => void;
  /** Fichas completas (Fase 4) cacheadas por ID, desde la API. */
  details: Record<string, InitiativeDetail>;
  detailFailedFor: string | null;
  loadDetail: (id: string) => Promise<void>;
  load: () => Promise<void>;
  setCountry: (code: string | null, fly?: boolean) => void;
  toggleCategory: (category: string) => void;
  setCategories: (categories: string[]) => void;
  setQuery: (q: string) => void;
  select: (id: string | null, fly?: boolean) => void;
  reset: () => void;
  viewResultsOnMap: () => void;
}

let camSeq = 0;
function cam(kind: CameraRequest['kind'], extra?: Partial<CameraRequest>): CameraRequest {
  camSeq += 1;
  return { seq: camSeq, kind, ...extra };
}

export const useAtlas = create<AtlasState>((set, get) => ({
  status: 'loading',
  error: null,
  catalog: null,
  countryCode: null,
  categories: [],
  query: '',
  selectedId: null,
  camera: null,
  coincident: null,
  openCoincident: (group) => set({ coincident: group }),
  closeCoincident: () => set({ coincident: null }),
  details: {},
  detailFailedFor: null,

  loadDetail: async (id) => {
    if (get().details[id]) return;
    try {
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}api/initiatives/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const detail = (await res.json()) as InitiativeDetail;
      set((s) => ({ details: { ...s.details, [id]: detail }, detailFailedFor: null }));
    } catch {
      set({ detailFailedFor: id });
    }
  },

  load: async () => {
    try {
      // Fase 3: el catálogo lo sirve la API desde PostgreSQL (antes era un
      // JSON estático). La ruta es relativa a la base de la app.
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}api/catalog`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const catalog = (await res.json()) as Catalog;
      set({ catalog, status: 'ready' });
      // Restaurar vista desde la URL (filtros + selección)
      const params = new URLSearchParams(window.location.search);
      const country = params.get('pais');
      const cats = params.get('categorias');
      const q = params.get('q');
      const sel = params.get('sel');
      if (country && catalog.countries.some((c) => c.code === country)) {
        set({ countryCode: country });
      }
      if (cats) set({ categories: cats.split(',').filter((c) => catalog.meta.categories.includes(c)) });
      if (q) set({ query: q });
      if (sel && catalog.initiatives.some((i) => i.id === sel)) set({ selectedId: sel });
      const restored = get();
      lastNavKey = navKeyOf(restored.countryCode, restored.categories, restored.selectedId);
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Error desconocido' });
    }
  },

  setCountry: (code, fly = true) =>
    set((s) => ({ countryCode: code, coincident: null, camera: fly ? (code ? cam('country', { countryCode: code }) : cam('world')) : s.camera })),
  toggleCategory: (category) =>
    set((s) => ({
      coincident: null,
      categories: s.categories.includes(category)
        ? s.categories.filter((c) => c !== category)
        : [...s.categories, category],
    })),
  setCategories: (categories) => set({ categories, coincident: null }),
  setQuery: (query) => set({ query, coincident: null }),
  select: (id, fly = false) => {
    const s = get();
    const rec = id ? s.catalog?.initiatives.find((i) => i.id === id) : undefined;
    set({
      selectedId: id,
      coincident: null,
      camera: fly && rec && rec.lat !== null && rec.lng !== null
        ? cam('point', { lng: rec.lng, lat: rec.lat })
        : s.camera,
    });
  },
  reset: () => set({ countryCode: null, categories: [], query: '', selectedId: null, coincident: null, camera: cam('world') }),
  viewResultsOnMap: () => {
    const s = get();
    if (s.countryCode) set({ camera: cam('country', { countryCode: s.countryCode }) });
    else set({ camera: cam('world') });
  },
}));

/** Conjunto de resultados único: mapa, lista, ficha y contadores lo comparten. */
export function filterInitiatives(
  all: Initiative[],
  countryCode: string | null,
  categories: string[],
  query: string,
): Initiative[] {
  const q = query.trim().toLowerCase();
  return all.filter((i) => {
    if (countryCode && i.countryCode !== countryCode) return false;
    if (categories.length > 0 && !categories.includes(i.category)) return false;
    if (q) {
      const normalized = i.searchText;
      const needle = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!normalized.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Historial del navegador:
 * - Cada «lugar» de la exploración es una entrada navegable: cambiar de país,
 *   de conjunto de categorías o de selección crea una entrada (pushState).
 * - Escribir en el buscador solo actualiza la entrada actual (replaceState),
 *   para no generar una entrada por tecla.
 * - Al navegar atrás/adelante (popstate), `applyStateFromUrl` reaplica el
 *   estado guardado en la URL, con su vuelo de cámara.
 */
let lastNavKey: string | null = null;

function navKeyOf(countryCode: string | null, categories: string[], selectedId: string | null): string {
  return `${countryCode ?? ''}|${[...categories].sort().join(',')}|${selectedId ?? ''}`;
}

/** Sincroniza filtros y selección en la URL (enlaces compartibles + historial). */
export function syncUrl(state: AtlasState) {
  const params = new URLSearchParams();
  if (state.countryCode) params.set('pais', state.countryCode);
  if (state.categories.length > 0) params.set('categorias', state.categories.join(','));
  if (state.query.trim()) params.set('q', state.query.trim());
  if (state.selectedId) params.set('sel', state.selectedId);
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  const key = navKeyOf(state.countryCode, state.categories, state.selectedId);
  if (lastNavKey === null) lastNavKey = key;
  if (url === `${window.location.pathname}${window.location.search}`) {
    // Sin cambio de URL (p. ej. llegada por popstate): solo bookkeeping.
    lastNavKey = key;
    return;
  }
  if (key !== lastNavKey) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
  lastNavKey = key;
}

/** Reaplica a la store el estado de la URL actual (navegación atrás/adelante). */
export function applyStateFromUrl() {
  const { catalog } = useAtlas.getState();
  if (!catalog) return;
  const params = new URLSearchParams(window.location.search);
  const countryParam = params.get('pais');
  const countryCode = countryParam && catalog.countries.some((c) => c.code === countryParam) ? countryParam : null;
  const catsParam = params.get('categorias');
  const categories = catsParam ? catsParam.split(',').filter((c) => catalog.meta.categories.includes(c)) : [];
  const query = params.get('q') ?? '';
  const selParam = params.get('sel');
  const selectedId = selParam && catalog.initiatives.some((i) => i.id === selParam) ? selParam : null;
  useAtlas.setState({
    countryCode,
    categories,
    query,
    selectedId,
    coincident: null,
    camera: countryCode ? cam('country', { countryCode }) : cam('world'),
  });
  lastNavKey = navKeyOf(countryCode, categories, selectedId);
}
