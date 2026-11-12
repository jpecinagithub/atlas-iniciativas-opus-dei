import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Service worker propio de la PWA (Fase 5). La primera versión usaba
// vite-plugin-pwa, pero su cadena de construcción (workbox-build →
// glob/minimatch/deepmerge) acumuló avisos de seguridad sin versión
// corregida compatible (deepmerge sin fix; los fixes de glob y
// minimatch exigen saltos de versión mayor incompatibles). La
// funcionalidad necesaria es pequeña y queda aquí, sin dependencias:
// precarga de la carcasa con versión por huella del contenido, API
// NetworkFirst, datos estáticos StaleWhileRevalidate y glifos
// CacheFirst — el mismo comportamiento que acredita el recorrido.
const PUBLIC_SHELL = [
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

function serviceWorkerSource(version: string, precache: string[]): string {
  return `// Service worker del Atlas — generado en la compilación.
const VERSION = '${version}';
const SHELL = 'atlas-shell-' + VERSION;
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('atlas-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const scopePath = new URL(self.registration.scope).pathname;
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname.replace(/^\\//, '');

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('index.html', { ignoreSearch: true, ignoreVary: true })) ?? new Response('Sin conexión', { status: 503 })),
    );
    return;
  }
  if (path.startsWith('api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open('atlas-api').then((c) => c.put(request, copy)); }
          return res;
        })
        .catch(async () => (await caches.match(request, { ignoreSearch: true, ignoreVary: true })) ?? new Response('Sin conexión', { status: 504 })),
    );
    return;
  }
  if (/^data\\/[^/]+\\.(geojson|json)$/.test(path)) {
    event.respondWith(
      caches.open('atlas-datos').then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
        const network = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => cached);
        return cached ?? network;
      }),
    );
    return;
  }
  if (/^glyphs\\/.+\\.pbf$/.test(path)) {
    event.respondWith(
      caches.open('atlas-glifos').then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true, ignoreVary: true });
    return cached ?? fetch(request);
  })());
});
`;
}

function atlasServiceWorker(): Plugin {
  return {
    name: 'atlas-service-worker',
    generateBundle(_options, bundle) {
      const emitted = Object.keys(bundle).filter((f) => /\.(?:js|mjs|css|html)$/.test(f));
      const precache = [...new Set(['index.html', ...PUBLIC_SHELL, ...emitted])].sort();
      const sizes = precache.map((f) => {
        const item = bundle[f];
        const len = item && 'source' in item ? String(item.source).length : item && 'code' in item ? item.code.length : f.length;
        return `${f}:${len}`;
      });
      const version = createHash('sha256').update(sizes.join('|')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(version, precache) });
    },
  };
}

// Ruta base configurable: si la app se despliega en subruta (Fase 6),
// basta con VITE_BASE_PATH=/la-subruta/ al compilar.
// La web consume la API del Atlas (Fase 3) en /api: en desarrollo y en
// preview, Vite la redirige a la API local (puerto 3001 por defecto).
const apiTarget = process.env.ATLAS_API_TARGET || 'http://127.0.0.1:3001';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
    atlasServiceWorker(),
  ],
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': apiTarget } },
  preview: { proxy: { '/api': apiTarget } },
});
