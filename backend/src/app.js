import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import crypto from 'node:crypto';
import { LANG_RE, latestToday, validateAnswers } from '../../shared/flow.js';
import { isOpen, jobForSearch, jobFromEmployerAnswers, jobsJsonLd, validateJobPosting } from '../../shared/jobs.js';
import { ApiError, answerError, errorBody, errorHandler } from './errors.js';
import { newResumeCode, newSessionId, SESSION_ID_RE } from './ids.js';
import { StoreConflict, StoreDuplicate } from './store/memory.js';


/**
 * Build the Express app.
 * @param {{ store, flows: Map<string, object>, config }} deps
 */
export function createApp({ store, flows, config, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin ? false : config.corsOrigins.includes(origin)),
      methods: ['GET', 'POST', 'PUT'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  const v1 = express.Router();
  // Per IP address; RATE_LIMIT_MAX=0 turns it off (see config.js).
  if (config.rateLimitMax > 0) v1.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) =>
        res.status(429).json(errorBody('rate_limited', 'Too many requests. Please wait a minute and try again.')),
    }),
  );
  v1.use(express.json({ limit: config.bodyLimit, strict: true }));
  v1.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---- helpers -------------------------------------------------------------
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  async function loadSession(id) {
    if (!SESSION_ID_RE.test(id)) throw new ApiError(404, 'not_found', 'No session with this id.');
    const s = await store.get(id);
    if (!s) throw new ApiError(404, 'not_found', 'No session with this id.');
    return s;
  }

  function flowFor(session) {
    const flow = flows.get(session.flowId);
    if (!flow) throw new ApiError(409, 'flow_unavailable', 'The question flow for this session is no longer available.');
    return flow;
  }

  // Split validated answers into profile answers and private answers, which
  // are stored in different tables.
  function split(flow, clean) {
    const profile = {};
    const privateAnswers = {};
    for (const q of flow.questions) {
      if (!(q.id in clean)) continue;
      // Private answers are stored as text: as typed, or JSON for a list of choices.
      if (q.private) privateAnswers[q.id] = typeof clean[q.id] === 'string' ? clean[q.id] : JSON.stringify(clean[q.id]);
      else profile[q.id] = clean[q.id];
    }
    return { profile, privateAnswers };
  }

  function checkAnswers(flow, answers, mode) {
    if (answers === undefined || answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
      throw new ApiError(400, 'invalid_body', 'Send answers as an object of { questionId: answer }.', 'answers');
    }
    // The learner's "today" may be ahead of the server's: allow any date that
    // is today somewhere on Earth (the browser checks the learner's own day).
    const { errors, clean } = validateAnswers(flow, answers, { mode, today: latestToday() });
    if (errors.length) throw answerError(errors[0]);
    return clean;
  }

  // Stored answers back in their answer shape (private lists are kept as JSON text).
  function storedAnswers(s) {
    const flow = flows.get(s.flowId);
    const priv = {};
    for (const [id, body] of Object.entries(s.private ?? {})) {
      const q = flow?.questions.find((x) => x.id === id);
      try {
        priv[id] = q && q.type !== 'text' ? JSON.parse(body) : body;
      } catch {
        priv[id] = body;
      }
    }
    return { ...s.profile, ...priv };
  }

  const publicView = (s) => ({
    id: s.id,
    resumeCode: s.resumeCode,
    flowId: s.flowId,
    flowVersion: s.flowVersion,
    lang: s.lang,
    context: s.context ?? null,
    status: s.status,
    step: s.step,
    answers: storedAnswers(s),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    submittedAt: s.submittedAt,
  });

  const conflict = () => new ApiError(409, 'already_submitted', 'These answers were already submitted and can no longer be changed.');

  // ---- routes --------------------------------------------------------------
  // The flows this API serves, each validated against its own question file.
  v1.get('/flows', (req, res) => {
    res.json({
      flows: [...flows.values()].map((f) => ({ flowId: f.flowId, version: f.version, title: f.title, questions: f.questions.length })),
    });
  });

  v1.get('/flows/:flowId', (req, res) => {
    const flow = flows.get(req.params.flowId);
    if (!flow) throw new ApiError(404, 'unknown_flow', 'This question flow is not known to the server.', 'flowId');
    res.json(flow);
  });

  v1.get('/health', async (req, res) => {
    await store.ping();
    res.json({ ok: true });
  });

  // Repeat-safe: with the same clientKey, a retried request (for example after
  // a dropped connection) gets the session it already created (200), not a new one.
  const CLIENT_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;
  const EMPLOYER_FLOW = 'employer-accommodations';
  // A small context for the session, e.g. which job an application is for.
  const CONTEXT_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
  function checkContext(context) {
    if (context === undefined || context === null) return null;
    const ok =
      typeof context === 'object' &&
      !Array.isArray(context) &&
      Object.keys(context).length <= 10 &&
      Object.entries(context).every(([k, v]) => CONTEXT_KEY_RE.test(k) && typeof v === 'string' && v.length <= 200);
    if (!ok) throw new ApiError(400, 'invalid_context', 'context must be up to 10 short text values, like { "jobId": "..." }.', 'context');
    return context;
  }

  v1.post('/sessions', async (req, res) => {
    const { flowId, lang = 'en', clientKey } = bodyOf(req);
    const context = checkContext(bodyOf(req).context);
    if (typeof flowId !== 'string' || !flows.has(flowId)) {
      throw new ApiError(400, 'unknown_flow', 'This question flow is not known to the server.', 'flowId');
    }
    if (typeof lang !== 'string' || !LANG_RE.test(lang)) {
      throw new ApiError(400, 'invalid_lang', 'Language must be a language code such as "en", "am" or "ar".', 'lang');
    }
    if (clientKey !== undefined && (typeof clientKey !== 'string' || !CLIENT_KEY_RE.test(clientKey))) {
      throw new ApiError(400, 'invalid_client_key', 'clientKey must be 16 to 64 letters, digits, - or _.', 'clientKey');
    }
    const existing = async () => {
      const s = clientKey ? await store.getByClientKey(clientKey) : null;
      if (s && s.flowId !== flowId) throw new ApiError(409, 'client_key_in_use', 'This clientKey belongs to another flow.', 'clientKey');
      return s;
    };
    const again = await existing();
    if (again) return res.status(200).json({ id: again.id, resumeCode: again.resumeCode });
    const flow = flows.get(flowId);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const s = await store.create({
          id: newSessionId(),
          resumeCode: newResumeCode(),
          flowId,
          flowVersion: flow.version,
          lang,
          clientKey: clientKey ?? null,
          context,
        });
        return res.status(201).json({ id: s.id, resumeCode: s.resumeCode });
      } catch (e) {
        if (!(e instanceof StoreDuplicate)) throw e;
        // Two copies of the same request at once: the other one won.
        const raced = await existing();
        if (raced) return res.status(200).json({ id: raced.id, resumeCode: raced.resumeCode });
      }
    }
    throw new Error('Could not allocate a unique resume code');
  });

  v1.get('/sessions/:id', async (req, res) => {
    res.json(publicView(await loadSession(req.params.id)));
  });

  v1.put('/sessions/:id/answers', async (req, res) => {
    const session = await loadSession(req.params.id);
    if (session.status !== 'open') throw conflict();
    const flow = flowFor(session);
    const { answers, step } = bodyOf(req);
    if (step !== undefined && step !== null && step !== 'review' && !flow.questions.some((q) => q.id === step)) {
      throw new ApiError(400, 'invalid_step', 'step must be a question id or "review".', 'step');
    }
    const clean = checkAnswers(flow, answers, 'save');
    try {
      const saved = await store.saveAnswers(session.id, { ...split(flow, clean), step: step ?? null });
      if (!saved) throw new ApiError(404, 'not_found', 'No session with this id.');
      res.json({ id: saved.id, status: saved.status, step: saved.step, updatedAt: saved.updatedAt });
    } catch (e) {
      if (e instanceof StoreConflict) throw conflict();
      throw e;
    }
  });

  v1.post('/sessions/:id/submit', async (req, res) => {
    const session = await loadSession(req.params.id);
    if (session.status !== 'open') throw conflict();
    const flow = flowFor(session);
    const body = bodyOf(req);
    // Submit the answers sent with the request, or the last saved ones.
    const answers = body.answers !== undefined ? body.answers : storedAnswers(session);
    const clean = checkAnswers(flow, answers, 'submit');
    // The employer form becomes a job listing (schema.org/JobPosting). The job
    // is saved and the session marked submitted in one step: if the job can't
    // be saved, the session stays open and the employer can simply try again.
    const isEmployer = flow.flowId === EMPLOYER_FLOW;
    let saved;
    let job = null;
    try {
      if (isEmployer) job = jobFromEmployerAnswers(clean, { identifier: `job-${session.id}`, today: new Date().toISOString().slice(0, 10), lang: session.lang });
      saved = await store.submit(session.id, { ...split(flow, clean), job });
    } catch (e) {
      if (e instanceof StoreConflict) throw conflict();
      if (!isEmployer) throw e;
      log.error('[openpath] job not saved; session left open', e);
      throw new ApiError(500, 'job_not_saved', 'Your job could not be saved, so nothing was posted. Your answers are kept. Please try again.');
    }
    if (!saved) throw new ApiError(404, 'not_found', 'No session with this id.');
    const out = { id: saved.id, status: saved.status, submittedAt: saved.submittedAt };
    if (job) out.jobId = job.identifier;
    res.json(out);
  });

  // ---- jobs (schema.org/JobPosting) ----------------------------------------
  // The earliest "today" anywhere on Earth (UTC-12): a job stays listed until
  // its last day is over everywhere.
  const earliestToday = () => new Date(Date.now() - 12 * 3600 * 1000).toISOString().slice(0, 10);
  const withContext = (job) => ({ '@context': 'https://schema.org', ...job });

  v1.get('/jobs', async (req, res) => {
    const today = earliestToday();
    const open = (await store.listJobs()).filter((j) => isOpen(j, today)).sort((a, b) => b.datePosted.localeCompare(a.datePosted));
    res.json(jobsJsonLd(open));
  });

  v1.get('/jobs/:identifier', async (req, res) => {
    const job = /^[A-Za-z0-9_-]{1,64}$/.test(req.params.identifier) ? await store.getJob(req.params.identifier) : null;
    if (!job) throw new ApiError(404, 'not_found', 'No job with this identifier.');
    res.json(withContext(jobForSearch(job)));
  });

  // Create or update a job by identifier (for partner platforms).
  v1.post('/jobs', async (req, res) => {
    if (config.jobsApiKey) {
      const given = String(req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const a = Buffer.from(given);
      const b = Buffer.from(config.jobsApiKey);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ApiError(401, 'unauthorized', 'Send the jobs API key: Authorization: Bearer <key>.');
    } else if (config.production) {
      throw new ApiError(403, 'jobs_api_disabled', 'POST /v1/jobs is off: set JOBS_API_KEY to use it.');
    }
    const { '@context': ctx, ...job } = bodyOf(req);
    if (ctx !== undefined && ctx !== 'https://schema.org' && ctx !== 'http://schema.org') {
      throw new ApiError(400, 'invalid_job', '@context must be https://schema.org.', '@context');
    }
    const errors = validateJobPosting(job);
    if (errors.length) throw new ApiError(400, 'invalid_job', `This is not a valid JobPosting: ${errors.join('; ')}.`);
    const { created } = await store.saveJob(job);
    res.status(created ? 201 : 200).json(withContext(job));
  });

  app.use('/v1', v1);
  app.use((req, res) => res.status(404).json(errorBody('not_found', 'There is nothing at this address.')));
  app.use(errorHandler(log));
  return app;
}
