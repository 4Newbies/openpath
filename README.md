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

## Run it

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
npm run build && npm run test:browser         # real Chrome/Edge, whole form in en, am and ar (right to left),
                                              # with each helper on and all off: axe incl. contrast,
                                              # 320px/200%/400% reflow, dark mode, focus, targets
                                              # (21 walks send ~320 API requests: start the API with
                                              # RATE_LIMIT_MAX=2000, or stop it to test device-only mode;
                                              # OPENPATH_LANGS=ar runs one language)
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

## Languages

| Attribute | What it does |
|-----------|--------------|
| `lang="am"` | Language to start in (default `en`). |
| `languages="am,en,ar"` | Optional. Shows a language switcher on the first screen and in Settings. Each language is written in itself, with its own `lang` attribute. The learner's choice is remembered on the device. |
| `lang-path="/static/openpath/lang/"` | Optional. Where the packs are. Default: the `lang/` folder next to `openpath.js`. |

English is built into `openpath.js`. Other packs are fetched only when used. A missing
string, a broken pack or a failed download falls back to English; the form keeps working.
`lang` and `dir` on the form come from the pack. Question text that has no translation
is shown in English and marked `lang="en"` (and `dir="ltr"` in a right-to-left form).

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

| `calendar` | Input | Stored answer |
|------------|-------|---------------|
| `"gregorian"` (default) | three boxes: day, month, year | `"2001-03-27"` |
| `"ethiopian"` | a fieldset with three native lists: day, month (13 months, in the learner's language), year | `{ "date": "2001-03-27", "ethiopian": { "year": 1993, "month": 7, "day": 18 } }` |

Pagume (month 13) has 5 days, or 6 when the Ethiopian year mod 4 is 3. The browser and
the API both check that the two dates agree (`calendar_mismatch` otherwise). The review
screen shows the date the way the learner entered it: *18 Megabit 1993 (Ethiopian
calendar)*, *መጋቢት 18 ቀን 1993 ዓ.ም.* The default flow uses the Ethiopian calendar for date of birth.

### Phone country

```json
{ "id": "phone", "type": "phone", "country": "ET", "label": { "en": "What is your phone number?" } }
```

`country` defaults to `"ET"`: the form shows **+251** as text before the box, accepts
`0911 234 567`, `0711 234 567`, `911 234 567` or `+251 911 234 567`, and stores
`+251911234567`. The error message gives an example (*Type it like this: 0911 234 567.*).
`"country": "any"` is a plain phone box (7 to 15 digits, stored as typed). To add a
country, add one entry to `PHONE_COUNTRIES` in `shared/flow.js` (calling code, trunk
prefix, number pattern, example) and its code to the `country` enum in
`shared/questions.schema.json`.

## Events

| Event | `detail` |
|-------|----------|
| `openpath:step` | `{ flowId, stepId, index, total }` (`stepId` is `"setup"` on "How do you want to use this?" and `"review"` on the review screen) |
| `openpath:complete` | `{ flowId, sessionId, answers }`, leaving out answers to `private` questions |

Both bubble and cross the shadow boundary (`composed: true`). Theme with
`--openpath-color`, `--openpath-color-dark` (a light colour for dark mode) and
`--openpath-font` on the element.
