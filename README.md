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
# also against Postgres from docker compose:
TEST_DATABASE_URL=postgres://openpath:local-dev-only@localhost:5433/openpath npm test

cd frontend && npm install && npm test        # unit, element and axe (jsdom) tests
npm run build && npm run test:browser         # real Chrome/Edge: axe incl. contrast, 320px/200%/400% reflow, focus, targets
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

## Events

| Event | `detail` |
|-------|----------|
| `openpath:step` | `{ flowId, stepId, index, total }` (`stepId` is `"review"` on the review screen) |
| `openpath:complete` | `{ flowId, sessionId, answers }`, leaving out answers to `private` questions |

Both bubble and cross the shadow boundary (`composed: true`). Theme with
`--openpath-color` and `--openpath-font` on the element.
