// Zero-dependency static server for the demo. Serves:
//   /openpath.js   -> dist/openpath.js (run `npm run build` first)
//   /lang/*        -> dist/lang/* (language packs)
//   /questions/*   -> public/questions/*
//   /savanna/*     -> public/savanna/*
//   /demo/*        -> demo/*
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5173);

const MOUNTS = [
  ['/openpath.js.map', path.join(root, 'dist/openpath.js.map')],
  ['/openpath.js', path.join(root, 'dist/openpath.js')],
  ['/lang/', path.join(root, 'dist/lang/')], // language packs, next to the script
  ['/questions/', path.join(root, 'public/questions/')],
  ['/savanna/', path.join(root, 'public/savanna/')],
  ['/demo/', path.join(root, 'demo/')],
];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
};

function resolve(urlPath) {
  for (const [prefix, target] of MOUNTS) {
    if (urlPath === prefix) return target;
    if (prefix.endsWith('/') && urlPath.startsWith(prefix)) {
      const file = path.resolve(target, '.' + urlPath.slice(prefix.length - 1));
      return file.startsWith(target) ? file : null; // block ../ escapes
    }
  }
  return null;
}

http
  .createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    if (urlPath === '/' || urlPath === '/demo') {
      res.writeHead(302, { Location: '/demo/' }).end();
      return;
    }
    let file = resolve(urlPath);
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file || !fs.existsSync(file)) {
      const hint = urlPath === '/openpath.js' ? ' Run `npm run build` first.' : '';
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Not found: ${urlPath}.${hint}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => {
    console.log(`OpenPath demo:      http://localhost:${port}/demo/`);
    console.log(`Savanna + link:     http://localhost:${port}/savanna/index.html`);
  });
