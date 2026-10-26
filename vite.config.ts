import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build: { rollupOptions: { input: { controller: resolve('controller.html'), background: resolve('src/background/index.ts') }, output: { entryFileNames: '[name].js' } } } });
