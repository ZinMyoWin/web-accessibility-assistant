# Repository Guidelines

## Project Structure & Module Organization

This repository is a full-stack web accessibility assistant.

- `backend/`: FastAPI app, SQLAlchemy models, Alembic migrations, repositories, services, and backend tests.
- `frontend/`: Next.js app under `frontend/src/`, shared components, Auth.js configuration, and Vitest tests.
- `docs/`: architecture notes, implementation logs, guides, and feature tracking.
- `database/`: database-related project assets.
- `.github/`: CI workflows.
- `docker-compose.yml` and `docker-compose.dev.yml`: production-style and development Docker stacks.

Keep feature docs in sync when behavior changes, especially `README.md`, `docs/architecture/system-architecture.md`, `docs/tracking/feature-checklist.md`, and `docs/tracking/implementation-log.md`.

## Build, Test, and Development Commands

Backend:

```powershell
cd backend
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m pytest -q
.\venv\Scripts\python.exe -m compileall app
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
npm run build
npm test
npx.cmd tsc --noEmit --incremental false
```

Docker:

```powershell
docker compose up --build
docker compose -f docker-compose.dev.yml up --build
```

## Coding Style & Naming Conventions

Use Python type hints and small repository/service helpers for backend logic. Keep FastAPI route handlers thin when possible. Use TypeScript, React function components, and existing shadcn/Tailwind utility patterns on the frontend. Prefer descriptive names such as `create_password_reset_token` or `PasswordStrengthMeter`. Avoid committing generated cache files such as `.next/`, `__pycache__/`, and `frontend/tsconfig.tsbuildinfo`.

## Testing Guidelines

Backend tests use `pytest`; name files `test_*.py` and keep API smoke tests separate from unit tests. Frontend tests use Vitest and Testing Library. Add or update tests for every behavior change, especially auth, persistence, queue state, and report mapping.

## Commit & Pull Request Guidelines

Recent history uses both imperative summaries and conventional prefixes, for example `feat: persist issue screenshots...` and `Refactor code structure...`. Prefer concise imperative commits, using `feat:`, `fix:`, or `docs:` when helpful. PRs should include a short summary, test results, migration notes, env var changes, and screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit `.env` or `frontend/.env.local`. Compose requires `AUTH_SECRET` and `AUTH_JWT_SECRET` from the shell or root `.env`. Keep `PASSWORD_RESET_LOG_LINKS=false` except for local reset-link testing, and run Alembic migrations after schema changes.
