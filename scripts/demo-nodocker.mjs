// npm run demo:nodocker  (from the repo root)
//
// Runs everything without Docker or Postgres:
//   - the API with the in-memory store on http://localhost:4000 (data is lost when it stops)
//   - the frontend demo on http://localhost:5173 (builds openpath.js first)
// Installs backend/ and frontend/ dependencies the first time. Ctrl+C stops both.
// Ports: API_PORT (default 4000) and DEMO_PORT (default 5173).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const frontend = path.join(root, 'frontend');
const API_PORT = process.env.API_PORT || '4000';
const DEMO_PORT = process.env.DEMO_PORT || '5173';
const children = [];

const log = (tag, line) => console.log(`${tag} ${line}`);

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

function install(dir) {
  if (fs.existsSync(path.join(dir, 'node_modules'))) return;
  log('[setup]', `Installing dependencies in ${path.relative(root, dir)}/ (first run only)...`);
  const r = spawnSync('npm', ['install', '--no-fund', '--no-audit'], { cwd: dir, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`[setup] npm install failed in ${dir}`);
    process.exit(1);
  }
}

function run(tag, args, { cwd, env = {} }) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) log(tag, l);
    });
  }
  children.push(child);
  return child;
}

function stopAll(code = 0) {
  for (const c of children) if (c.exitCode === null) c.kill();
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

install(backend);
install(frontend);

// 1. API (in memory), unless one is already running on the port (for example Docker).
if (await reachable(`http://localhost:${API_PORT}/v1/health`)) {
  log('[api]', `An API is already running on port ${API_PORT}; using it (it may be the Docker one, with Postgres).`);
} else {
  const api = run('[api]', ['scripts/dev-memory.js'], {
    cwd: backend,
    env: { PORT: API_PORT, CORS_ORIGINS: process.env.CORS_ORIGINS || `http://localhost:${DEMO_PORT}` },
  });
  api.on('exit', (code) => {
    log('[api]', `stopped (exit ${code}).`);
    stopAll(code || 1);
  });
}

// 2. Build openpath.js, then serve the demo.
log('[demo]', 'Building openpath.js...');
const build = spawnSync(process.execPath, [path.join(frontend, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: frontend, encoding: 'utf8' });
if (build.status !== 0) {
  console.error(build.stdout, build.stderr);
  stopAll(1);
}
if (await reachable(`http://localhost:${DEMO_PORT}/demo/`)) {
  log('[demo]', `Something is already serving port ${DEMO_PORT}; using it.`);
} else {
  const demo = run('[demo]', ['scripts/serve.mjs'], { cwd: frontend, env: { PORT: DEMO_PORT } });
  demo.on('exit', (code) => {
    log('[demo]', `stopped (exit ${code}).`);
    stopAll(code || 1);
  });
}

// 3. Say where to go once both answer.
for (let i = 0; i < 100; i++) {
  const [a, d] = await Promise.all([reachable(`http://localhost:${API_PORT}/v1/health`), reachable(`http://localhost:${DEMO_PORT}/demo/`)]);
  if (a && d) break;
  await new Promise((r) => setTimeout(r, 100));
}
console.log(`
  OpenPath is running without Docker:
    Demo:     http://localhost:${DEMO_PORT}/demo/
    Savanna:  http://localhost:${DEMO_PORT}/savanna/index.html
    API:      http://localhost:${API_PORT}/v1/health   (in memory: answers are lost when you stop it)
  Press Ctrl+C to stop.
`);
