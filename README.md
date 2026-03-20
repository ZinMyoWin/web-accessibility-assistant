# Web Accessibility Audit and Repair Assistant

A web-based system for scanning webpages, detecting accessibility issues, and providing repair recommendations.

## Current Status

The project currently includes:

- a FastAPI backend
- a Next.js frontend scaffold
- health and root API endpoints
- a single-page scan endpoint
- baseline custom accessibility checks

## Project Structure

```text
web-accessibility-assistant/
├── frontend/
├── backend/
├── database/
├── docs/
├── tests/
└── README.md
```

## Documentation

- System architecture: `docs/system-architecture.md`
- Implementation log: `docs/implementation-log.md`
- Docker setup guide: `docs/docker-setup-guide.md`

## Run The Project

### Backend

From `backend/`:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m playwright install chromium
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Backend URLs:

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/test/page-bad`

### Frontend

From `frontend/`:

```powershell
npm install
npm run dev
```

Then open:

- `http://127.0.0.1:3000`

## Run With Docker

From `web-accessibility-assistant/`:

```powershell
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:3000`
- Backend API: `http://127.0.0.1:8000`
- Backend docs: `http://127.0.0.1:8000/docs`

The frontend image is built with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`, so browser requests still reach the backend through the published host port.



