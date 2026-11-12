import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

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
    // PWA (Fase 5): instalable y con caché sin conexión. Se precarga
    // solo la carcasa de la app; los datos voluminosos (geojson de
    // países, glifos y respuestas de la API) entran en la caché de
    // ejecución al primer uso, sin castigar la instalación.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Atlas de iniciativas · Opus Dei',
        short_name: 'Atlas',
        description: 'Mapa interactivo de iniciativas vinculadas documentadas en el directorio v14.',
        lang: 'es',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#0a1120',
        theme_color: '#0a1120',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/[^/]+\.(?:geojson|json)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'atlas-datos-estaticos' },
          },
          {
            urlPattern: /\/glyphs\/.*\.pbf$/,
            handler: 'CacheFirst',
            options: { cacheName: 'atlas-glifos', expiration: { maxEntries: 32 } },
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'atlas-api', networkTimeoutSeconds: 4, expiration: { maxEntries: 64 } },
          },
        ],
      },
    }),
  ],
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': apiTarget } },
  preview: { proxy: { '/api': apiTarget } },
});
