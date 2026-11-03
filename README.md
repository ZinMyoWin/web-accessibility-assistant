# Web Accessibility Audit and Repair Assistant

A full-stack web app for scanning webpages, finding accessibility issues, saving scan history, and giving repair guidance through a browser dashboard.

Start here when you are new to the project. Deeper explanations live in `docs/`.

The frontend uses a unified AccessAudit design system across public pages,
account access and the audit workspace: Manrope typography, high-contrast blue
actions, neutral surfaces, responsive layouts and shared accessible controls.
See [the redesign guide](docs/design/2026-11-03-accessaudit-redesign.md) for the
what, why and how, visual foundations, scope and verification limits.

## What The Project Does

AccessAudit lets a signed-in user:

1. enter a public webpage URL
2. run a single-page scan or a bounded multi-page crawl
3. review accessibility issues, screenshots, page URLs, DOM paths, and WCAG tags
4. save scan results in PostgreSQL
5. compare, review, and report on saved scans
6. generate one AI repair suggestion for a group of similar issues
7. export every grouped repair suggestion for a scan as one markdown patch bundle
8. cancel a queued or running scan while keeping the partial results already found

Scan execution uses the saved Preferences by default (mode, page limits, crawl depth, WCAG standard, best practices); direct request fields still override them. The scanner combines custom checks in `backend/app/services/page_scanner.py` with axe-core checks in `backend/app/services/axe_scanner.py`. API routes are defined in `backend/app/main.py`.

## Tech Stack

- Frontend: Next.js 15, React 19, Auth.js, Tailwind CSS v4, Vitest, Testing Library, Playwright
- Backend: FastAPI, Pydantic, SQLAlchemy, Alembic, pytest
- Scanning: Playwright/Chromium, axe-core, custom HTML checks
- Data: PostgreSQL
- Background work: `backend/app/scan_worker.py`
- Performance and observability: benchmark harness (`scripts/perf/`), scan phase timings, Prometheus-style `GET /metrics`
- CI: `.github/workflows/quality-gate.yml` (typecheck, Vitest, production build, Playwright E2E, backend pytest)

## Repository Structure

```text
web-accessibility-assistant/
|- backend/
|  |- app/                  FastAPI routes, services, repositories, models, schemas
|  |- alembic/              database migration setup and versions
|  `- tests/                backend pytest suite
|- frontend/
|  |- src/                  Next.js routes, components, hooks, libraries, tests
|  `- e2e/                  Playwright browser end-to-end specs
|- docs/                    architecture, guides, implementation notes, tracking
|- scripts/perf/            scanner + database benchmark harness
|- docker-compose.yml       production-style local stack
|- docker-compose.dev.yml   hot-reload development stack
|- AGENTS.md                contributor workflow notes
`- README.md
```

Why this matters: route handlers live in `backend/app/main.py`; database work usually belongs in `backend/app/repositories/`; scanning logic belongs in `backend/app/services/`; shared frontend API mapping belongs in `frontend/src/lib/`.

## Documentation Map

- `docs/README.md`: documentation index and maintenance rules
- `docs/architecture/system-architecture.md`: architecture, flows, APIs, data model, risks, glossary, open questions
- `docs/architecture/scan-performance-analysis.md`: performance analysis, bottleneck ranking, implemented optimizations, remaining work
- `docs/architecture/performance-baseline.md`: measured pre-optimization baseline (methodology + results)
- `docs/architecture/performance-results.md`: measured post-optimization results, functional-equivalence checks and caveats
- `docs/guides/docker-setup-guide.md`: Docker setup walkthrough
- `docs/guides/database-setup-guide.md`: historical PostgreSQL/Alembic bootstrap guide
- `docs/implementation/backend-persistence-implementation-guide.md`: historical persistence implementation plan
- `docs/tracking/feature-checklist.md`: current implemented vs pending feature status
- `docs/tracking/feature-inventory.md`: report-ready inventory of each feature (Lead-maintained snapshot)
- `docs/tracking/implementation-log.md`: chronological implementation evidence

Avoid duplicating details. Put quick setup here, feature status in `docs/tracking/feature-checklist.md`, and deep technical explanations in `docs/architecture/system-architecture.md`.

## Prerequisites

For local development without Docker:

- Python 3.11
- Node.js 22 or later
- npm
- PostgreSQL, usually through Docker Compose

For browser end-to-end tests, install the Playwright Chromium build once inside `frontend/`:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant\frontend"
npx playwright install chromium
```

For Docker development:

- Docker Desktop

## Environment Setup

Create an uncommitted `.env` at the project root when using Docker Compose. Compose requires:

```text
AUTH_JWT_SECRET=replace-with-a-long-random-backend-secret
AUTH_SECRET=replace-with-a-long-random-frontend-secret
```

Common backend variables:

```text
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/accessibility_assistant
FRONTEND_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
CORS_ALLOWED_ORIGIN_REGEX=
SCAN_EXECUTION_MODE=worker
SCAN_WORKER_STALE_AFTER_SECONDS=300
AUTH_JWT_SECRET=replace-with-a-long-random-backend-secret
FRONTEND_BASE_URL=http://localhost:3000
PASSWORD_RESET_LOG_LINKS=false
CLOUDINARY_URL=
CLOUDINARY_SCREENSHOT_FOLDER=accessaudit/issue-screenshots
CLOUDINARY_SCREENSHOT_FALLBACK=
OAUTH_PROXY_SECRET=
ENCRYPTION_KEY=
```

Optional performance, reliability and observability variables (defaults shown; all are safe to omit):

```text
SCAN_BROWSER_REUSE_ENABLED=true      # worker reuses one Chromium across jobs
SCAN_BROWSER_MAX_JOBS=250            # recycle the reused browser after N jobs
SCAN_RENDER_IDLE_TIMEOUT_MS=1500     # networkidle ceiling per page
SCAN_RENDER_SETTLE_MS=100            # extra settle time after load
SCAN_MAX_SCREENSHOTS=10              # unique screenshots captured per page
SCAN_MAX_SECONDS=240                 # multi-page wall-clock time budget
AXE_SCRIPT_PATH=                     # override the vendored axe-core asset path
SCAN_ALLOW_PRIVATE_TARGETS=false     # recommended in production (default true for local demos)
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=10
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=1800
DB_POOL_PRE_PING=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_SCAN_PER_MINUTE=30
RATE_LIMIT_AUTH_PER_MINUTE=10
METRICS_ENABLED=true
SCAN_SLOW_LOG_SECONDS=10
```

Common frontend variables are shown in `frontend/.env.example`:

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
AUTH_API_BASE_URL=http://127.0.0.1:8000
AUTH_SECRET=replace-with-a-long-random-frontend-secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OAUTH_PROXY_SECRET=
```

Common mistakes:

- `AUTH_API_BASE_URL` is server-side. In Docker it should be `http://backend:8000`.
- `NEXT_PUBLIC_API_BASE_URL` is browser-facing. In local Docker it should be `http://localhost:8000`.
- Keep `AUTH_SECRET` and `AUTH_JWT_SECRET` stable across restarts or sessions will break.
- Set a real `ENCRYPTION_KEY` outside local development so stored provider keys are not protected by the development fallback.
- Keep `PASSWORD_RESET_LOG_LINKS=false` except for local password-reset testing. It prints reset links to backend logs.
- Set `SCAN_ALLOW_PRIVATE_TARGETS=false` in production; the default (`true`) exists so local demo/test pages on `127.0.0.1` remain scannable.
- Run Alembic migrations after pulling schema changes.

## Run Locally Without Docker

Backend:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant\backend"
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m playwright install chromium
.\venv\Scripts\alembic.exe upgrade head
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Frontend:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant\frontend"
npm install
npm run dev
```

Open:

- frontend: `http://127.0.0.1:3000`
- dashboard: `http://127.0.0.1:3000/dashboard`
- backend health: `http://127.0.0.1:8000/health`
- backend docs: `http://127.0.0.1:8000/docs`
- deterministic test page: `http://127.0.0.1:8000/test/page-bad`
- JavaScript-rendered test page: `http://127.0.0.1:8000/test/page-js-rendered`
- metrics (Prometheus text): `http://127.0.0.1:8000/metrics`

## Run With Docker

Production-style local stack:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant"
docker compose up --build
```

Development stack with hot reload:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant"
docker compose -f docker-compose.dev.yml up --build
```

Services:

- `frontend`: `http://127.0.0.1:3000`
- `backend`: `http://127.0.0.1:8000`
- `scan-worker`: background scanner, no browser URL
- `db`: PostgreSQL on `localhost:5432`

Scan throughput can be scaled horizontally because queued-job claiming uses row locks:

```powershell
docker compose up --build --scale scan-worker=3
```

or set `SCAN_WORKER_REPLICAS=3` in `.env`. The worker polls for queued jobs every 0.5 seconds by default (`SCAN_WORKER_POLL_INTERVAL_SECONDS`).

## Test And Verify

Backend:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant\backend"
.\venv\Scripts\python.exe -m compileall app
.\venv\Scripts\python.exe -m pytest -q tests
```

Frontend:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant\frontend"
npx tsc --noEmit
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` starts a production build of the Next.js app automatically (`npm run build && npm run start` via `webServer` in `frontend/playwright.config.ts`), so no backend or database is required. The browser suite stubs the FastAPI calls it needs and mints a signed NextAuth session cookie for authenticated flows. The first local run builds the app, so it takes a minute longer than later runs. Add `test:e2e:report` after a failure to open the HTML report.

CI runs four jobs in `.github/workflows/quality-gate.yml`: frontend typecheck + Vitest, frontend production build, Playwright browser E2E (installs Chromium and uploads reports/traces on failure), and backend `compileall` + pytest. It does not run a standalone lint command or enforce coverage thresholds. Current suite sizes: 201 backend pytest tests, 42 frontend Vitest tests and 8 Playwright E2E tests.

Performance benchmarks are optional and documented separately:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant"
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py --json-out scripts\perf\optimized.json
backend\venv\Scripts\python.exe scripts\perf\bench_db.py --iterations 20 --json-out scripts\perf\db_optimized.json
```

See `docs/architecture/scan-performance-analysis.md` for methodology, `performance-baseline.md` for the pre-optimization numbers and `performance-results.md` for the measured post-optimization comparison.

Manual smoke flow:

1. Start the backend and frontend.
2. Create an account or log in.
3. Open `/dashboard`.
4. Scan `http://127.0.0.1:8000/test/page-bad`.
5. Confirm the dashboard shows issues and a `scan_id`.
6. Open Scan History and Reports to confirm the saved scan is available.
7. Scan `http://127.0.0.1:8000/test/page-js-rendered` to exercise rendered JavaScript checks.

## Core API Surface

Routes are implemented in `backend/app/main.py`.

- `GET /` and `GET /health`: service checks
- `GET /metrics`: Prometheus text metrics (counters/histogram/gauges; 404 when `METRICS_ENABLED=false`)
- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`: account/session flow
- `POST /auth/google`: env-gated Google profile exchange from the trusted Next.js server
- `POST /auth/forgot-password`, `POST /auth/reset-password`: single-use reset-token scaffold
- `POST /scan/page`: create a scan or queued crawl; all fields other than `url` are optional and inherit saved Preferences (`mode`, page limits, crawl depth, delays, URL filters, WCAG standard, best practices), while explicit fields override them
- `GET /scans`, `GET /scans/{scan_id}`: saved scan list/detail for the current user; `GET /scans/{scan_id}?include_issues=false` returns the same shape with an empty `issues` list for lightweight status polling
- `POST /scans/{scan_id}/cancel`: cancel a queued scan or request that a running scan stop between pages; already-finished scans return 409
- `GET /scans/{scan_id}/repair-suggestion-bundle?format=markdown|json`: download every grouped repair suggestion for a scan as one document
- `POST /scans/{scan_id}/queue/remove`, `POST /scans/{scan_id}/queue/prioritize`: queue controls; body is `{ "url": "..." }`
- `DELETE /scans`: clear the current user's scan history
- `GET /preferences`, `PUT /preferences`, `POST /preferences/reset`: user-scoped settings, including notification threshold/severity fields
- `GET /scans/{scan_id}/repair-suggestion-groups`: grouped issue patterns
- `POST /scans/{scan_id}/repair-suggestion-groups/{group_key}/generate`: generate or reuse an AI suggestion

Scan, preference, queue, cancel, bundle, history, and repair-suggestion routes require a backend bearer token. The frontend stores that token inside the Auth.js session.

## Data Model At A Glance

SQLAlchemy models live in `backend/app/models/`.

- `User`, `UserSession`, `PasswordResetToken` in `backend/app/models/auth.py`
- `ScanRun`, `ScanIssueRecord` in `backend/app/models/scan.py`
- `AppPreferences` in `backend/app/models/preferences.py`
- `RepairSuggestion` in `backend/app/models/repair_suggestion.py`

Migrations live in `backend/alembic/versions/` (current head: `9848b576f075`, which adds the scan-performance composite indexes after the notification/cancel/WCAG migrations). Apply them with:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant\backend"
.\venv\Scripts\alembic.exe upgrade head
```

## How To Safely Change The Project

Backend changes:

- Change request/response fields in `backend/app/schemas/`.
- Keep route handlers in `backend/app/main.py` thin when possible.
- Put database access in `backend/app/repositories/`.
- Add an Alembic migration when a model changes.
- Add or update pytest coverage in `backend/tests/`.

Frontend changes:

- Reuse existing components under `frontend/src/components/`.
- Put shared API/data mapping in `frontend/src/lib/`.
- Keep route-specific UI under `frontend/src/app/`.
- Add or update Vitest tests for dashboard, report, history, and auth behavior.
- Add or update Playwright specs under `frontend/e2e/` when dashboard scan, cancel, auth-guard, or landing behavior changes; keep selectors role/text-based.
- Run `npx tsc --noEmit` after TypeScript changes.

Documentation changes:

- Update `docs/tracking/feature-checklist.md` when feature status changes.
- Update `docs/architecture/system-architecture.md` when flows, routes, or data models change.
- Add a dated entry to `docs/tracking/implementation-log.md` with actual verification results.

## Performance

Measured on the same machine/harness before and after the optimization work (details and caveats in `docs/architecture/performance-results.md`):

| Workload (production worker shape) | Before | After | Change |
|---|---|---|---|
| Single-page clean scan | 2,783.3 ms | **850.5 ms** | −69.4 % |
| Single-page issue-dense scan with screenshots | 4,279.9 ms | **1,584.7 ms** | −63.0 % |
| 5-page crawl, delay 0 | 7,254.4 ms | **4,188.8 ms** | −42.3 % |
| 5-page crawl, delay 250 ms | 8,577.3 ms | **5,190.2 ms** | −39.5 % |
| Crawl-memory DB lookup (200 scans × 100 issues) | 797.5 ms, 20,200 ORM rows | **14.9 ms, 0 ORM rows** | −98.1 % |
| Saved-scan history list (limit 50) | 92.4 ms, 45 SQL | **8.2 ms, 3 SQL** | −91.2 % |
| Progress publish (5-page crawl) | 127.2 ms, 2,500 row writes | **55.7 ms, 500 row writes** | −56.2 % / −80 % |
| Status-only poll (`include_issues=false`) | full issue payload each poll | **0.37 ms, 1 SQL, 1 row** | O(1) reads |

The wins come from worker-level browser reuse, tuned render waits, a screenshot cap, a vendored axe-core asset, incremental issue writes, cheaper history/crawl-memory queries, and lightweight dashboard polling. Functional equivalence was verified: issue/rule/severity counts are unchanged except for the documented screenshot cap and the raw-HTML fallback now running axe-core (6 → 22 issues on the dense fixture, which is a defect fix). The worker logs one structured `scan_timing` JSON line per scan, and per-scan phase timings are exposed as an optional `timings` field.

## Risky Areas

- Worker scans: `SCAN_EXECUTION_MODE`, `backend/app/scan_worker.py`, and queue fields in `ScanRun` must agree.
- Auth split: Auth.js manages browser sessions, but FastAPI validates backend bearer tokens and persisted `UserSession` rows.
- Password reset: email delivery is not implemented; local reset-link logging is guarded by `PASSWORD_RESET_LOG_LINKS`.
- Screenshots: Cloudinary is preferred in production so PostgreSQL does not store large inline data URLs.
- Crawl memory: repeat multi-page scans may skip previously scanned internal URLs; reports must show scanned and skipped pages clearly.
- AI suggestions: provider keys are encrypted before persistence and must never be exposed in API responses.
- Scan cancellation: `cancel_requested_at` is a request flag; the worker/background job owns the transition to the terminal `cancelled` status, so never mark `cancelled` from the web request for a running scan.
- Preferences-driven scans: `scan_options_resolver.py` is the only place saved defaults are merged with request overrides, and the resolved options are what the queued worker consumes.
- Browser reuse: the worker keeps one Chromium process alive (`SCAN_BROWSER_REUSE_ENABLED`, recycler at `SCAN_BROWSER_MAX_JOBS`) — plan for its RAM (~150–300 MB per worker) and keep the kill switch documented for rollback.
- Performance and observability limits: rate-limit buckets, metrics and phase timings are **per process/worker**; a multi-instance deployment needs a shared limiter/metrics store and should scrape each process.
- Database sizing: `replicas × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` must stay below the managed PostgreSQL connection limit.
- URL validation: `backend/app/utils/url_utils.py` now rejects non-http(s), embedded credentials and overlong URLs and can block private/reserved targets via `SCAN_ALLOW_PRIVATE_TARGETS=false` (recommended production setting); DNS rebinding remains a residual risk.
- Screenshot cap: `SCAN_MAX_SCREENSHOTS` bounds captures per page (default 10), so very noisy pages intentionally have fewer images than issues — locators are unaffected.

## Current Gaps

Use `docs/tracking/feature-checklist.md` as the source of truth. Known open items include:

- transactional email delivery for password reset links and scan notifications
- formal hosted deployment verification evidence
- conversational remediation assistant and automatic per-issue code repair suggestions
- automated coverage reporting/thresholds and a lint gate

Remaining performance follow-ups (deliberately deferred; see `scan-performance-analysis.md` §14): bounded intra-crawl page parallelism, a cheaper network-idle detector, worker retry backoff with jitter, Redis-backed rate limiting, OpenTelemetry tracing, fail-fast production secret validation, and validating migration `f075` index effects on PostgreSQL.

## Troubleshooting

- Backend cannot connect to PostgreSQL: check `DATABASE_URL`; use `localhost` outside Docker or `db` inside Docker.
- Login fails in Docker: check `AUTH_API_BASE_URL=http://backend:8000` and a stable `AUTH_SECRET`.
- Compose refuses to start: set `AUTH_SECRET` and `AUTH_JWT_SECRET` in the root `.env` or shell.
- Scans stay queued: confirm `scan-worker` is running and shares the same `DATABASE_URL`.
- Screenshots are missing in production: check `CLOUDINARY_URL` on backend and worker, or use `CLOUDINARY_SCREENSHOT_FALLBACK=data_url` temporarily.
- New tables are missing: run `alembic upgrade head`.
- `GET /metrics` returns 404: set `METRICS_ENABLED=true` (default) in the backend environment.
- Scanning a localhost/private page fails with "URL resolves to a private or reserved network address": remove `SCAN_ALLOW_PRIVATE_TARGETS=false` locally (the default allows private targets) and keep it `false` in production.
- Scan target rejected for credentials/length/scheme: `validate_public_http_url` only accepts http(s) URLs up to 2048 characters without embedded credentials.

