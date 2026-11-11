import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Ruta base configurable: si la app se despliega en subruta (Fase 6),
// basta con VITE_BASE_PATH=/la-subruta/ al compilar.
// La web consume la API del Atlas (Fase 3) en /api: en desarrollo y en
// preview, Vite la redirige a la API local (puerto 3001 por defecto).
const apiTarget = process.env.ATLAS_API_TARGET || 'http://127.0.0.1:3001';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': apiTarget } },
  preview: { proxy: { '/api': apiTarget } },
});
