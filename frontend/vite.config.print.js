import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Print layouts — Tailwind bundled into hms-print.js (scoped via .hms-ui wrapper). */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../public/dist'),
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/print-main.jsx'),
      output: {
        format: 'iife',
        name: 'HmsPrint',
        entryFileNames: 'hms-print.js',
        inlineDynamicImports: true,
      },
    },
  },
});
