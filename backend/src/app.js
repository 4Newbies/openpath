import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { LANG_RE, latestToday, validateAnswers } from '../../shared/flow.js';
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
      allowedHeaders: ['Content-Type'],
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
      if (q.private) privateAnswers[q.id] = String(clean[q.id]);
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

  const publicView = (s) => ({
    id: s.id,
    resumeCode: s.resumeCode,
    flowId: s.flowId,
    flowVersion: s.flowVersion,
    lang: s.lang,
    status: s.status,
    step: s.step,
    answers: { ...s.profile, ...s.private },
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    submittedAt: s.submittedAt,
  });

  const conflict = () => new ApiError(409, 'already_submitted', 'These answers were already submitted and can no longer be changed.');

  // ---- routes --------------------------------------------------------------
  v1.get('/health', async (req, res) => {
    await store.ping();
    res.json({ ok: true });
  });

  // Repeat-safe: with the same clientKey, a retried request (for example after
  // a dropped connection) gets the session it already created (200), not a new one.
  const CLIENT_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

  v1.post('/sessions', async (req, res) => {
    const { flowId, lang = 'en', clientKey } = bodyOf(req);
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
    const answers = body.answers !== undefined ? body.answers : { ...session.profile, ...session.private };
    const clean = checkAnswers(flow, answers, 'submit');
    try {
      const saved = await store.submit(session.id, split(flow, clean));
      if (!saved) throw new ApiError(404, 'not_found', 'No session with this id.');
      res.json({ id: saved.id, status: saved.status, submittedAt: saved.submittedAt });
    } catch (e) {
      if (e instanceof StoreConflict) throw conflict();
      throw e;
    }
  });

  app.use('/v1', v1);
  app.use((req, res) => res.status(404).json(errorBody('not_found', 'There is nothing at this address.')));
  app.use(errorHandler(log));
  return app;
}
