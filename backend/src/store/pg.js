import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { StoreConflict, StoreDuplicate } from './memory.js';

const schemaSql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');

const toSession = (row) => ({
  id: row.id,
  resumeCode: row.resume_code,
  flowId: row.flow_id,
  flowVersion: row.flow_version,
  lang: row.lang,
  clientKey: row.client_key ?? null,
  context: row.context ?? null,
  status: row.status,
  step: row.step,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
});

export function createPgStore(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 10 });

  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async function writeAnswers(client, id, profile, privateAnswers) {
    await client.query(
      `INSERT INTO openpath_profile_answers (session_id, answers, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (session_id) DO UPDATE SET answers = EXCLUDED.answers, updated_at = now()`,
      [id, JSON.stringify(profile)],
    );
    // Replace the whole private set so a cleared answer is really deleted.
    await client.query('DELETE FROM openpath_support_requests WHERE session_id = $1', [id]);
    for (const [questionId, body] of Object.entries(privateAnswers)) {
      await client.query(
        'INSERT INTO openpath_support_requests (session_id, question_id, body) VALUES ($1, $2, $3)',
        [id, questionId, body],
      );
    }
  }

  async function lockOpen(client, id) {
    const { rows } = await client.query('SELECT status FROM openpath_sessions WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) return false;
    if (rows[0].status !== 'open') throw new StoreConflict();
    return true;
  }

  return {
    async init() {
      await pool.query(schemaSql);
    },

    async create({ id, resumeCode, flowId, flowVersion, lang, clientKey = null, context = null }) {
      try {
        return await tx(async (c) => {
          const { rows } = await c.query(
            `INSERT INTO openpath_sessions (id, resume_code, flow_id, flow_version, lang, client_key, context)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [id, resumeCode, flowId, flowVersion, lang, clientKey, context === null ? null : JSON.stringify(context)],
          );
          await c.query('INSERT INTO openpath_profile_answers (session_id) VALUES ($1)', [id]);
          return toSession(rows[0]);
        });
      } catch (e) {
        if (e.code === '23505') throw new StoreDuplicate();
        throw e;
      }
    },

    async get(id) {
      const { rows } = await pool.query(
        `SELECT s.*, COALESCE(p.answers, '{}'::jsonb) AS answers
         FROM openpath_sessions s LEFT JOIN openpath_profile_answers p ON p.session_id = s.id
         WHERE s.id = $1`,
        [id],
      );
      if (!rows.length) return null;
      const priv = await pool.query('SELECT question_id, body FROM openpath_support_requests WHERE session_id = $1', [id]);
      return {
        ...toSession(rows[0]),
        profile: rows[0].answers,
        private: Object.fromEntries(priv.rows.map((r) => [r.question_id, r.body])),
      };
    },

    async getByClientKey(clientKey) {
      const { rows } = await pool.query('SELECT id FROM openpath_sessions WHERE client_key = $1', [clientKey]);
      return rows.length ? this.get(rows[0].id) : null;
    },

    async saveAnswers(id, { profile, privateAnswers, step }) {
      const found = await tx(async (c) => {
        if (!(await lockOpen(c, id))) return false;
        await writeAnswers(c, id, profile, privateAnswers);
        await c.query('UPDATE openpath_sessions SET step = $2, updated_at = now() WHERE id = $1', [id, step ?? null]);
        return true;
      });
      return found ? this.get(id) : null;
    },

    async submit(id, { profile, privateAnswers }) {
      const found = await tx(async (c) => {
        if (!(await lockOpen(c, id))) return false;
        await writeAnswers(c, id, profile, privateAnswers);
        await c.query(
          `UPDATE openpath_sessions SET status = 'submitted', submitted_at = now(), updated_at = now() WHERE id = $1`,
          [id],
        );
        return true;
      });
      return found ? this.get(id) : null;
    },

    async saveJob(job, { sourceSession = null } = {}) {
      const { rows } = await pool.query(
        `INSERT INTO openpath_jobs (identifier, data, source_session) VALUES ($1, $2, $3)
         ON CONFLICT (identifier) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
         RETURNING (xmax = 0) AS created`,
        [job.identifier, JSON.stringify(job), sourceSession],
      );
      return { job, created: rows[0].created };
    },

    async getJob(identifier) {
      const { rows } = await pool.query('SELECT data FROM openpath_jobs WHERE identifier = $1', [identifier]);
      return rows.length ? rows[0].data : null;
    },

    async listJobs() {
      const { rows } = await pool.query('SELECT data FROM openpath_jobs ORDER BY created_at DESC LIMIT 500');
      return rows.map((r) => r.data);
    },

    async ping() {
      await pool.query('SELECT 1');
    },

    async close() {
      await pool.end();
    },

    // Test helper only.
    async _truncate() {
      await pool.query('TRUNCATE openpath_support_requests, openpath_profile_answers, openpath_sessions, openpath_jobs');
    },
  };
}
