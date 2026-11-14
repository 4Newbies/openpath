import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative whole number`);
  return n;
}

export function loadConfig(env = process.env) {
  return {
    port: int('PORT', 4000),
    databaseUrl: env.DATABASE_URL || '',
    store: env.OPENPATH_STORE === 'memory' ? 'memory' : 'auto',
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    questionsDir: env.QUESTIONS_DIR || path.resolve(here, '../../frontend/public/questions'),
    bodyLimit: env.BODY_LIMIT || '32kb',
    rateLimitWindowMs: int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    rateLimitMax: int('RATE_LIMIT_MAX', 300),
    trustProxy: int('TRUST_PROXY', 0),
  };
}
