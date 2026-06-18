import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../public/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/main.jsx'),
      output: {
        format: 'iife',
        name: 'HmsUI',
        entryFileNames: 'hms-ui.js',
        assetFileNames: (info) => {
          if (info.name && info.name.endsWith('.css')) return 'hms-ui.css';
          return 'assets/[name][extname]';
        },
        inlineDynamicImports: true,
      },
    },
  },
});
