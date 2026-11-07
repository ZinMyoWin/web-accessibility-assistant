# Testing and operations

This guide explains what the project checks, what those checks cannot prove, and how to investigate a local failure. Commands describe the current repository configuration; they are not a claim that the stack or tests were run during this documentation update.

## Test layers: what, why and how

| Layer | What it exercises | How to run | Important limit |
| --- | --- | --- | --- |
| Backend compilation | Python syntax and module compilation | From `backend/`: `.\venv\Scripts\python.exe -m compileall app` | Compilation does not test runtime behavior. |
| Backend pytest | Service, repository, worker and API behavior | From `backend/`: `.\venv\Scripts\python.exe -m pytest -q tests` | Some API smoke tests substitute database and service functions; a passing suite does not establish real PostgreSQL or network behavior. See [API smoke tests](../../backend/tests/test_api_smoke.py). |
| Frontend type check | TypeScript types across the project | From `frontend/`: `npx tsc --noEmit --incremental false` | Type correctness does not verify the rendered UI or backend contract. |
| Frontend unit/component tests | Hooks, components and helpers in a simulated DOM | From `frontend/`: `npm test` | [Vitest configuration](../../frontend/vitest.config.mts) selects tests under `src/`; this is not a real browser or live backend. |
| Frontend build | Next.js production build | From `frontend/`: `npm run build` | A build does not prove login, scanning, or data persistence works against deployed services. |
| Browser tests | Selected flows in Chromium against a built Next.js server | From `frontend/`: `npx playwright install chromium`, then `npm run test:e2e` | The [Playwright configuration](../../frontend/playwright.config.ts) explains that backend calls are intercepted and sessions are minted for the tests. This is not a live integration test. |

Install dependencies and configure the project first using [developer onboarding](../getting-started/developer-onboarding.md). Playwright's browser command may require platform-specific system packages. For a focused change, run the relevant tests first, then the broader checks needed by the change. Keep test output and failures in the implementation record rather than reporting an unrun test as passing.

## CI: what it runs and what it leaves out

[Quality Gate](../../.github/workflows/quality-gate.yml) starts four independent GitHub Actions jobs: frontend type check and Vitest, frontend build, browser tests, and backend compilation and pytest. It installs Chromium for browser tests and retains browser reports and traces when that job fails. The workflow has no PostgreSQL service, migration step, standalone lint step or coverage threshold. It does not establish a live end-to-end path from a real signed-in browser through the worker to a real database.

For a higher-confidence release check, use a dedicated test database and services, apply the intended migrations, then manually exercise sign-in, scan submission, queue progress, saved results, and a relevant report. Record the actual environment and result. Do not use a real production account or destructive history actions as test data without explicit authorization.

## Database and worker operations

Alembic configuration is in [backend/alembic.ini](../../backend/alembic.ini), with metadata and database URL selection in [alembic/env.py](../../backend/alembic/env.py) and revisions in [alembic/versions](../../backend/alembic/versions). From `backend/`, inspect revision status with:

```powershell
.\venv\Scripts\python.exe -m alembic current
.\venv\Scripts\python.exe -m alembic heads
```

To upgrade an explicitly identified development database, after confirming the target and appropriate backup:

```powershell
.\venv\Scripts\python.exe -m alembic upgrade head
```

`upgrade head` changes database schema. Never assume the database named by your configuration is disposable. [Backend startup](../../backend/start.sh) also invokes this upgrade automatically before Uvicorn, so starting the Compose backend has the same consideration. An Alembic head in the working tree is not proof that a running database has that revision.

In worker execution mode, run [the worker](../../backend/app/scan_worker.py) separately from the API. If a job remains queued, check the worker is running and reaches the same database; then inspect job status, worker logs and any reported error. In background mode, the API handles multi-page work asynchronously instead. The Compose definitions start a worker after the backend health check, but an API health response alone does not establish that scans finish successfully.

## Deployment and configuration caveats

- Treat [docker-compose.yml](../../docker-compose.yml) as a local, production-style stack, not a hardened deployment recipe. Review network exposure, database credentials, TLS, secret management and actual runtime configuration before external use.
- Backend API keys for AI providers are encrypted using [the encryption helper](../../backend/app/utils/encryption.py). The helper has a deterministic development fallback, including when its supplied key is invalid. Both current Compose definitions omit `ENCRYPTION_KEY` from their backend container environment, so setting it only in the host environment does not pass it into that container. Configure the service explicitly before relying on encryption. Changing a key without a migration or rotation plan can make existing encrypted values unreadable.
- [URL validation](../../backend/app/utils/url_utils.py) allows private targets by default. Both current Compose files omit `SCAN_ALLOW_PRIVATE_TARGETS` from backend and worker environments. Configure the policy on each relevant service before exposing scanning to untrusted users. Strict validation is not a network isolation boundary: redirects and browser subrequests can reach private destinations before the final URL check, and DNS rebinding remains a risk. See the [security audit](../audits/code-quality-report.md). Do not assume that setting a host variable alone passes it into a container.
- [The frontend Dockerfile](../../frontend/Dockerfile) copies the build context, and [its ignore rules](../../frontend/.dockerignore) currently do not exclude environment files. Review the build context and image handling to prevent local secrets being copied into an image; do not publish an image containing secrets.
- The public frontend API address is a Next.js build input in the production image; the server-side authentication API address is used by the frontend server. Set each for its actual caller. Compose's local addresses should not be assumed correct for a remote browser.
- MCP is optional and has separate OAuth, account-linking and deployment requirements. Follow [the MCP guide](../guides/mcp-integration.md); an unconfigured or unverified integration is not evidence of successful client access.

## Benchmarks and debugging

The scripts under [`scripts/perf`](../../scripts/perf) measure specific scanner or database workloads. Read their arguments and output paths before running them: some write result files, and database benchmarks need an appropriate isolated target. [Performance analysis](../architecture/scan-performance-analysis.md), [baseline](../architecture/performance-baseline.md) and [results](../architecture/performance-results.md) explain earlier measurements and their limits. Do not treat historical results as measurements of the current environment.

For an incident, identify the affected request or scan, check backend and worker logs without sharing tokens or user data, and trace the relevant route, service and repository. Confirm the failure with a reproducible case before changing code. See [onboarding troubleshooting](../getting-started/developer-onboarding.md#troubleshooting) for common starting points.
