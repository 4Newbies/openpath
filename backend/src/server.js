import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { loadFlows } from './flows.js';
import { createMemoryStore } from './store/memory.js';
import { createPgStore } from './store/pg.js';

const config = loadConfig();
const flows = loadFlows(config.flowsDir);

const MEMORY_WARNING = [
  '',
  '  ************************************************************',
  '  *  IN-MEMORY STORE: nothing is written to a database.       *',
  '  *  All sessions and answers are LOST when the API stops or  *',
  '  *  restarts. For trying things out only.                    *',
  '  ************************************************************',
  '',
].join('\n');

// OPENPATH_STORE=memory (npm run dev:memory) forces the in-memory store.
const wantMemory = config.store === 'memory' || !config.databaseUrl;
let store;
if (wantMemory && process.env.NODE_ENV === 'production') {
  console.error('[openpath] The in-memory store is not allowed in production: set DATABASE_URL and unset OPENPATH_STORE.');
  process.exit(1);
} else if (wantMemory) {
  if (!config.databaseUrl) console.warn('[openpath] DATABASE_URL is not set.');
  console.warn(MEMORY_WARNING);
  store = createMemoryStore();
} else {
  store = createPgStore(config.databaseUrl);
}

// Postgres may still be starting (e.g. under Docker Compose): retry briefly.
for (let attempt = 1; ; attempt++) {
  try {
    await store.init();
    break;
  } catch (e) {
    if (attempt >= 20) throw e;
    console.warn(`[openpath] database not ready (${e.code || e.message}), retrying...`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const app = createApp({ store, flows, config });
const server = app.listen(config.port, () => {
  console.log(`[openpath] API on http://localhost:${config.port}/v1  flows: ${[...flows.keys()].join(', ')}`);
  if (!config.corsOrigins.length) console.warn('[openpath] CORS_ORIGINS is empty: browsers on other origins will be blocked.');
  if (!config.jobsApiKey) {
    console.log(config.production ? '[openpath] POST /v1/jobs is off (no JOBS_API_KEY).' : '[openpath] POST /v1/jobs is open: set JOBS_API_KEY to require a key.');
  }
  console.log(
    config.rateLimitMax > 0
      ? `[openpath] rate limit: ${config.rateLimitMax} requests per IP address per ${Math.round(config.rateLimitWindowMs / 60000)} min (RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)`
      : '[openpath] rate limit: off (RATE_LIMIT_MAX=0)',
  );
  const sp = config.speech;
  console.log(
    sp.provider === 'none'
      ? '[openpath] speech-to-text: off (SPEECH_PROVIDER=none); forms use the browser recogniser'
      : `[openpath] speech-to-text: ${sp.provider} ("${sp.label}") for ${Object.keys(sp.languages).join(', ')}`,
  );
});

function shutdown() {
  server.close(() => store.close().finally(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
