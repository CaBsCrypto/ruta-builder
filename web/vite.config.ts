import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  define: { 'import.meta.env.VITE_PUBLIC_DEMO': JSON.stringify(mode === 'public' ? 'true' : 'false') },
  server: {
    host: '127.0.0.1', port: 4310, strictPort: true,
    proxy: Object.fromEntries(['/api', '/diagnostics', '/reports'].map(path => [path, 'http://127.0.0.1:4311'])),
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: mode === 'public' ? '../dist/public' : '../dist/web', emptyOutDir: true, modulePreload: mode === 'public' ? false : undefined },
}));
