# OpenPath

A drop-in accessible form. One script tag gives any website a one-question-per-screen
form driven by a JSON question file (WCAG 2.2 AA).

```html
<script src="openpath.js"></script>
<openpath-flow questions="/questions/onboarding.json"
               api="http://localhost:4000" lang="en"></openpath-flow>
```

## Run it

```sh
# 1. API + Postgres (one command; uses .env if present, see .env.example)
docker compose up --build

# 2. Build the tag and serve the demo, Savanna and the question file on :5173
cd frontend && npm install && npm run demo
#    http://localhost:5173/demo/                 plain page using the tag
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
npm run build && npm run test:browser         # real Chrome/Edge, whole form with each helper on and all off:
                                              # axe incl. contrast, 320px/200%/400% reflow, dark mode, focus, targets
```

## Layout

| Path | What |
|------|------|
| `shared/questions.schema.json` | JSON Schema for question files |
| `shared/flow.js` | File + answer validation and `showIf`, used by both the tag and the API |
| `frontend/public/questions/onboarding.json` | Default onboarding flow (also bundled into `openpath.js` as the fallback) |
| `frontend/src/` | `<openpath-flow>`: loader, store, navigator, one step component per type, review |
| `frontend/demo/` | `index.html` (plain host page) and `onboarding.html` (opened from Savanna) |
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

The first screen asks **"How do you want to use this?"**. Its first control,
*Continue with my device's own tools*, turns every helper off. The choice is
saved in `localStorage` (`openpath:prefs`) and the screen is skipped on later
visits; a **Settings** button on every step reopens it. Helpers the browser
can't support are not offered.

| Helper | What it does |
|--------|--------------|
| Read questions to me | A **Listen** button on every step reads the question, hint and options; each step is also read once when the learner moves to it. **Stop** (or Escape) stops it, and it stops on every step change. |
| I want to speak my answers | A **Speak your answer** button (a real `<button>` whose label changes to **Stop listening** while it listens) on questions with `"voice": true`. Asks for consent once. What was said goes into the field, which stays editable, and focus returns to it; choice questions match the words to an option. It never moves on by itself. |
| Simple words | Shows each question's `simple` text and simple option labels, the question's icon (decorative), and short, plain interface text and errors (English and Amharic). |
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

`lang` is `"en"` or `"am"`. Pass `null` to go back to the browser's own provider.

## Events

| Event | `detail` |
|-------|----------|
| `openpath:step` | `{ flowId, stepId, index, total }` (`stepId` is `"setup"` on "How do you want to use this?" and `"review"` on the review screen) |
| `openpath:complete` | `{ flowId, sessionId, answers }`, leaving out answers to `private` questions |

Both bubble and cross the shadow boundary (`composed: true`). Theme with
`--openpath-color`, `--openpath-color-dark` (a light colour for dark mode) and
`--openpath-font` on the element.
