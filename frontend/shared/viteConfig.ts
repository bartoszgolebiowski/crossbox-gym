import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export function createFrontendViteConfig(dirname: string) {
  return defineConfig({
    plugins: [react(), tailwindcss()],
    root: path.resolve(dirname),
    build: {
      outDir: path.resolve(dirname, 'dist'),
      emptyOutDir: true,
    },
  });
}
