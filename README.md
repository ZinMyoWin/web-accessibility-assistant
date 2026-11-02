# Web Accessibility Audit and Repair Assistant

A full-stack web app for scanning webpages, finding accessibility issues, saving scan history, and giving repair guidance through a browser dashboard.

Start here when you are new to the project. Deeper explanations live in `docs/`.

## What The Project Does

AccessAudit lets a signed-in user:

1. enter a public webpage URL
2. run a single-page scan or a bounded multi-page crawl
3. review accessibility issues, screenshots, page URLs, DOM paths, and WCAG tags
4. save scan results in PostgreSQL
5. compare, review, and report on saved scans
6. generate one AI repair suggestion for a group of similar issues

The scanner combines custom checks in `backend/app/services/page_scanner.py` with axe-core checks in `backend/app/services/axe_scanner.py`. API routes are defined in `backend/app/main.py`.

## Tech Stack

- Frontend: Next.js 15, React 19, Auth.js, Tailwind CSS v4, Vitest, Testing Library
- Backend: FastAPI, Pydantic, SQLAlchemy, Alembic, pytest
- Scanning: Playwright/Chromium, axe-core, custom HTML checks
- Data: PostgreSQL
- Background work: `backend/app/scan_worker.py`
- CI: `.github/workflows/quality-gate.yml`

## Repository Structure

```text
web-accessibility-assistant/
|- backend/
|  |- app/                  FastAPI routes, services, repositories, models, schemas
|  |- alembic/              database migration setup and versions
|  `- tests/                backend pytest suite
|- frontend/
|  `- src/                  Next.js routes, components, hooks, libraries, tests
|- docs/                    architecture, guides, implementation notes, tracking
|- docker-compose.yml       production-style local stack
|- docker-compose.dev.yml   hot-reload development stack
|- AGENTS.md                contributor workflow notes
`- README.md
```

Why this matters: route handlers live in `backend/app/main.py`; database work usually belongs in `backend/app/repositories/`; scanning logic belongs in `backend/app/services/`; shared frontend API mapping belongs in `frontend/src/lib/`.

## Documentation Map

- `docs/README.md`: documentation index and maintenance rules
- `docs/architecture/system-architecture.md`: architecture, flows, APIs, data model, risks, glossary, open questions
- `docs/guides/docker-setup-guide.md`: Docker setup walkthrough
- `docs/guides/database-setup-guide.md`: historical PostgreSQL/Alembic bootstrap guide
- `docs/implementation/backend-persistence-implementation-guide.md`: historical persistence implementation plan
- `docs/tracking/feature-checklist.md`: current implemented vs pending feature status
- `docs/tracking/implementation-log.md`: chronological implementation evidence

Avoid duplicating details. Put quick setup here, feature status in `docs/tracking/feature-checklist.md`, and deep technical explanations in `docs/architecture/system-architecture.md`.

## Prerequisites

For local development without Docker:

- Python 3.11
- Node.js 22 or later
- npm
- PostgreSQL, usually through Docker Compose

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
```

CI runs `npx tsc --noEmit`, `npm test`, `python -m compileall app`, and `python -m pytest -q tests` in `.github/workflows/quality-gate.yml`. It does not currently run a standalone lint command, coverage threshold, browser end-to-end suite, or `npm run build`.

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
- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`: account/session flow
- `POST /auth/google`: env-gated Google profile exchange from the trusted Next.js server
- `POST /auth/forgot-password`, `POST /auth/reset-password`: single-use reset-token scaffold
- `POST /scan/page`: create a scan or queued crawl
- `GET /scans`, `GET /scans/{scan_id}`: saved scan list/detail for the current user
- `POST /scans/{scan_id}/queue/remove`, `POST /scans/{scan_id}/queue/prioritize`: queue controls; body is `{ "url": "..." }`
- `DELETE /scans`: clear the current user's scan history
- `GET /preferences`, `PUT /preferences`, `POST /preferences/reset`: user-scoped settings
- `GET /scans/{scan_id}/repair-suggestion-groups`: grouped issue patterns
- `POST /scans/{scan_id}/repair-suggestion-groups/{group_key}/generate`: generate or reuse an AI suggestion

Scan, preference, queue, history, and repair-suggestion routes require a backend bearer token. The frontend stores that token inside the Auth.js session.

## Data Model At A Glance

SQLAlchemy models live in `backend/app/models/`.

- `User`, `UserSession`, `PasswordResetToken` in `backend/app/models/auth.py`
- `ScanRun`, `ScanIssueRecord` in `backend/app/models/scan.py`
- `AppPreferences` in `backend/app/models/preferences.py`
- `RepairSuggestion` in `backend/app/models/repair_suggestion.py`

Migrations live in `backend/alembic/versions/`. Apply them with:

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
- Run `npx tsc --noEmit` after TypeScript changes.

Documentation changes:

- Update `docs/tracking/feature-checklist.md` when feature status changes.
- Update `docs/architecture/system-architecture.md` when flows, routes, or data models change.
- Add a dated entry to `docs/tracking/implementation-log.md` with actual verification results.

## Risky Areas

- Worker scans: `SCAN_EXECUTION_MODE`, `backend/app/scan_worker.py`, and queue fields in `ScanRun` must agree.
- Auth split: Auth.js manages browser sessions, but FastAPI validates backend bearer tokens and persisted `UserSession` rows.
- Password reset: email delivery is not implemented; local reset-link logging is guarded by `PASSWORD_RESET_LOG_LINKS`.
- Screenshots: Cloudinary is preferred in production so PostgreSQL does not store large inline data URLs.
- Crawl memory: repeat multi-page scans may skip previously scanned internal URLs; reports must show scanned and skipped pages clearly.
- AI suggestions: provider keys are encrypted before persistence and must never be exposed in API responses.
- URL validation: `backend/app/utils/url_utils.py` currently checks scheme and host; confirm private-network blocking requirements before treating scans as safe for untrusted public use.

## Current Gaps

Use `docs/tracking/feature-checklist.md` as the source of truth. Known open items include:

- transactional email delivery for password reset links
- formal hosted deployment verification evidence
- conversational remediation assistant
- export-all patch generation for grouped suggestions
- browser end-to-end tests and coverage thresholds

## Troubleshooting

- Backend cannot connect to PostgreSQL: check `DATABASE_URL`; use `localhost` outside Docker or `db` inside Docker.
- Login fails in Docker: check `AUTH_API_BASE_URL=http://backend:8000` and a stable `AUTH_SECRET`.
- Compose refuses to start: set `AUTH_SECRET` and `AUTH_JWT_SECRET` in the root `.env` or shell.
- Scans stay queued: confirm `scan-worker` is running and shares the same `DATABASE_URL`.
- Screenshots are missing in production: check `CLOUDINARY_URL` on backend and worker, or use `CLOUDINARY_SCREENSHOT_FALLBACK=data_url` temporarily.
- New tables are missing: run `alembic upgrade head`.

