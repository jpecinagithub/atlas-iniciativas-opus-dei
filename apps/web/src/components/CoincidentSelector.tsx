import { useEffect, useMemo, useRef } from 'react';
import { useAtlas } from '../store';
import { categoryColor } from '../categories';
import { fmt } from '../format';
import type { Initiative } from '../types';

/**
 * Selector de iniciativas coincidentes (hotfix Fase 7).
 *
 * Varias iniciativas comparten la coordenada representativa de su
 * localidad: en el mapa se ven como un solo punto (o un clúster que
 * nunca se desagrupa). Este selector las lista para poder abrir la
 * ficha de cada una; el despliegue visual (spiderfy) lo pinta
 * MapView desde el mismo estado `coincident` de la store.
 *
 * Presentación: en escritorio, tarjeta flotante a la derecha (el
 * mismo lugar que la ficha); en móvil, hoja inferior. Es un único
 * elemento del DOM con clases responsivas.
 *
 * Accesibilidad: role="dialog" con aria-label «N iniciativas en
 * esta ubicación»; recibe el foco al abrir; la lista son botones
 * (Tab/Enter nativos); Escape lo cierra y el foco vuelve al lienzo
 * del mapa (evento `atlas:focus-map` que escucha MapView).
 */
export function CoincidentSelector() {
  const coincident = useAtlas((s) => s.coincident);
  const catalog = useAtlas((s) => s.catalog);
  const closeCoincident = useAtlas((s) => s.closeCoincident);
  const select = useAtlas((s) => s.select);
  const panelRef = useRef<HTMLDivElement>(null);

  const records = useMemo<Initiative[]>(() => {
    if (!coincident || !catalog) return [];
    return coincident.ids
      .map((id) => catalog.initiatives.find((i) => i.id === id))
      .filter((r): r is Initiative => !!r);
  }, [coincident, catalog]);

  // Foco al abrir y cierre con Escape (en captura, para ganar a
  // cualquier otro Escape global: cerrar el selector no debe cerrar
  // también la ficha que pudiera haber debajo).
  useEffect(() => {
    if (!coincident) return;
    const t = setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeCoincident();
        window.dispatchEvent(new Event('atlas:focus-map'));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [coincident, closeCoincident]);

  if (!coincident || records.length === 0) return null;
  const n = records.length;
  const title = `${fmt(n)} iniciativas en ${coincident.locality}`;

  const closeAndRefocus = () => {
    closeCoincident();
    window.dispatchEvent(new Event('atlas:focus-map'));
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={`${fmt(n)} iniciativas en esta ubicación`}
      className="glass glass-opaque-mobile absolute inset-x-0 bottom-0 z-30 flex max-h-[70dvh] flex-col rounded-t-3xl p-4 shadow-2xl outline-none lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-[92px] lg:max-h-[calc(100dvh-190px)] lg:w-[min(360px,calc(100vw-2rem))] lg:rounded-2xl lg:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold leading-snug text-slate-50">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[#8ca3c7]">
            Comparten la ubicación representativa de la localidad. Elige una para abrir su ficha.
          </p>
        </div>
        <button
          type="button"
          onClick={closeAndRefocus}
          aria-label="Cerrar selector"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-200 transition hover:bg-white/5"
        >
          ✕
        </button>
      </div>
      <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {records.map((rec) => (
          <li key={rec.id}>
            <button
              type="button"
              onClick={() => select(rec.id)}
              className="w-full rounded-xl border border-white/10 bg-[#141f38] px-3.5 py-3 text-left transition hover:border-[#e8a33d]/50 hover:bg-[#1a2947] lg:bg-white/[0.03] lg:hover:bg-white/[0.06]"
            >
              <span className="block truncate text-sm font-medium text-slate-50">{rec.name}</span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[#8ca3c7]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(rec.category) }} aria-hidden />
                {rec.category} · {rec.locality ?? rec.country}
              </span>
              <span className="mt-1.5 block text-xs font-medium text-[#f5d9a8]">Abrir ficha →</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
