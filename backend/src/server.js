import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { loadFlows } from './flows.js';
import { createMemoryStore } from './store/memory.js';
import { createPgStore } from './store/pg.js';

const config = loadConfig();
const flows = loadFlows(config.questionsDir);

let store;
if (config.databaseUrl) {
  store = createPgStore(config.databaseUrl);
} else if (process.env.NODE_ENV === 'production') {
  console.error('[openpath] DATABASE_URL is required in production');
  process.exit(1);
} else {
  console.warn('[openpath] DATABASE_URL not set: using an in-memory store. Data is lost on restart.');
  store = createMemoryStore();
}

// Postgres may still be starting (e.g. under Docker Compose): retry briefly.
for (let attempt = 1; ; attempt++) {
  try {
    await store.init();
    break;
  } catch (e) {
    if (attempt >= 20) throw e;
    console.warn(`[openpath] database not ready (${e.code || e.message}), retrying…`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const app = createApp({ store, flows, config });
const server = app.listen(config.port, () => {
  console.log(`[openpath] API on http://localhost:${config.port}/v1  flows: ${[...flows.keys()].join(', ')}`);
  if (!config.corsOrigins.length) console.warn('[openpath] CORS_ORIGINS is empty: browsers on other origins will be blocked.');
});

function shutdown() {
  server.close(() => store.close().finally(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
