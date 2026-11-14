import { defineConfig } from 'vite';

// `npm run build` produces dist/openpath.js: one classic script (IIFE) with
// CSS, icons and the default question file inlined. No external requests.
export default defineConfig({
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // the tag imports ../shared/flow.js
  },
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'OpenPath',
      formats: ['iife'],
      fileName: () => 'openpath.js',
    },
    copyPublicDir: false,
    target: 'es2020',
    cssCodeSplit: false,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
