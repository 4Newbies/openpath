// API tests for the four session endpoints. Always run against the
// in-memory store; also run against Postgres when TEST_DATABASE_URL is set
// (a dedicated *_test database; see test/global-setup.js).
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
  fullName: 'Hana Tesfaye',
  phone: '0911 234 567', // stored as +251911234567
  dateOfBirth: { date: '2001-03-27', calendar: 'ethiopian', ethiopian: { year: 1993, month: 7, day: 18 } },
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

      it('is safe to repeat with the same clientKey (no second session after a lost reply)', async () => {
        const body = { flowId: 'alx-onboarding', lang: 'am', clientKey: 'k_0123456789abcdefXYZ' };
        const first = await request(app).post('/v1/sessions').send(body).expect(201);
        const again = await request(app).post('/v1/sessions').send(body).expect(200);
        expect(again.body).toEqual(first.body);
        const [a, b] = await Promise.all([
          request(app).post('/v1/sessions').send({ ...body, clientKey: 'k_concurrent_000000001' }),
          request(app).post('/v1/sessions').send({ ...body, clientKey: 'k_concurrent_000000001' }),
        ]);
        expect(a.body.id).toBe(b.body.id);
        expect([a.status, b.status].sort()).toEqual([200, 201]);
        const bad = await request(app).post('/v1/sessions').send({ ...body, clientKey: 'short' }).expect(400);
        expect(bad.body.error).toMatchObject({ code: 'invalid_client_key', field: 'clientKey' });
      });

      it('serves several flows, each validated against its own question file', async () => {
        const list = await request(app).get('/v1/flows').expect(200);
        expect(list.body.flows.map((f) => f.flowId).sort()).toEqual(['alx-onboarding', 'employer-accommodations', 'job-application']);
        const one = await request(app).get('/v1/flows/job-application').expect(200);
        expect(one.body.questions.some((q) => q.id === 'interviewSupport')).toBe(true);
        await request(app).get('/v1/flows/nope').expect(404);

        const job = (await request(app).post('/v1/sessions').send({ flowId: 'job-application' }).expect(201)).body;
        const s = await request(app).get(`/v1/sessions/${job.id}`).expect(200);
        expect(s.body.flowId).toBe('job-application');
        // An onboarding question is not part of the job application.
        const wrong = await request(app).put(`/v1/sessions/${job.id}/answers`).send({ answers: { location: 'Adama' } }).expect(400);
        expect(wrong.body.error).toMatchObject({ code: 'unknown_question', field: 'location' });
        const answers = {
          fullName: 'Hana Tesfaye',
          phone: '0911 234 567',
          experienceYears: '1-3',
          startDate: 'now',
          workHours: ['full-time'],
          interviewSupport: ['extra-time', 'other'],
          interviewSupportOther: 'A quiet room',
        };
        await request(app).post(`/v1/sessions/${job.id}/submit`).send({ answers }).expect(200);
        const done = await request(app).get(`/v1/sessions/${job.id}`).expect(200);
        expect(done.body.answers.interviewSupport).toEqual(['extra-time', 'other']); // private list kept as a list
        expect(done.body.answers.phone).toBe('+251911234567');
      });

      it('a session can record what it is about (the job applied for)', async () => {
        const context = { jobId: 'sample-data-entry-addis', jobTitle: 'Data entry clerk' };
        const { id } = (await request(app).post('/v1/sessions').send({ flowId: 'job-application', context }).expect(201)).body;
        expect((await request(app).get(`/v1/sessions/${id}`)).body.context).toEqual(context);
        for (const bad of [['x'], { 'bad key': 'x' }, { jobId: 'x'.repeat(201) }, { n: 1 }]) {
          const r = await request(app).post('/v1/sessions').send({ flowId: 'job-application', context: bad }).expect(400);
          expect(r.body.error.code).toBe('invalid_context');
        }
      });

      describe('jobs (schema.org/JobPosting)', () => {
        const job = {
          '@context': 'https://schema.org',
          '@type': 'JobPosting',
          identifier: 'partner-1',
          title: [{ '@value': 'Driver', '@language': 'en' }, { '@value': 'ሹፌር', '@language': 'am' }],
          description: 'Drive a delivery van in Addis Ababa.',
          hiringOrganization: { '@type': 'Organization', name: 'Partner Logistics' },
          jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Addis Ababa', addressCountry: 'ET' } },
          employmentType: 'FULL_TIME',
          datePosted: '2026-11-01',
          validThrough: '2099-01-01',
          jobBenefits: ['Flexible hours'],
        };

        it('POST /v1/jobs creates or updates a job; GET /v1/jobs returns JobPosting JSON-LD', async () => {
          const created = await request(app).post('/v1/jobs').send(job).expect(201);
          expect(created.body).toEqual(job);
          await request(app).post('/v1/jobs').send({ ...job, title: 'Senior driver' }).expect(200);
          const list = await request(app).get('/v1/jobs').expect(200);
          expect(list.body['@context']).toBe('https://schema.org');
          expect(list.body['@graph']).toEqual([{ ...job, '@context': undefined, title: 'Senior driver' }].map(({ '@context': _, ...j }) => j));
          const one = await request(app).get('/v1/jobs/partner-1').expect(200);
          expect(one.body).toMatchObject({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Senior driver' });
          await request(app).get('/v1/jobs/nope').expect(404);
        });

        it('rejects anything that is not a valid JobPosting, and leaves closed jobs out of the list', async () => {
          const bad = await request(app).post('/v1/jobs').send({ ...job, accommodations: ['x'] }).expect(400);
          expect(bad.body.error).toMatchObject({ code: 'invalid_job', message: expect.stringMatching(/accommodations/) });
          await request(app).post('/v1/jobs').send({ ...job, '@context': 'https://evil.example' }).expect(400);
          await request(app).post('/v1/jobs').send({ ...job, identifier: 'old', validThrough: '2020-01-01' }).expect(201);
          const list = await request(app).get('/v1/jobs').expect(200);
          expect(list.body['@graph'].map((j) => j.identifier)).not.toContain('old');
        });

        it('needs the jobs API key when one is set, and is off in production without one', async () => {
          const keyed = createApp({ store, flows, config: { ...config, jobsApiKey: 's3cret-key' }, log: silent });
          expect((await request(keyed).post('/v1/jobs').send(job).expect(401)).body.error.code).toBe('unauthorized');
          await request(keyed).post('/v1/jobs').set('Authorization', 'Bearer wrong').send(job).expect(401);
          await request(keyed).post('/v1/jobs').set('Authorization', 'Bearer s3cret-key').send(job).expect(201);
          const prod = createApp({ store, flows, config: { ...config, production: true, jobsApiKey: '' }, log: silent });
          expect((await request(prod).post('/v1/jobs').send(job).expect(403)).body.error.code).toBe('jobs_api_disabled');
        });

        it('submitting the employer form creates a job with the support offered', async () => {
          const { id } = (await request(app).post('/v1/sessions').send({ flowId: 'employer-accommodations', lang: 'en' }).expect(201)).body;
          const answers = {
            jobTitle: 'Receptionist',
            organisation: 'Bole Hotel (test)',
            location: 'Addis Ababa',
            employmentType: 'part-time',
            accommodations: ['step-free-workplace', 'sign-language-interview'],
          };
          const r = await request(app).post(`/v1/sessions/${id}/submit`).send({ answers }).expect(200);
          expect(r.body.jobId).toBe(`job-${id}`);
          const posted = (await request(app).get(`/v1/jobs/job-${id}`).expect(200)).body;
          expect(posted).toMatchObject({
            '@type': 'JobPosting',
            title: 'Receptionist',
            employmentType: 'PART_TIME',
            hiringOrganization: { '@type': 'Organization', name: 'Bole Hotel (test)' },
            jobBenefits: ['Sign language interpreter at interview', 'Step-free workplace'],
          });
          expect((await request(app).get('/v1/jobs')).body['@graph'].some((j) => j.identifier === `job-${id}`)).toBe(true);
        });

        it('leaves the session open when the job cannot be saved, so the employer can try again', async () => {
          const { id } = (await request(app).post('/v1/sessions').send({ flowId: 'employer-accommodations', lang: 'en' }).expect(201)).body;
          const answers = { jobTitle: 'Receptionist', organisation: 'Bole Hotel (test)', location: 'Addis Ababa', employmentType: 'part-time', accommodations: [] };
          // The real store, but the job it is given fails to be written (reading
          // it throws, as a failed disk or connection would), inside submit.
          const failing = Object.create(store);
          const unwritable = (job) => Object.defineProperty({ ...job }, 'broken', { enumerable: true, get: () => { throw new Error('write failed'); } });
          failing.submit = (sid, data) => store.submit(sid, { ...data, job: unwritable(data.job) });
          const broken = createApp({ store: failing, flows, config, log: silent });
          const r = await request(broken).post(`/v1/sessions/${id}/submit`).send({ answers }).expect(500);
          expect(r.body.error.code).toBe('job_not_saved');
          expect(r.body.error.message).toMatch(/try again/);
          expect((await store.get(id)).status).toBe('open');
          await request(app).get(`/v1/jobs/job-${id}`).expect(404);

          // Retry: the job is posted and the session is sent.
          await request(app).post(`/v1/sessions/${id}/submit`).send({ answers }).expect(200);
          expect((await store.get(id)).status).toBe('submitted');
          await request(app).get(`/v1/jobs/job-${id}`).expect(200);
        });
      });

      it('rejects unknown flows and languages with the standard error shape', async () => {
        const r = await request(app).post('/v1/sessions').send({ flowId: 'nope' }).expect(400);
        expect(r.body).toEqual({ error: { code: 'unknown_flow', message: expect.any(String), field: 'flowId' } });
        const l = await request(app).post('/v1/sessions').send({ flowId: 'alx-onboarding', lang: 'French' }).expect(400);
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
        const body = { answers: { fullName: '  Hana  ', language: 'am' }, step: 'phone' };
        const first = await request(app).put(`/v1/sessions/${id}/answers`).send(body).expect(200);
        expect(first.body).toMatchObject({ id, status: 'open', step: 'phone' });
        await request(app).put(`/v1/sessions/${id}/answers`).send(body).expect(200);
        const got = await request(app).get(`/v1/sessions/${id}`).expect(200);
        expect(got.body.answers).toEqual({ fullName: 'Hana', language: 'am' });
      });

      it('replaces the whole answer set, so a cleared answer is removed', async () => {
        const { id } = (await create()).body;
        await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: { fullName: 'A', supportRequest: 'secret' } }).expect(200);
        await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: { fullName: 'A' } }).expect(200);
        const got = await request(app).get(`/v1/sessions/${id}`);
        expect(got.body.answers).toEqual({ fullName: 'A' });
      });

      it('accepts a date that is today somewhere on Earth, rejects one in the future everywhere', async () => {
        const { id } = (await create()).body;
        const day = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
        const put = (date) => request(app).put(`/v1/sessions/${id}/answers`).send({ answers: { dateOfBirth: { date, calendar: 'gregorian' } } });
        await put(day(0)).expect(200);
        const r = await put(day(2)).expect(400);
        expect(r.body.error).toMatchObject({ code: 'future_date', field: 'dateOfBirth' });
      });

      it('validates every answer against the question file', async () => {
        const { id } = (await create()).body;
        const cases = [
          [{ phone: 'call me' }, 'invalid_phone', 'phone'],
          [{ phone: '0811 234 567' }, 'invalid_phone', 'phone'],
          [{ dateOfBirth: { ethiopian: { year: 2016, month: 13, day: 6 } } }, 'invalid_date', 'dateOfBirth'],
          [{ dateOfBirth: { date: '2001-03-28', ethiopian: { year: 1993, month: 7, day: 18 } } }, 'calendar_mismatch', 'dateOfBirth'],
          [{ dateOfBirth: { date: '2001-03-27', calendar: 'julian' } }, 'invalid_type', 'dateOfBirth'],
          [{ language: 'klingon' }, 'invalid_option', 'language'],
          [{ language: ['am'] }, 'invalid_type', 'language'],
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
      it('resumes a session with every saved answer (phone in international format)', async () => {
        const { id, resumeCode } = (await create()).body;
        await request(app).put(`/v1/sessions/${id}/answers`).send({ answers: complete, step: 'course' }).expect(200);
        const r = await request(app).get(`/v1/sessions/${id}`).expect(200);
        expect(r.body).toMatchObject({ id, resumeCode, flowId: 'alx-onboarding', status: 'open', step: 'course', lang: 'en' });
        expect(r.body.answers).toEqual({ ...complete, phone: '+251911234567' });
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

      it('the rate limit comes from the environment, and 0 turns it off', async () => {
        expect(loadConfig({}).rateLimitMax).toBe(1000);
        expect(loadConfig({ RATE_LIMIT_MAX: '5000', RATE_LIMIT_WINDOW_MS: '60000' })).toMatchObject({ rateLimitMax: 5000, rateLimitWindowMs: 60000 });
        expect(() => loadConfig({ RATE_LIMIT_MAX: 'lots' })).toThrow(/RATE_LIMIT_MAX/);
        const open = createApp({ store, flows, config: { ...config, rateLimitMax: 0 }, log: silent });
        for (let i = 0; i < 5; i++) await request(open).get('/v1/health').expect(200);
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
