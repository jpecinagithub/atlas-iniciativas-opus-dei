import { create } from 'zustand';
import type { Catalog, Initiative } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface CameraRequest {
  seq: number;
  kind: 'world' | 'country' | 'point';
  countryCode?: string;
  lng?: number;
  lat?: number;
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

  load: async () => {
    try {
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}data/catalog.json`);
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
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Error desconocido' });
    }
  },

  setCountry: (code, fly = true) =>
    set((s) => ({ countryCode: code, camera: fly ? (code ? cam('country', { countryCode: code }) : cam('world')) : s.camera })),
  toggleCategory: (category) =>
    set((s) => ({
      categories: s.categories.includes(category)
        ? s.categories.filter((c) => c !== category)
        : [...s.categories, category],
    })),
  setCategories: (categories) => set({ categories }),
  setQuery: (query) => set({ query }),
  select: (id, fly = false) => {
    const s = get();
    const rec = id ? s.catalog?.initiatives.find((i) => i.id === id) : undefined;
    set({
      selectedId: id,
      camera: fly && rec && rec.lat !== null && rec.lng !== null
        ? cam('point', { lng: rec.lng, lat: rec.lat })
        : s.camera,
    });
  },
  reset: () => set({ countryCode: null, categories: [], query: '', selectedId: null, camera: cam('world') }),
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

/** Sincroniza filtros y selección en la URL (enlaces compartibles). */
export function syncUrl(state: AtlasState) {
  const params = new URLSearchParams();
  if (state.countryCode) params.set('pais', state.countryCode);
  if (state.categories.length > 0) params.set('categorias', state.categories.join(','));
  if (state.query.trim()) params.set('q', state.query.trim());
  if (state.selectedId) params.set('sel', state.selectedId);
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  if (url !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, '', url);
  }
}
