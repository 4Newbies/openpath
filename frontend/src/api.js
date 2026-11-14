// Thin client for the OpenPath session API (backend/openapi.yaml).

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.field = body?.error?.field;
  }
}

/**
 * The server can't take the request right now: offline, not running, a
 * gateway is down, or too many requests (429, e.g. a whole class on one IP
 * address). The answers stay on the device and are sent later.
 */
export const isUnreachable = (e) => e instanceof ApiError && [0, 429, 502, 503, 504].includes(e.status);

/** A random key that makes "create a session" safe to repeat (see the API's clientKey). */
export function newClientKey(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createApi(base, { fetchImpl } = {}) {
  const root = base.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';

  // raw: a Blob sent as it is, with its own type (audio for speech-to-text).
  async function call(method, path, body, { raw, signal } = {}) {
    let res;
    try {
      res = await (fetchImpl ?? globalThis.fetch)(root + path, {
        method,
        credentials: 'omit',
        headers: raw ? { 'Content-Type': raw.type } : body ? { 'Content-Type': 'application/json' } : {},
        body: raw ?? (body ? JSON.stringify(body) : undefined),
        signal,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw new ApiError(0, { error: { code: 'network', message: e.message } });
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  const enc = encodeURIComponent;
  return {
    health: () => call('GET', '/health'),
    listJobs: () => call('GET', '/jobs'),
    saveJob: (job) => call('POST', '/jobs', job),
    createSession: (flowId, lang, clientKey, context) => call('POST', '/sessions', { flowId, lang, clientKey, context }),
    getSession: (id) => call('GET', `/sessions/${enc(id)}`),
    saveAnswers: (id, answers, step) => call('PUT', `/sessions/${enc(id)}/answers`, { answers, step }),
    submit: (id, answers) => call('POST', `/sessions/${enc(id)}/submit`, { answers }),
    // Server speech-to-text (optional): which languages, and who does it.
    speechCapabilities: () => call('GET', '/speech/capabilities'),
    transcribe: (audio, lang, { signal } = {}) => call('POST', `/speech/transcribe?lang=${enc(lang)}`, null, { raw: audio, signal }),
  };
}
