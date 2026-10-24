import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { gdriveProxyPlugin } from './server/gdrive-proxy.js';

export default defineConfig({
  plugins: [tailwindcss(), gdriveProxyPlugin()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    port: 3000,
    open: true
  },
  preview: {
    port: 3000
  },
  css: {
    devSourcemap: true
  }
});
