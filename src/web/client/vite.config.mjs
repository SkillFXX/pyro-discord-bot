import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    svelte({
      onwarn(warning, handler) {
        // Suppress a11y warnings if they occur during automated build
        if (warning.code && warning.code.startsWith('a11y_')) return;
        handler(warning);
      },
    }),
  ],
  root: __dirname,
  base: '/',
  build: {
    outDir: path.resolve(__dirname, '../dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/public': 'http://localhost:3000',
      '/logout': 'http://localhost:3000',
    },
  },
});

