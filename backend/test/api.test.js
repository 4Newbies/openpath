// API tests for the four session endpoints. Always run against the
// in-memory store; also run against Postgres when TEST_DATABASE_URL is set
// (e.g. the docker compose database on localhost:5433).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { loadFlows } from '../src/flows.js';
import { createMemoryStore } from '../src/store/memory.js';
import { createPgStore } from '../src/store/pg.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const flows = loadFlows(path.resolve(here, '../../frontend/public/questions'));
const silent = { error() {}, warn() {}, log() {} };

const complete = {
  access: ['larger-text'],
  fullName: 'Hana Tesfaye',
  phone: '+251 911 234 567',
  dateOfBirth: '2001-03-27',
  language: 'am',
  location: 'Addis Ababa',
  idType: 'refer-me',
  referringPartner: 'UNHCR',
  course: 'data-analytics',
  supportRequest: 'I use a wheelchair.',
};

const stores = [['memory', () => createMemoryStore()]];
if (process.env.TEST_DATABASE_URL) stores.push(['postgres', () => createPgStore(process.env.TEST_DATABASE_URL)]);

for (const [name, makeStore] of stores) {
  describe(`API (${name} store)`, () => {
    let store;
    let app;
    const config = { ...loadConfig({}), corsOrigins: ['http://allowed.test'], rateLimitMax: 10_000 };

    beforeAll(async () => {
      store = makeStore();
      await store.init();
      app = createApp({ store, flows, config, log: silent });
    });
    beforeEach(() => store._truncate());
    afterAll(() => store.close());

    const create = () => request(app).post('/v1/sessions').send({ flowId: 'alx-onboarding', lang: 'en' });

    describe('POST /v1/sessions', () => {
      it('creates a session with a crypto-random id and a resume code', async () => {
        const a = await create().expect(201);
        const b = await create().expect(201);
        expect(a.body.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(a.body.resumeCode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
        expect(a.body.id).not.toBe(b.body.id);
        expect(a.headers['cache-control']).toBe('no-store');
      });

      it('rejects unknown flows and languages with the standard error shape', async () => {
        const r = await request(app).post('/v1/sessions').send({ flowId: 'nope' }).expect(400);
        expect(r.body).toEqual({ error: { code: 'unknown_flow', message: expect.any(String), field: 'flowId' } });
        const l = await request(app).post('/v1/sessions').send({ flowId: 'alx-onboarding', lang: 'fr' }).expect(400);
        expect(l.body.error.code).toBe('invalid_lang');
      });

      it('rejects bad JSON and oversized bodies', async () => {
        const bad = await request(app).post('/v1/sessions').set('Content-Type', 'application/json').send('{oops').expect(400);
        expect(bad.body.error.code).toBe('invalid_json');
        const big = await request(app)
          .post('/v1/sessions')
          .send({ flowId: 'alx-onboarding', pad: 'x'.repeat(40_000) })
          .expect(413);
        expect(big.body.error.code).toBe('payload_too_large');
      });
    });

    describe('PUT /v1/sessions/:id/answers', () => {
      it('saves partial progress and is idempotent', async () => {
        const { id } = (await create()).body;
        const body = { answers: { fullName: '  Hana  ', access: ['high-contrast'] }, step: 'phone' };
        const first = await request(app).put(`/v1/sessions/${id}/answers`).send(body).expect(200);
        expect(first.body).toMatchObject({ id, status: 'open', step: 'phone' });
        await request(app).put(`/v1/sessions/${id}/answers`).send(body).expect(200);
        const got = await request(app).get(`/v1/sessions/${id}`).expect(200);
        expect(got.body.answers).toEqual({ fullName: 'Hana', access: ['high-contrast'] });
      });

      it('replaces the whole answer set, so a cleared answer is removed', async () => {
        const { id } = (await create()).body;
        await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: { fullName: 'A', supportRequest: 'secret' } }).expect(200);
        await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: { fullName: 'A' } }).expect(200);
        const got = await request(app).get(`/v1/sessions/${id}`);
        expect(got.body.answers).toEqual({ fullName: 'A' });
      });

      it('validates every answer against the question file', async () => {
        const { id } = (await create()).body;
        const cases = [
          [{ phone: 'call me' }, 'invalid_phone', 'phone'],
          [{ dateOfBirth: '2001-02-30' }, 'invalid_date', 'dateOfBirth'],
          [{ language: 'klingon' }, 'invalid_option', 'language'],
          [{ access: 'larger-text' }, 'invalid_type', 'access'],
          [{ hacker: 'x' }, 'unknown_question', 'hacker'],
          [{ intro: 'x' }, 'not_answerable', 'intro'],
          [{ fullName: 'x'.repeat(121) }, 'too_long', 'fullName'],
        ];
        for (const [answers, code, field] of cases) {
          const r = await request(app).put(`/v1/sessions/${id}/answers`).send({ answers }).expect(400);
          expect(r.body.error).toMatchObject({ code, field });
          expect(typeof r.body.error.message).toBe('string');
        }
        const step = await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: {}, step: 'nowhere' }).expect(400);
        expect(step.body.error.code).toBe('invalid_step');
        const noAnswers = await request(app).put(`/v1/sessions/${id}/answers`).send({}).expect(400);
        expect(noAnswers.body.error.code).toBe('invalid_body');
      });

      it('404s for unknown or malformed ids', async () => {
        await request(app).put('/v1/sessions/AAAAAAAAAAAAAAAAAAAAAA/answers').send({ answers: {} }).expect(404);
        const r = await request(app).put('/v1/sessions/../../etc/answers').send({ answers: {} }).expect(404);
        expect(r.body.error.code).toBe('not_found');
      });
    });

    describe('GET /v1/sessions/:id', () => {
      it('resumes a session with every saved answer', async () => {
        const { id, resumeCode } = (await create()).body;
        await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: complete, step: 'course' }).expect(200);
        const r = await request(app).get(`/v1/sessions/${id}`).expect(200);
        expect(r.body).toMatchObject({ id, resumeCode, flowId: 'alx-onboarding', status: 'open', step: 'course', lang: 'en' });
        expect(r.body.answers).toEqual(complete);
      });

      it('404s for an unknown session', async () => {
        const r = await request(app).get('/v1/sessions/BBBBBBBBBBBBBBBBBBBBBB').expect(404);
        expect(r.body).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
      });
    });

    describe('POST /v1/sessions/:id/submit', () => {
      it('submits, keeps the support request apart from the profile, and locks the session', async () => {
        const { id } = (await create()).body;
        const r = await request(app).post(`/v1/sessions/${id}/submit`).send({ answers: complete }).expect(200);
        expect(r.body).toMatchObject({ id, status: 'submitted', submittedAt: expect.any(String) });

        const raw = await store.get(id);
        expect(raw.profile).not.toHaveProperty('supportRequest');
        expect(raw.private).toEqual({ supportRequest: 'I use a wheelchair.' });

        const again = await request(app).post(`/v1/sessions/${id}/submit`).send({ answers: complete }).expect(409);
        expect(again.body.error.code).toBe('already_submitted');
        await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: {} }).expect(409);
      });

      it('submits the last saved answers when the body has none', async () => {
        const { id } = (await create()).body;
        await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: complete }).expect(200);
        await request(app).post(`/v1/sessions/${id}/submit`).send({}).expect(200);
      });

      it('requires every visible required answer and drops answers hidden by showIf', async () => {
        const { id } = (await create()).body;
        const missing = await request(app).post(`/v1/sessions/${id}/submit`).send({ answers: { fullName: 'A' } }).expect(422);
        expect(missing.body.error).toMatchObject({ code: 'required', field: 'phone' });

        const notReferred = { ...complete, idType: 'passport' };
        await request(app).post(`/v1/sessions/${id}/submit`).send({ answers: notReferred }).expect(200);
        const raw = await store.get(id);
        expect(raw.profile).not.toHaveProperty('referringPartner');
      });
    });

    describe('security middleware', () => {
      it('sets helmet headers and only allows listed CORS origins', async () => {
        const ok = await request(app).options('/v1/sessions').set('Origin', 'http://allowed.test').set('Access-Control-Request-Method', 'POST');
        expect(ok.headers['access-control-allow-origin']).toBe('http://allowed.test');
        const no = await request(app).options('/v1/sessions').set('Origin', 'http://evil.test').set('Access-Control-Request-Method', 'POST');
        expect(no.headers['access-control-allow-origin']).toBeUndefined();
        const r = await create();
        expect(r.headers['x-content-type-options']).toBe('nosniff');
        expect(r.headers['x-powered-by']).toBeUndefined();
      });

      it('rate limits with the standard error shape', async () => {
        const limited = createApp({ store, flows, config: { ...config, rateLimitMax: 2 }, log: silent });
        await request(limited).get('/v1/sessions/CCCCCCCCCCCCCCCCCCCCCC');
        await request(limited).get('/v1/sessions/CCCCCCCCCCCCCCCCCCCCCC');
        const r = await request(limited).get('/v1/sessions/CCCCCCCCCCCCCCCCCCCCCC').expect(429);
        expect(r.body.error.code).toBe('rate_limited');
      });

      it('returns the standard error shape for unknown routes', async () => {
        const r = await request(app).get('/v1/nothing').expect(404);
        expect(r.body.error.code).toBe('not_found');
      });
    });
  });
}
