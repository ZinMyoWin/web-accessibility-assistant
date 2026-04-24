# Web Accessibility Audit and Repair Assistant

A web-based system for scanning webpages, detecting accessibility issues, and presenting repair guidance through a browser UI.

## Current Scope

The project currently includes:

- a FastAPI backend
- a Next.js frontend
- a Tailwind CSS v4 + shadcn/ui component layer for polished frontend controls
- live one-page accessibility scanning
- PostgreSQL persistence for saved scan records
- saved scan history APIs
- screenshot support for detected issues

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

Examples:

```text
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/accessibility_assistant
FRONTEND_URL=https://web-accessibility-assistant.vercel.app
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
CORS_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
```

Notes:

- `DATABASE_URL` should point to the PostgreSQL database used by the backend
- `FRONTEND_URL` should be a single exact origin with no trailing slash
- `CORS_ALLOWED_ORIGINS` should be comma-separated
- `CORS_ALLOWED_ORIGIN_REGEX` is useful for Vercel preview deployments

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
- custom HTML checks plus axe-core checks
- contextual issue screenshots in live scan responses
- PostgreSQL persistence for successful and failed scan attempts
- `GET /scans` and `GET /scans/{scan_id}` saved-scan APIs
- dashboard home scan UI
- dedicated issues screen backed by saved scan data
- scan history screen backed by saved scan data
- Docker setup for production-style and development workflows

Planned target from the project overview:

- multi-page domain-limited crawling
- AI-generated repair guidance
- corrected code examples for detected issues
- real frontend scan history integration
- PDF and CSV report export

Not implemented yet:

- home dashboard navigation into saved scan detail pages
- report export
- multi-page crawling
- automated test suites

## Run With Docker

From the project root:

```powershell
docker compose up --build
```

Services:

- frontend: `http://127.0.0.1:3000`
- backend API: `http://127.0.0.1:8000`
- backend docs: `http://127.0.0.1:8000/docs`
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
- Docker command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- health check path: `/health`

Recommended backend environment variables:

```text
DATABASE_URL=<your-managed-postgresql-url>
FRONTEND_URL=https://web-accessibility-assistant.vercel.app
CORS_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
```

Use `DATABASE_URL` for the production database connection. Use `FRONTEND_URL` for the main production frontend domain. Use `CORS_ALLOWED_ORIGIN_REGEX` if preview Vercel domains also need access.

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

## Notes

- The frontend test-page shortcut uses the configured API base URL instead of hardcoded localhost.
- Some external websites block automated screenshot capture in headless environments.
- The backend now saves both successful and failed scan attempts.
- Issue screenshots are returned in live scan responses, but they are not stored in PostgreSQL yet.
- Render backend CORS configuration must match the actual deployed frontend origin.



