import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// `npm run build` produces dist/openpath.js: one classic script (IIFE) with
// CSS, icons, the English language pack and the default question file
// inlined. The other language packs are copied to dist/lang/ next to it and
// fetched only when a learner uses that language. No external requests.
const copyLanguagePacks = () => ({
  name: 'openpath-copy-language-packs',
  apply: 'build',
  writeBundle(options) {
    const out = path.join(options.dir ?? 'dist', 'lang');
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync('lang')) if (f.endsWith('.json')) fs.copyFileSync(path.join('lang', f), path.join(out, f));
  },
});

export default defineConfig({
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // the tag imports ../shared/flow.js
  },
  plugins: [copyLanguagePacks()],
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'OpenPath',
      formats: ['iife'],
      fileName: () => 'openpath.js',
    },
    copyPublicDir: false,
    target: 'es2020',
    // Browsers that support logical properties natively. Older targets make
    // the CSS minifier "polyfill" them with :lang(ar)/:lang(he) rules, which
    // guess direction from the language instead of dir (wrong for the
    // dir="ltr" phone box in an Arabic form) and add ~2.5 kB.
    cssTarget: ['chrome89', 'edge89', 'firefox66', 'safari15', 'ios15'],
    cssCodeSplit: false,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
