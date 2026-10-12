// La app de Vue vive en web/ y se compila a web/dist, que es lo que sirve
// server.js en /app. En desarrollo (npm run dev:web) Vite levanta su propio
// servidor y le pasa /api al de Express, así la sesión es la misma.
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'web',
  base: '/app/',
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
