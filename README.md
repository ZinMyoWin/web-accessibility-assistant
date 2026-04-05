# Web Accessibility Audit and Repair Assistant

A web-based system for scanning webpages, detecting accessibility issues, and presenting repair guidance through a browser UI.

## Current Scope

The project currently includes:

- a FastAPI backend
- a Next.js frontend
- a Tailwind CSS v4 + shadcn/ui component layer for polished frontend controls
- a health endpoint and root endpoint
- a single-page scan endpoint
- baseline accessibility checks
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

- `docs/system-architecture.md`
- `docs/implementation-log.md`
- `docs/docker-setup-guide.md`

## Prerequisites

For local development without Docker:

- Python 3.11
- Node.js 22 or later
- npm

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

The backend supports these CORS-related variables:

- `FRONTEND_URL`
- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOWED_ORIGIN_REGEX`

Examples:

```text
FRONTEND_URL=https://web-accessibility-assistant.vercel.app
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
CORS_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
```

Notes:

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
- the scan-mode dropdown in the dashboard now uses the shadcn/ui `Select` component

## Run With Docker

From the project root:

```powershell
docker compose up --build
```

Services:

- frontend: `http://127.0.0.1:3000`
- backend API: `http://127.0.0.1:8000`
- backend docs: `http://127.0.0.1:8000/docs`

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
FRONTEND_URL=https://web-accessibility-assistant.vercel.app
CORS_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
```

Use `FRONTEND_URL` for the main production frontend domain. Use `CORS_ALLOWED_ORIGIN_REGEX` if preview Vercel domains also need access.

### Frontend On Vercel

Recommended project settings:

- framework preset: `Next.js`
- root directory: `frontend`

Required frontend environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://web-accessibility-assistant.onrender.com
```

After changing backend CORS variables on Render, redeploy the backend service.

## Useful Test Flow

1. Open the frontend.
2. Click `Use Test Page`.
3. Submit the scan request.
4. Confirm the backend returns issue data and screenshots.

## Notes

- The frontend test-page shortcut uses the configured API base URL instead of hardcoded localhost.
- Some external websites block automated screenshot capture in headless environments.
- Render backend CORS configuration must match the actual deployed frontend origin.


