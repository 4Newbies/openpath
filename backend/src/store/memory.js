// In-memory store with the same interface as the Postgres store.
// Used by the API tests and when DATABASE_URL is not set in development.
// Keeps profile and private answers in separate maps, like the real tables.

export class StoreConflict extends Error {}
export class StoreDuplicate extends Error {}

export function createMemoryStore() {
  const sessions = new Map();
  const profiles = new Map();
  const privates = new Map();
  const jobs = new Map(); // identifier -> { data, sourceSession }
  const clone = (v) => structuredClone(v);

  function view(id) {
    const s = sessions.get(id);
    if (!s) return null;
    return { ...clone(s), profile: clone(profiles.get(id) ?? {}), private: clone(privates.get(id) ?? {}) };
  }

  function openOrThrow(id) {
    const s = sessions.get(id);
    if (!s) return null;
    if (s.status !== 'open') throw new StoreConflict();
    return s;
  }

  return {
    async init() {},
    async create({ id, resumeCode, flowId, flowVersion, lang, clientKey = null, context = null }) {
      const all = [...sessions.values()];
      if (sessions.has(id) || all.some((s) => s.resumeCode === resumeCode || (clientKey && s.clientKey === clientKey))) {
        throw new StoreDuplicate();
      }
      const now = new Date().toISOString();
      sessions.set(id, {
        id, resumeCode, flowId, flowVersion, lang, clientKey, context: clone(context),
        status: 'open', step: null, createdAt: now, updatedAt: now, submittedAt: null,
      });
      profiles.set(id, {});
      privates.set(id, {});
      return view(id);
    },
    async get(id) {
      return view(id);
    },
    async getByClientKey(clientKey) {
      const s = [...sessions.values()].find((x) => x.clientKey === clientKey);
      return s ? view(s.id) : null;
    },
    async saveAnswers(id, { profile, privateAnswers, step }) {
      const s = openOrThrow(id);
      if (!s) return null;
      profiles.set(id, clone(profile));
      privates.set(id, clone(privateAnswers));
      s.step = step ?? null;
      s.updatedAt = new Date().toISOString();
      return view(id);
    },
    async submit(id, { profile, privateAnswers }) {
      const s = openOrThrow(id);
      if (!s) return null;
      profiles.set(id, clone(profile));
      privates.set(id, clone(privateAnswers));
      s.status = 'submitted';
      s.submittedAt = s.updatedAt = new Date().toISOString();
      return view(id);
    },
    /** Create or replace a job by identifier. Returns { job, created }. */
    async saveJob(job, { sourceSession = null } = {}) {
      const created = !jobs.has(job.identifier);
      jobs.set(job.identifier, { data: clone(job), sourceSession: created ? sourceSession : jobs.get(job.identifier).sourceSession });
      return { job: clone(job), created };
    },
    async getJob(identifier) {
      return jobs.has(identifier) ? clone(jobs.get(identifier).data) : null;
    },
    async listJobs() {
      return [...jobs.values()].map((j) => clone(j.data));
    },
    async ping() {},
    async close() {},
    async _truncate() {
      sessions.clear();
      profiles.clear();
      privates.clear();
      jobs.clear();
    },
  };
}
