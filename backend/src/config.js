import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSpeechConfig } from './speech.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Rate limit: requests per IP address per window. Many learners in one
// training centre or school can share one public IP address, and one
// learner going through the form makes about 15 requests, so the default
// (1000 per 15 minutes) allows about 60 learners per address in that time.
// RATE_LIMIT_MAX=0 turns the limit off (only behind your own protection).
export const DEFAULT_RATE_LIMIT_MAX = 1000;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function int(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative whole number`);
  return n;
}

export function loadConfig(env = process.env) {
  return {
    port: int(env, 'PORT', 4000),
    databaseUrl: env.DATABASE_URL || '',
    store: env.OPENPATH_STORE === 'memory' ? 'memory' : 'auto',
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // The flows folder: one question file per flow (onboarding, job-application,
    // employer-accommodations ...). QUESTIONS_DIR is the older name.
    flowsDir: env.FLOWS_DIR || env.QUESTIONS_DIR || path.resolve(here, '../../frontend/public/questions'),
    bodyLimit: env.BODY_LIMIT || '32kb',
    rateLimitWindowMs: Math.max(1000, int(env, 'RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS)),
    rateLimitMax: int(env, 'RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX),
    // Number of reverse proxies in front of the API. Without it, behind a proxy
    // every learner looks like the proxy's address and shares one limit.
    trustProxy: int(env, 'TRUST_PROXY', 0),
    // POST /v1/jobs (for partner platforms) needs "Authorization: Bearer <JOBS_API_KEY>".
    // Without a key it is open in development and switched off in production.
    jobsApiKey: env.JOBS_API_KEY || '',
    production: env.NODE_ENV === 'production',
    // Optional server speech-to-text (SPEECH_PROVIDER, see speech.js). Off by default.
    speech: loadSpeechConfig(env),
  };
}
