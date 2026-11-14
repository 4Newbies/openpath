# OpenPath

A drop-in accessible form. One script tag gives any website a one-question-per-screen
form driven by a JSON question file (WCAG 2.2 AA).

```html
<script src="openpath.js"></script>
<openpath-flow questions="/questions/onboarding.json"
               api="http://localhost:4000" lang="en" languages="en,am"></openpath-flow>
```

Put the `lang/` folder (from `frontend/dist/lang/`) next to `openpath.js`.
English is built in; other languages are loaded from there only when used.

## Run without Docker

All you need is Node.js 20 or newer. From the repo root:

```sh
npm run demo:nodocker
```

This installs the dependencies the first time, starts the API with an **in-memory store**
on http://localhost:4000 and serves the demo on http://localhost:5173:

- http://localhost:5173/demo/ — the form (English, Amharic, Arabic)
- http://localhost:5173/savanna/index.html — Savanna, with "Start accessible onboarding"
- http://localhost:5173/demo/jobs.html — Career Gateway job list (filter, apply)
- http://localhost:5173/demo/employer.html — employer form: post a job and the support offered

Press Ctrl+C to stop both. **Nothing is saved to a database: every session and answer is
lost when the API stops or restarts.** That is fine for trying the form and for frontend
work; use Docker (below) when you need data to stay. If the Docker API is already running
on port 4000, the command uses it instead. Other ports: `API_PORT=4100 DEMO_PORT=5180 npm run demo:nodocker`
(the demo page itself calls `http://localhost:4000`).

Only the API, in memory: `cd backend && npm install && npm run dev:memory`.

The form also works with no API at all: answers stay on the device, a note says they will
be sent when the server is back, and they are sent then (see
[When the server can't be reached](#when-the-server-cant-be-reached)).

## Run with Docker (API + Postgres)

```sh
# 1. API + Postgres (one command; uses .env if present, see .env.example)
docker compose up --build

# 2. Build the tag and serve the demo, Savanna and the question file on :5173
cd frontend && npm install && npm run demo
#    http://localhost:5173/demo/                 plain page using the tag (English, Amharic, Arabic)
#    http://localhost:5173/savanna/index.html    Savanna, with "Start accessible onboarding"
```

Without the `api` attribute the tag skips the network and only fires events.
For hot-reload development of the tag: `cd frontend && npm run dev` (http://localhost:5173/).

## Test it

```sh
cd backend  && npm install && npm test        # API + schema tests (in-memory store)
# also against Postgres from docker compose (a separate openpath_test database,
# created automatically; the demo database is never touched):
TEST_DATABASE_URL=postgres://openpath:local-dev-only@localhost:5433/openpath_test npm test

cd frontend && npm install && npm test        # unit, element and axe (jsdom) tests
npm run build && npm run test:browser         # real Chrome/Edge: the onboarding form, the job list (filter,
                                              # apply) and the employer form, in en, am and ar (right to left),
                                              # with each helper on and all off: axe incl. contrast,
                                              # 320px/200%/400% reflow, dark mode, focus, targets
                                              # (OPENPATH_LANGS=ar and OPENPATH_PAGES=jobs,employer run fewer;
                                              # the employer walks post test jobs, so prefer npm run dev:memory;
                                              # one full run is ~600 API requests: two runs within 15 minutes
                                              # can reach the default rate limit)
npm run review:amharic                        # rebuild docs/amharic-review.md after changing Amharic text
```

## Layout

| Path | What |
|------|------|
| `shared/questions.schema.json` | JSON Schema for question files |
| `shared/flow.js` | File + answer validation, `showIf`, phone countries, used by both the tag and the API |
| `shared/ethiopian.js` | Ethiopian ⇄ Gregorian calendar conversion |
| `frontend/lang/` | Language packs: `en.json` (built in), `am.json`, `ar.json` (draft) |
| `docs/amharic-review.md` | All Amharic beside its English, for a native speaker to check |
| `frontend/public/questions/` | The flows folder: `onboarding.json` (also bundled as the fallback), `job-application.json`, `employer-accommodations.json` |
| `frontend/public/jobs/jobs.json` | Six sample jobs (schema.org/JobPosting, English and Amharic) |
| `shared/jobs.js`, `shared/support-tags.js` | JobPosting validation and the shared list of support tags |
| `frontend/src/` | `<openpath-flow>` (`element.js`: loader, store, navigator, steps, review) and `<openpath-jobs>` (`jobs.js`) |
| `frontend/demo/` | `index.html` (plain host page), `onboarding.html` (opened from Savanna), `jobs.html` and `employer.html` |
| `frontend/public/savanna/` | Savanna static pages, unchanged except one link in `index.html` |
| `backend/` | Express API under `/v1`, Postgres store, `openapi.yaml` |
| `client/`, `server/` | Earlier prototype, untouched |

## Accessibility helpers

**Every helper is off until the learner turns it on.** With all helpers off the
form is plain, native HTML (real labels, buttons, fieldsets, one live region)
built to work with the learner's own tools: TalkBack, VoiceOver, NVDA and JAWS,
voice typing (Android/iOS dictation, Windows voice access), switch access,
keyboard only, browser zoom to 400% and Windows high contrast. The automated
checks (axe, focus order, reflow) pass; sessions with real screen reader and
switch users are still to be done. OpenPath never speaks by itself unless the
learner chose read-aloud, so it doesn't talk over a screen reader.

The first screen asks **"How do you want to use this?"**. When the host offers
several languages, a language switcher comes first; the next control,
*Continue with my device's own tools*, turns every helper off. The choice is
saved in `localStorage` (`openpath:prefs`) and the screen is skipped on later
visits; a **Settings** button on every step reopens it. Helpers the browser
can't support are not offered.

| Helper | What it does |
|--------|--------------|
| Read questions to me | A **Listen** button on every step reads the question, hint and options; each step is also read once when the learner moves to it. **Stop** (or Escape) stops it, and it stops on every step change. |
| I want to speak my answers | A **Speak your answer** button (a real `<button>` whose label changes to **Stop listening** while it listens) on questions with `"voice": true`. Asks for consent once. What was said goes into the field, which stays editable, and focus returns to it; choice questions match the words to an option. It never moves on by itself. |
| Simple words | Shows each question's `simple` text and simple option labels, the question's icon (decorative), and short, plain interface text and errors (from each language pack's `simple` strings). |
| Bigger text | Larger text throughout (shown as soon as it's ticked). |
| High contrast | Black on white (or white and yellow on black in dark mode), thicker borders. |

Without asking, the form also follows the device's **dark mode**
(`prefers-color-scheme`), **more contrast** (`prefers-contrast`), **forced
colours** (Windows high contrast) and **reduced motion**.

### Read-aloud: audio files, then browser voices

For each step OpenPath uses, in order:

1. the question's **audio file** for the current language, if the question file has one;
2. a **browser voice** (`speechSynthesis`) for the current language;
3. otherwise read-aloud is **not available** and the Listen button is hidden.

Audio files are only downloaded when they are played. Add them per language with the
optional `audio` field (http(s) URLs or paths relative to the page):

```json
{ "id": "fullName", "type": "text", "label": { "en": "What is your full name?" },
  "audio": { "en": "/audio/full-name.en.mp3", "am": "/audio/full-name.am.mp3" } }
```

Few devices have an Amharic voice, so recorded `am` audio is the dependable way to read Amharic aloud.

### Voice input

Uses the browser's `SpeechRecognition` (or `webkitSpeechRecognition`). Where it isn't
supported the mic button is not shown at all. Before first use the learner sees:
*"Your voice is sent over the internet to your browser's speech service (Google, if you use Chrome) to turn it into text. Allow?"*
(**Allow** / **No, I will type**); the answer is remembered. There are clear messages
when the microphone is blocked, nothing was heard, or the device is offline. The voice
code is only loaded once the learner turns voice on.

### Your own providers

Register these after the `openpath.js` script tag, for example to use a cloud
Amharic voice or your own speech-to-text service:

```js
OpenPath.setSpeechProvider({
  isAvailable(lang, { audioUrl } = {}) { return true; },     // can you read this language?
  speak(text, lang, { audioUrl } = {}) { return promise; },  // settle when finished or stopped
  stop() {},
});

OpenPath.setVoiceProvider({
  isAvailable() { return true; },
  listen(lang) { return promise; },  // resolve with the text heard; reject with an Error whose
                                     // .code is permission | no_speech | offline | no_microphone | aborted
  stop() {},                         // stop listening; listen() then settles
});
```

`lang` is the form's language code (`"en"`, `"am"`, `"ar"` ...). Pass `null` to go back to the browser's own provider.

## Career Gateway

A second tag, `<openpath-jobs>`, lists jobs from employers who say which support they
offer, lets learners filter privately by the support they need, and opens the job
application form (with all the accessibility helpers) for the job they pick.

```html
<script src="openpath.js"></script>
<openpath-jobs src="/jobs/jobs.json" api="https://api.example.org" lang="en" languages="en,am,ar"></openpath-jobs>
```

Try it: `npm run demo:nodocker`, then http://localhost:5173/demo/jobs.html (job seekers) and
http://localhost:5173/demo/employer.html (employers).

| Attribute | What it does |
|-----------|--------------|
| `src` | URL of the jobs: schema.org/JobPosting JSON (a list, one job, or JSON-LD with `@graph`). |
| `api` | Also lists the API's jobs (`GET /v1/jobs`; the API's version of a job wins) and saves applications there. Without it the file alone is used; if the API is down the file still shows. |
| `lang`, `languages` | Language, as for `<openpath-flow>`. With several `languages` the list has its own language switcher under the "Jobs" heading; the choice is saved like the form's, so *Apply* opens in it. The learner's choice and helpers from "How do you want to use this?" are followed. |
| `apply-flow` | Question file opened by *Apply* (default `job-application`), from `flows-path` (default: the `questions/` folder next to `openpath.js`). |
| `heading-level` | Level of the "Jobs" heading (default 2); job titles are one level below. |

The list:

- Every job title is a heading, each job has exactly one button, *Apply for &lt;title&gt;*.
- Facts are in a description list; dates show in the Ethiopian calendar in Amharic.
- It is keyboard and screen reader friendly and reflows at 200% and 400% zoom.
- The jobs are also written into the host page as JSON-LD
  (`<script type="application/ld+json">`), so search engines and other platforms can
  read them. `title` and `description` start with a plain-text English value (or the
  first value when a job has no English) next to the language-tagged values, because
  search engines read a JobPosting title as plain text. The API's `GET /v1/jobs` does
  the same; jobs are stored as they were sent.

### Private "Support I need" filter

Learners tick the support they need; the list shows only jobs offering all of it, and
the number of results is announced. The screen says: *"Only you can see this. Employers
are not told."* The filter runs only in the browser: it is never sent to a server, never
put in the URL, never included in an event or the application, and not stored unless the
learner ticks *Remember on this device*.

The filter sits in a native `<details>` element. On narrow screens (phones, or high zoom)
it starts closed so the jobs come first; its summary shows how many are chosen, e.g.
*Support I need, Chosen: 2*. On wider screens it starts open.

### Applying

*Apply* opens `<openpath-flow flow="job-application">` for that job:

- Name and phone can be filled in from the onboarding answers (no retyping, WCAG 3.3.7).
  Questions with `"prefillFrom": "alx-onboarding.fullName"` start with that earlier
  answer. Nothing is kept on the device by default, because many people use a shared
  computer: after sending, the done screen asks *"Remember my name and phone on this
  device for job applications?"* with **No** first. Only *Yes* keeps the answers to
  `"reuse": true` questions. *No* also clears an older copy of them. Settings shows what
  is kept and offers *Forget my details*.
- Short questions about experience and availability take voice answers.
- *"Do you need any support for the interview?"* is optional and private. It asks for no
  medical details, is stored apart from the application and is left out of
  `openpath:complete`.
- Disability information is never required to apply.
- The job (`{ jobId, jobTitle, organisation }`) is sent with the session and included in
  `openpath:complete` as `context`.

### Employers

`<openpath-flow flow="employer-accommodations">` asks for the job title, organisation,
location, type, a description and the support offered (the same tags). Submitting it
creates a job in the API. Partner platforms can also create or update jobs with
`POST /v1/jobs` (a JobPosting, matched by `identifier`) when `JOBS_API_KEY` is set; send
it as `Authorization: Bearer <key>`. In production `POST /v1/jobs` is off without a key.

**Before real use:** the employer form is open to anyone and its jobs are listed straight
away. Add employer sign-in or a review step first.

### JobPosting format

Only schema.org terms are used. Text in several languages uses JSON-LD language-tagged
values. **Accommodations are stored in `jobBenefits`**, one text per support tag, using the
tag's English text from `shared/support-tags.js`. OpenPath maps them back to the tags and
shows them in the learner's language; other `jobBenefits` text is shown as written.

```json
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "identifier": "sample-data-entry-addis",
  "title": [{ "@value": "Data entry clerk", "@language": "en" }, { "@value": "የመረጃ መዝጋቢ", "@language": "am" }],
  "description": [{ "@value": "Enter customer records ...", "@language": "en" }],
  "hiringOrganization": { "@type": "Organization", "name": "Addis Digital Services" },
  "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": "Addis Ababa", "addressCountry": "ET" } },
  "employmentType": "FULL_TIME",
  "datePosted": "2026-11-02",
  "validThrough": "2027-06-30",
  "jobBenefits": ["Screen-reader-friendly application", "Step-free workplace"]
}
```

Also accepted: `jobLocationType: "TELECOMMUTE"` with `applicantLocationRequirements`
(`{ "@type": "Country", "name": "ET" }`), `url` and `directApply`. `employmentType` is one or
more of `FULL_TIME`, `PART_TIME`, `CONTRACTOR`, `TEMPORARY`, `INTERN`, `VOLUNTEER`,
`PER_DIEM`, `OTHER`. Jobs past `validThrough` are not listed.

The support tags are: screen-reader-friendly application, sign language interpreter at
interview, step-free workplace, flexible hours, remote work possible, written
instructions, and extra time in assessments.

`frontend/public/jobs/jobs.json` has six fictional sample jobs in Ethiopia, in English
and Amharic.

## Languages

| Attribute | What it does |
|-----------|--------------|
| `lang="am"` | Language to start in (default `en`). |
| `languages="am,en,ar"` | Optional. Shows a language switcher on the first screen and in Settings. Each language is written in itself, with its own `lang` attribute. The learner's choice is remembered on the device. |
| `lang-path="/static/openpath/lang/"` | Optional. Where the packs are. Default: the `lang/` folder next to `openpath.js`. |

English is built into `openpath.js`. Other packs are fetched only when used. A missing
string, a broken pack or a failed download falls back to English; the form keeps working.
`lang` and `dir` on the form come from the pack. Anything shown in English because it has
no translation (a missing interface string or untranslated question text) is marked
`lang="en"`, and `dir="ltr"` in a right-to-left form, so screen readers switch voice.

### Add a language (one JSON file)

1. Copy `frontend/lang/en.json` to `frontend/lang/<code>.json`, for example `ti.json`.
2. Set `code` (`"ti"`), `name` written in that language (`"ትግርኛ"`) and `dir` (`"ltr"`, or `"rtl"` for Arabic, Hebrew, Urdu ...).
3. Translate the `strings`. Keep `{words in brackets}` as they are. `simple` holds the
   simple-words versions; leave out any you don't have and the normal text is used.
   Lists: `gregorianMonths`, `ethiopianMonths`, `voiceYes`/`voiceNo` (words voice input accepts).
4. Optional: add `"draft": true` and a `note` until a native speaker has checked it.
5. `npm run build` copies it to `dist/lang/`. Offer it with `languages="...,ti"`.

`npm test` checks that every pack is valid and has every English string. To translate
the questions too, add the code next to `en` in the question file
(`"label": { "en": "Your name", "ti": "..." }`); the API accepts any language code.

### Right to left

All styles use logical properties (`margin-inline-start`, `padding-block`,
`border-inline-start`, `text-align: start` ...), never left/right, and a test fails if one
creeps in. A pack with `"dir": "rtl"` sets `dir="rtl"` on the form, so the reading order,
Back/Next, the error bar and the checkboxes all flip with no extra CSS. Phone numbers stay
left to right. `lang/ar.json` is a **draft** written to prove this works; it needs review
by a native Arabic speaker.

### Amharic and Ethiopic script

Every question in `onboarding.json` has Amharic. Ethiopic text uses fonts already on the
device (Noto Sans Ethiopic, Nyala, Kefa, Ebrima, Abyssinica SIL, then sans-serif; nothing
is downloaded) with a line height of 1.7. All Amharic is collected in
`docs/amharic-review.md` for a native speaker to correct.

## Country settings

### Calendar for date questions

```json
{ "id": "dateOfBirth", "type": "date", "calendar": "ethiopian", "label": { "en": "What is your date of birth?" } }
```

`calendar` is where the learner **starts**. A button under the fields switches between
*Use Gregorian calendar* and *Use Ethiopian calendar*; the same day is carried over, focus
stays on the button and the change is announced. Every date is stored as the ISO Gregorian
date plus the calendar the learner used:

| Calendar used | Input | Stored answer |
|---------------|-------|---------------|
| `"gregorian"` (default start) | three boxes: day, month, year | `{ "date": "2001-03-27", "calendar": "gregorian" }` |
| `"ethiopian"` | three native lists: day, month (13 months, in the learner's language), year | `{ "date": "2001-03-27", "calendar": "ethiopian", "ethiopian": { "year": 1993, "month": 7, "day": 18 } }` |

A plain `"2001-03-27"` sent to the API is accepted as a Gregorian date. Pagume (month 13)
has 5 days, or 6 when the Ethiopian year mod 4 is 3. The browser and the API both check
that the two dates agree (`calendar_mismatch` otherwise). The review screen shows the date
in the calendar the learner used: *18 Megabit 1993 (Ethiopian calendar)*,
*መጋቢት 18 ቀን 1993 ዓ.ም.*, *27 March 2001*. The default flow starts date of birth in the
Ethiopian calendar.

### Phone country

```json
{ "id": "phone", "type": "phone", "country": "ET", "label": { "en": "What is your phone number?" } }
```

`country` defaults to `"ET"`: the form shows **+251** as text before the box, accepts
`0911 234 567`, `0711 234 567`, `911 234 567` or `+251 911 234 567`, and stores
`+251911234567`. A number from another country is accepted when it starts with `+` and
has 8 to 15 digits (`+44 7700 900123` is stored as `+447700900123`). The error message
gives both examples (*Type it like this: 0911 234 567. For a number from another country,
start with + and the country code, for example +254 712 345 678.*).
`"country": "any"` is a plain phone box (7 to 15 digits, stored as typed). To add a
country, add one entry to `PHONE_COUNTRIES` in `shared/flow.js` (calling code, trunk
prefix, number pattern, example) and its code to the `country` enum in
`shared/questions.schema.json`.

## Rate limit

The API limits requests **per IP address**. In a training centre, school or camp, many
learners often share one public IP address, so set the limit for the size of the group:

| Variable | Default | Meaning |
|----------|---------|---------|
| `RATE_LIMIT_MAX` | `1000` | Requests allowed per IP address per window. One learner makes about 15 requests to finish the form, so 1000 is about 60 learners per 15 minutes from one address. `0` turns the limit off (only if something else protects the API). |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Length of the window, in milliseconds. |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the API. Set it (usually `1`) behind a proxy or load balancer, otherwise every learner looks like the proxy's address and they all share one limit. |

Set them in `.env` (Docker Compose) or the environment (`npm start`). The API prints the
limit it uses when it starts. Over the limit, requests get `429` with code `rate_limited`;
the form keeps the answers on the device and tries again later.

## When the server can't be reached

The form keeps working offline or when the API is down:

- Answers are always kept on the device (`localStorage`) as the learner goes.
- If saving to the server fails, a note at the top says, and screen readers hear,
  *"Saved on this device. It will be sent when you are back online."*
- If the learner presses *Send*, the form shows *"Your answers are saved on this
  device"* and queues the submit, also across a reload. It has *Try sending now* and
  *Change my answers* buttons.
- When the browser comes back online (and every 20 seconds while waiting) it retries,
  then shows the thank-you screen and announces that the answers were sent.
- Every request is safe to repeat: answers are saved as a whole set, a repeated
  submit counts as sent, and the browser sends a random `clientKey` with "create a
  session", so a retry after a lost reply gets the same session, not a second one.

## Events

| Event | `detail` |
|-------|----------|
| `openpath:step` | `{ flowId, stepId, index, total }` (`stepId` is `"setup"` on "How do you want to use this?" and `"review"` on the review screen) |
| `openpath:complete` | `{ flowId, sessionId, answers, context? }`, leaving out answers to `private` questions; `context` is the job for an application. Fired when the server has the answers (or at once without `api`). |
| `openpath:queued` | `{ flowId }`: *Send* was pressed while the server couldn't be reached; the answers wait on the device and `openpath:complete` follows when they are sent. |

Both bubble and cross the shadow boundary (`composed: true`). Theme with
`--openpath-color`, `--openpath-color-dark` (a light colour for dark mode) and
`--openpath-font` on the element.
