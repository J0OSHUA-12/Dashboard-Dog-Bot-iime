import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// En desarrollo, inyecta el token de sesión que escribe el servicio local.
function devToken(): Plugin {
  return {
    name: 'dogbot-dev-token',
    apply: 'serve',
    transformIndexHtml(html) {
      let token = '';
      try {
        token = fs.readFileSync('.dogbot/session-token', 'utf8').trim();
      } catch {
        /* servicio no iniciado: modo simulación */
      }
      return html.replace('<meta name="dogbot-token" content="" />', `<meta name="dogbot-token" content="${token}" />`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), devToken()],
  define: {
    __PREVIEW_BUILD__: JSON.stringify(mode === 'preview'),
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5178', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:5178', ws: true, changeOrigin: true },
    },
  },
}));
