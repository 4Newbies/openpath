-- OpenPath session storage. Safe to run on every start.
-- Private answers (support requests) live in their own table, apart from
-- the profile answers, so they can have separate access rules and retention.

CREATE TABLE IF NOT EXISTS openpath_sessions (
  id            TEXT PRIMARY KEY,
  resume_code   TEXT NOT NULL UNIQUE,
  flow_id       TEXT NOT NULL,
  flow_version  TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'en',
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted')),
  step          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ
);

-- Random key chosen by the browser, so retrying "create a session" after a
-- lost connection returns the same session instead of making a second one.
ALTER TABLE openpath_sessions ADD COLUMN IF NOT EXISTS client_key TEXT UNIQUE;

-- What the session is about, e.g. { "jobId": "...", "jobTitle": "..." } for a job application.
ALTER TABLE openpath_sessions ADD COLUMN IF NOT EXISTS context JSONB;

CREATE TABLE IF NOT EXISTS openpath_profile_answers (
  session_id  TEXT PRIMARY KEY REFERENCES openpath_sessions(id) ON DELETE CASCADE,
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jobs (schema.org/JobPosting JSON), from the employer form or POST /v1/jobs.
CREATE TABLE IF NOT EXISTS openpath_jobs (
  identifier      TEXT PRIMARY KEY,
  data            JSONB NOT NULL,
  source_session  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS openpath_support_requests (
  session_id   TEXT NOT NULL REFERENCES openpath_sessions(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  body         TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, question_id)
);
