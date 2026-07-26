// One-file build used to produce a portable saviour-of-domania.html (see
// scripts/build-standalone.mjs): everything is bundled into a single chunk and then
// inlined into the HTML so the game runs from a double-clicked local file.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: 'dist-standalone',
    modulePreload: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
