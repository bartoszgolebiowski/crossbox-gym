import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';

// Static HTML page, no React/JSX — only Tailwind CSS needs a build step here.
export default defineConfig({
  plugins: [tailwindcss()],
  root: path.resolve(__dirname),
  server: {
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
