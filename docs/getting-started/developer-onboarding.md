# Developer onboarding

This guide explains how to find your way around AccessAudit and start a local development setup. Commands assume PowerShell at the repository root unless a different working directory is stated. Runtime behavior below is based on source and configuration inspection; it has not been verified against a running deployment as part of this documentation work.

## What the application does

AccessAudit scans a website for accessibility issues, stores results, and lets a signed-in user review history, reports, and repair suggestions. The browser talks to a Next.js frontend and a FastAPI backend. A worker can take queued scans from PostgreSQL, run Chromium and accessibility checks, and save progress and results. Start with the [system architecture](../architecture/system-architecture.md) for the boundaries and the [feature checklist](../tracking/feature-checklist.md) for feature status.

## A suggested learning path

1. Read the [project README](../../README.md) for the overall stack and the current configuration reference, then the [system architecture](../architecture/system-architecture.md).
2. Open the [dashboard page](../../frontend/src/app/(dashboard)/dashboard/page.tsx) and follow its scan interactions into [useDashboardScan](../../frontend/src/hooks/useDashboardScan.ts). Read [the API helpers](../../frontend/src/lib/api.ts) when a request is made.
3. Find the corresponding route in [the FastAPI entry point](../../backend/app/main.py). Follow its repository and service calls instead of assuming the route itself performs every step.
4. Follow queued execution into [the worker](../../backend/app/scan_worker.py), [the scanner](../../backend/app/services/page_scanner.py), and [the scan repository](../../backend/app/repositories/scan_repository.py). The [scan models](../../backend/app/models/scan.py) describe stored state.
5. Review the relevant tests and [testing and operations guide](../engineering/testing-and-operations.md) before changing a workflow. The [MCP guide](../guides/mcp-integration.md) covers the optional remote integration.

The split matters: UI state, HTTP request handling, background work and database persistence have different failure modes. A successful button click alone does not prove a worker ran or data persisted.

## Prepare a local setup

Install Python 3.11, Node.js 22 or later, npm and PostgreSQL, or use Docker Desktop. The [README setup section](../../README.md#prerequisites) describes the required configuration names and local URLs. Provide configuration using your normal secret-management approach; do not commit environment files, tokens or passwords. Keep authentication secrets stable between restarts. Database migrations modify the target database: verify that the configured database is the intended development database before applying them.

For a manual backend setup, from `backend/` create or activate a Python virtual environment and install dependencies and Chromium:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m playwright install chromium
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

For the frontend, open a separate terminal in `frontend/`:

```powershell
npm ci
npm run dev
```

**Worker mode needs one more process.** When `SCAN_EXECUTION_MODE` selects worker execution, start this in another terminal in `backend/`, with the same database configuration as the backend:

```powershell
.\venv\Scripts\python.exe -m app.scan_worker
```

In worker mode the API queues scans; without a running worker they can remain queued. The code falls back to background execution when worker mode is not selected; multi-page scans are still handled asynchronously. See [scan route and execution-mode selection](../../backend/app/main.py) and [worker implementation](../../backend/app/scan_worker.py) for the details.

Alternatively, use [the production-style Compose file](../../docker-compose.yml) or [the development Compose file](../../docker-compose.dev.yml). Both define the database, backend, worker and frontend. Backend startup runs migrations before Uvicorn via [start.sh](../../backend/start.sh); verify the target database and back it up as appropriate before starting. The [operations guide](../engineering/testing-and-operations.md#deployment-and-configuration-caveats) explains current configuration limitations before exposing a stack outside a trusted local environment.

## Trace and change a feature safely

1. Reproduce the behavior and note the page, action, request, response and any error. Avoid recording secrets or personal data.
2. Find the page under [`frontend/src/app`](../../frontend/src/app) and shared UI under [`frontend/src/components`](../../frontend/src/components). Follow its hook and API calls to the backend route.
3. Follow validation through [`backend/app/schemas`](../../backend/app/schemas), business work through [`backend/app/services`](../../backend/app/services), and database work through [`backend/app/repositories`](../../backend/app/repositories). Use the actual call chain: not every feature uses every layer.
4. For a new page, follow an existing route and layout, reuse shared controls, and check accessibility. For a new API, follow an existing route, validate input and authorization, and keep persistence in the appropriate repository. A schema change needs a reviewed migration and tests.
5. Update or add tests for the behavior and run checks appropriate to the affected layers. If behavior or a workflow changes, update the architecture, feature checklist and implementation log as specified in [the documentation index](../README.md).

## Troubleshooting

| Symptom | What to investigate |
| --- | --- |
| A scan stays queued | Check execution mode, worker process and logs, and whether worker and API connect to the same database. Check the saved scan status and error fields. |
| The backend cannot start or queries fail after an update | Check database availability and the configured target, then inspect Alembic revision and migration errors. Do not run migrations against an unknown database. |
| Browser cannot reach the API | The browser-facing API address and the server-side authentication API address serve different callers; inspect the intended configuration and network access. |
| A scan cannot launch Chromium | Install the backend Playwright Chromium build and its system dependencies; inspect backend or worker logs. |
| Sign-in stops working after restart | Check that the required authentication secrets are configured consistently for the relevant services; do not paste their values into logs or issues. |
| A private or local target is rejected | Check the scan target policy. A development exception should not be assumed safe on an externally reachable deployment. |

The [testing and operations guide](../engineering/testing-and-operations.md) lists commands, test limitations and deployment checks. The [Docker guide](../guides/docker-setup-guide.md) and [database setup guide](../guides/database-setup-guide.md) include historical setup context; prefer current source and configuration if they differ.
