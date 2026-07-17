import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5174,
  },
  build: {
    outDir: 'game',
    emptyOutDir: true,
  },
});
