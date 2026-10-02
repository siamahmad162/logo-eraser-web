import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const cssTarget = ['chrome100', 'edge100', 'firefox100', 'safari15'];

export default defineConfig(({ mode }) =>
  mode === 'file'
    ? {
        // Single-file test build: every asset inlined, so the page opens straight from disk.
        plugins: [react()],
        base: './',
        build: {
          target: 'es2022',
          cssTarget,
          outDir: 'dist-file',
          assetsInlineLimit: 100 * 1024 * 1024,
          chunkSizeWarningLimit: 4096,
          rolldownOptions: { output: { codeSplitting: false } },
        },
      }
    : {
        plugins: [react()],
        build: { target: 'es2022', cssTarget },
      },
);
