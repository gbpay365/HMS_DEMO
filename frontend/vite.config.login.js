import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Staff login only — no Tailwind bundle (avoids global CSS breaking login.css layout). */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../public/dist'),
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/login-main.jsx'),
      output: {
        format: 'iife',
        name: 'HmsLogin',
        entryFileNames: 'hms-login.js',
        inlineDynamicImports: true,
      },
    },
  },
});
