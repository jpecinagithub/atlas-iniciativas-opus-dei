import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Ruta base configurable: si la app se despliega en subruta (Fase 6),
// basta con VITE_BASE_PATH=/la-subruta/ al compilar.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173 },
});
