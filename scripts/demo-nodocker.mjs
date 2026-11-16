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

/**
 * Which of our question files the API on `base` does not serve, or serves in
 * another version (an old Docker image started without --build). [] = up to date.
 */
async function staleFlows(base) {
  const dir = path.join(frontend, 'public/questions');
  const local = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  let served = [];
  try {
    served = (await (await fetch(`${base}/v1/flows`)).json()).flows ?? [];
  } catch {
    return local.map((f) => f.flowId);
  }
  return local.filter((f) => !served.some((s) => s.flowId === f.flowId && s.version === f.version)).map((f) => `${f.flowId} ${f.version}`);
}

async function freePort(from) {
  for (let p = from; p < from + 50; p++) if (!(await reachable(`http://localhost:${p}/v1/health`))) return String(p);
  throw new Error('no free port for the API');
}

// 1. API (in memory), unless an up-to-date one is already running on the port (for example Docker).
let apiPort = API_PORT;
let startApi = true;
if (await reachable(`http://localhost:${API_PORT}/v1/health`)) {
  const stale = await staleFlows(`http://localhost:${API_PORT}`);
  if (!stale.length) {
    startApi = false;
    log('[api]', `An API is already running on port ${API_PORT}; using it (it may be the Docker one, with Postgres).`);
  } else {
    // An old API would refuse these forms ("unknown flow"): use a fresh one instead.
    apiPort = await freePort(Number(API_PORT) + 1);
    log('[api]', `The API already on port ${API_PORT} is out of date: it does not serve ${stale.join(', ')}.`);
    log('[api]', `If it is the Docker one, rebuild it: docker compose up --build. For now the demo uses its own in-memory API on port ${apiPort}.`);
  }
}
if (startApi) {
  const api = run('[api]', ['scripts/dev-memory.js'], {
    cwd: backend,
    env: { PORT: apiPort, CORS_ORIGINS: process.env.CORS_ORIGINS || `http://localhost:${DEMO_PORT},http://127.0.0.1:${DEMO_PORT}` },
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
  if (apiPort !== API_PORT) log('[demo]', `Its pages still call the API on port ${API_PORT}. Stop it and run this again, or rebuild the Docker API.`);
} else {
  const demo = run('[demo]', ['scripts/serve.mjs'], {
    cwd: frontend,
    // The demo pages call localhost:4000; point them at the API actually in use.
    env: { PORT: DEMO_PORT, ...(apiPort !== API_PORT ? { OPENPATH_DEMO_API: `http://localhost:${apiPort}` } : {}) },
  });
  demo.on('exit', (code) => {
    log('[demo]', `stopped (exit ${code}).`);
    stopAll(code || 1);
  });
}

// 3. Say where to go once both answer.
for (let i = 0; i < 100; i++) {
  const [a, d] = await Promise.all([reachable(`http://localhost:${apiPort}/v1/health`), reachable(`http://localhost:${DEMO_PORT}/demo/`)]);
  if (a && d) break;
  await new Promise((r) => setTimeout(r, 100));
}
console.log(`
  OpenPath is running without Docker:
    Demo:     http://localhost:${DEMO_PORT}/demo/
    Savanna:  http://localhost:${DEMO_PORT}/savanna/index.html
    API:      http://localhost:${apiPort}/v1/health   ${startApi ? '(in memory: answers are lost when you stop it)' : '(the API that was already running)'}
  Press Ctrl+C to stop.
`);
