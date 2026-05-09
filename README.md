# Web Accessibility Audit and Repair Assistant

A web-based system for scanning webpages, detecting accessibility issues, and presenting repair guidance through a browser UI.

## Current Scope

The project currently includes:

- a FastAPI backend
- a Next.js frontend
- a Tailwind CSS v4 + shadcn/ui component layer for polished frontend controls
- live one-page accessibility scanning
- JavaScript-rendered accessibility analysis for SPA-heavy pages
- bounded worker-backed multi-page crawling with a 5-page cap, rendered-page axe-core checks, retry recovery, and visible queue controls
- login and sign-up pages backed by persisted user/session records
- authenticated scan history and preferences scoped to each user account
- crawl memory that can skip previously scanned internal pages on repeat domain scans
- PostgreSQL persistence for saved scan records
- saved scan history APIs
- screenshot support for detected issues
- persisted report data with score, selectable per-page grouping, skipped-page visibility, and issue-location guidance

## Project Structure

```text
web-accessibility-assistant/
|- backend/
|- frontend/
|- database/
|- docs/
|- tests/
|- docker-compose.yml
|- docker-compose.dev.yml
`- README.md
```

## Documentation

- `docs/README.md`
- `docs/architecture/system-architecture.md`
- `docs/guides/docker-setup-guide.md`
- `docs/guides/database-setup-guide.md`
- `docs/implementation/backend-persistence-implementation-guide.md`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

## Prerequisites

For local development without Docker:

- Python 3.11
- Node.js 22 or later
- npm
- PostgreSQL access through Docker Compose or another reachable PostgreSQL instance

For containerized development:

- Docker Desktop

## Environment Variables

### Frontend

The frontend reads:

- `NEXT_PUBLIC_API_BASE_URL`

Example:

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

If this variable is not set, the frontend falls back to `http://127.0.0.1:8000`.

### Backend

The backend reads:

- `DATABASE_URL`
- `FRONTEND_URL`
- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOWED_ORIGIN_REGEX`
- `SCAN_EXECUTION_MODE`
- `SCAN_WORKER_STALE_AFTER_SECONDS`
- `AUTH_JWT_SECRET`

Examples:

```text
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/accessibility_assistant
FRONTEND_URL=https://web-accessibility-assistant.vercel.app
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
CORS_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
SCAN_EXECUTION_MODE=worker
SCAN_WORKER_STALE_AFTER_SECONDS=300
AUTH_JWT_SECRET=replace-with-a-long-random-secret
```

Notes:

- `DATABASE_URL` should point to the PostgreSQL database used by the backend
- `FRONTEND_URL` should be a single exact origin with no trailing slash
- `CORS_ALLOWED_ORIGINS` should be comma-separated
- `CORS_ALLOWED_ORIGIN_REGEX` is useful for Vercel preview deployments
- `SCAN_EXECUTION_MODE=worker` makes the API enqueue multi-page scans for the scan-worker service; without it, direct local backend runs use the in-process background fallback
- `SCAN_WORKER_STALE_AFTER_SECONDS` controls when a running worker job is considered stale and eligible for retry/recovery
- `AUTH_JWT_SECRET` signs login JWTs; set a long private value outside local development

## Local Setup

### 1. Backend Setup

From `backend/`:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m playwright install chromium
.\venv\Scripts\alembic.exe upgrade head
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Backend URLs:

- API root: `http://127.0.0.1:8000`
- health check: `http://127.0.0.1:8000/health`
- docs: `http://127.0.0.1:8000/docs`
- local test page: `http://127.0.0.1:8000/test/page-bad`

### 2. Frontend Setup

From `frontend/`:

```powershell
npm install
npm run dev
```

Then open:

- `http://127.0.0.1:3000`

The frontend will call the backend using `NEXT_PUBLIC_API_BASE_URL` when set, or fall back to `http://127.0.0.1:8000`.

Frontend UI note:

- Tailwind CSS v4 is installed to support shadcn/ui primitives
- the scan-mode dropdown in the dashboard uses the shadcn/ui `Select` component
- the frontend source is organized under `frontend/src/`

## Current Feature Status

Implemented today:

- backend single-page scanning
- custom checks plus axe-core checks against rendered page content when Playwright is available
- contextual issue screenshots in live scan responses
- PostgreSQL persistence for successful and failed scan attempts
- `GET /scans` and `GET /scans/{scan_id}` saved-scan APIs
- sign-up, login, current-user, and logout APIs backed by stored user/session records and signed JWT access tokens
- scan, history, report, queue-control, danger-zone, and preferences APIs require the current user's bearer token
- saved scans and preferences are scoped to the authenticated user account
- dashboard home scan UI
- login and sign-up pages
- dashboard route guard and sidebar logout control
- dedicated issues screen backed by saved scan data
- scan history screen backed by saved scan data
- compare mode with real issue-delta analysis
- reports page backed by persisted scan records via `scanId`
- preferences persistence with backend encryption for API keys
- danger-zone actions backed by API (`DELETE /scans`, `POST /preferences/reset`)
- bounded worker-backed multi-page crawl mode using persisted crawl preferences, rendered custom checks, and axe-core checks
- multi-page scans create a queued scan job immediately, then the dashboard polls saved scan status until completion
- queued multi-page scans expose current page, waiting pages, removed pages, retry attempts, and stale-job recovery state
- users can remove queued pages or move a queued page to the front before the worker scans it
- user-controlled crawl memory preference for skipping already scanned internal pages on the same domain
- scanned and skipped page URL lists for granular report traceability
- persisted accessibility score calculation for reports and scan history
- issue locator guidance in dashboard, issues, and reports using affected page URL, DOM path, line/column, text preview, and source snippets
- automated backend pytest coverage for API smoke paths, scanner logic, repository queue state, and worker recovery
- automated backend pytest coverage for password hashing, session persistence, and auth API flows
- minimal frontend smoke check through TypeScript typecheck
- Docker setup for production-style and development workflows

Planned target from the project overview:

- AI-generated repair guidance
- corrected code examples for detected issues
- AI-generated code suggestions

Not implemented yet:

- full automated frontend test suite
- generative AI / LLM-based repair suggestions

## Run With Docker

From the project root:

```powershell
docker compose up --build
```

Services:

- frontend: `http://127.0.0.1:3000`
- backend API: `http://127.0.0.1:8000`
- backend docs: `http://127.0.0.1:8000/docs`
- scan-worker: background multi-page scan executor
- database: `localhost:5432`

This uses:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.yml`

## Run With Docker For Development

From the project root:

```powershell
docker compose -f docker-compose.dev.yml up --build
```

Use this workflow for day-to-day coding. It provides hot reload through bind mounts:

- backend runs with `uvicorn --reload`
- scan-worker runs queued multi-page scans
- frontend runs with `next dev`
- PostgreSQL runs in the `db` service
- code changes do not require a full rebuild

## Deployment Setup

### Backend On Render

Recommended service settings:

- service type: `Web Service`
- environment: `Docker`
- Docker build context directory: `backend`
- Dockerfile path: `backend/Dockerfile`
- Docker command: leave blank so Render uses `backend/Dockerfile`, or set it to `/app/start.sh`
- health check path: `/health`

Recommended backend environment variables:

```text
DATABASE_URL=<your-managed-postgresql-url>
FRONTEND_URL=https://web-accessibility-assistant.vercel.app
CORS_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
```

Use `DATABASE_URL` for the production database connection. Use `FRONTEND_URL` for the main production frontend domain. Use `CORS_ALLOWED_ORIGIN_REGEX` if preview Vercel domains also need access.

The backend container must start through `/app/start.sh` because that script runs `alembic upgrade head` before Uvicorn starts. Do not override the Docker command with direct `uvicorn ...`; doing so skips migrations and can leave production without tables such as `users` and `user_sessions`.

### Frontend On Vercel

Recommended project settings:

- framework preset: `Next.js`
- root directory: `frontend`

Required frontend environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://web-accessibility-assistant.onrender.com
```

After changing backend environment variables on Render, redeploy the backend service.

## Useful Test Flow

1. Open the frontend.
2. Click `Use Test Page`.
3. Submit the scan request.
4. Confirm the backend returns issue data and screenshots.
5. Confirm the response includes a `scan_id`.
6. Open `GET /scans` in the backend docs and confirm the new scan appears.
7. Open the Reports page and confirm the scan shows a numeric score, per-page issue grouping, and "Where to find it" details for each issue.

To manually prove JavaScript-rendered scanning is active, scan this URL from the frontend:

```text
http://localhost:8000/test/page-js-rendered
```

The static HTML is mostly clean, then JavaScript injects an image without `alt`, vague link text, and an empty button. Those issues should appear only when the backend rendered the page before analysis.

## Automated Verification

Run the backend test suite:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant\backend"
& ".\venv\Scripts\python.exe" -m compileall app
& ".\venv\Scripts\python.exe" -m pytest -q tests
```

Run the frontend typecheck:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant\frontend"
npx tsc --noEmit
```

After pulling auth changes into an existing Docker database, run:

```powershell
cd "D:\Lithan\UOR\Final Year Project\web-accessibility-assistant"
docker compose -f docker-compose.dev.yml exec backend alembic upgrade head
```

## Notes

- The frontend test-page shortcut uses the configured API base URL instead of hardcoded localhost.
- Some external websites block automated screenshot capture in headless environments.
- The backend now saves both successful and failed scan attempts.
- Issue screenshots are returned in live scan responses, but they are not stored in PostgreSQL yet.
- Existing saved scans only show the locator fields that were captured when they were scanned. New scans include more precise DOM paths for repeated elements.
- Multi-page dashboard scans now run through a dedicated scan-worker service with full axe-core analysis across the bounded crawled pages. Issue screenshots remain live-only for single-page scans and are not persisted.
- Full-analysis scans now navigate pages in Playwright first, wait for rendered JavaScript content, run custom checks and axe-core against the rendered DOM, and fall back to raw HTML analysis if rendering is unavailable.
- Running multi-page scans update queue metadata as pages are discovered; the dashboard can show the current page, queued pages, removed pages, and retry attempt count.
- The scan worker retries failed jobs while attempts remain and recovers stale `running` jobs after the configured stale timeout.
- When crawl memory is enabled, repeat multi-page scans still scan the submitted start URL but skip previously scanned discovered internal pages where historical page URLs are available. Reports show both scanned and skipped page lists.
- Render backend CORS configuration must match the actual deployed frontend origin.



