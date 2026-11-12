import { useEffect } from 'react';
import { useAtlas } from '../store';
import { normalizeExternalUrl } from '../urls';

/**
 * Visor web (Fase 4). Solo se abre tras una acción expresa del usuario
 * (botones «Ver en el visor»). Carga la página directamente desde su
 * sitio en un iframe, sin servidor intermedio ni trucos contra los
 * sitios que prohíben incrustarse: si uno lo prohíbe, el área quedará en
 * blanco y la salida es «Abrir en pestaña nueva».
 */
export function WebViewer() {
  const viewerUrl = useAtlas((s) => s.viewerUrl);
  const closeViewer = useAtlas((s) => s.closeViewer);

  useEffect(() => {
    if (!viewerUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeViewer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerUrl, closeViewer]);

  // Revalidación al renderizar: si el valor no normaliza, no hay visor.
  const safeUrl = normalizeExternalUrl(viewerUrl);
  if (!viewerUrl || !safeUrl) return null;
  const url = safeUrl;
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* se muestra la URL tal cual */
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#04070d]" role="dialog" aria-modal="true" aria-label={`Visor web: ${host}`}>
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#0a1120] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{host}</p>
          <p className="truncate text-xs text-slate-500">{url}</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full border border-white/15 px-3.5 py-2 text-sm text-[#f5d9a8] hover:bg-white/5"
        >
          Abrir en pestaña nueva ↗
        </a>
        <button
          type="button"
          onClick={closeViewer}
          autoFocus
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-100 hover:bg-white/5"
          aria-label="Cerrar visor"
        >
          ✕
        </button>
      </header>
      <p className="border-b border-white/10 bg-[#0a1120] px-4 py-1.5 text-xs text-[#8ca3c7]">
        La página se carga directamente desde su sitio, sin intermediarios. Algunos sitios no permiten mostrarse
        incrustados: si el área queda en blanco, ábrela en una pestaña nueva.
      </p>
      <iframe
        key={url}
        src={url}
        title={`Página de ${host}`}
        className="min-h-0 w-full flex-1 bg-white"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-forms allow-same-origin"
      />
    </div>
  );
}
