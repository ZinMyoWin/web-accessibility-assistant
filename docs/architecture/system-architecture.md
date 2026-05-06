# System Architecture

## 1. Project Purpose

The **Web Accessibility Audit and Repair Assistant** is a web-based system that scans webpages, detects accessibility issues, and returns developer-friendly repair guidance.

The current system is designed to do these main jobs:

1. Accept a URL from the user.
2. Scan one page with full analysis or queue a bounded worker-backed multi-page crawl with full custom plus axe-core checks.
3. Save the scan result in PostgreSQL for later use.
4. Let the frontend show summaries, issues, scan history, and persisted reports.
5. Give users actionable locator guidance so they can find the affected element on the original webpage.
6. Let users create accounts, log in, and store session records.
7. Prepare the project for later work such as larger full-site scan orchestration and AI-generated repair guidance.

## 2. High-Level Architecture

The project is split into a frontend, backend, persistence layer, documentation, and tests.

```text
User
  |
  v
Frontend UI (Next.js)
  |
  v
FastAPI Backend
  |
  +--> Page Fetching / Rendering
  |       |
  |       +--> Playwright navigation for rendered page source
  |       +--> Raw HTTP fetch fallback when rendering is unavailable
  |       +--> Playwright for axe-core checks and screenshots
  |
  +--> Accessibility Analysis
  |       |
  |       +--> Custom HTML-based checks
  |       +--> axe-core standards-based checks
  |       +--> Issue merge and deduplication
  |
  +--> Persistence Layer
  |       |
  |       +--> SQLAlchemy models and sessions
  |       +--> PostgreSQL database
  |       +--> Alembic migrations
  |
  +--> API Responses
          |
          +--> Live scan result (`POST /scan/page`)
          +--> Saved scan list (`GET /scans`)
          +--> Saved scan detail (`GET /scans/{scan_id}`)
```

## 3. Main Project Folders

### `frontend/`

Contains the web interface.

Current frontend responsibilities:

- create an account and log in
- enter a URL
- start a scan
- view scan summaries
- inspect issue details
- open the dashboard issues page
- open the scan history page UI
- open persisted reports with per-page issue grouping
- show issue locator guidance using affected page URLs, DOM paths, line/column data, source snippets, and text previews

Current technologies:

- **Next.js 15**
- **Tailwind CSS v4**
- **shadcn/ui**

Current status:

- frontend source is organized under `frontend/src/`
- login and sign-up pages are implemented
- dashboard routes are guarded client-side for anonymous users
- home dashboard scan flow is implemented
- issues page loads real saved scan details from the backend
- scan history page loads real saved scan summaries from the backend
- shared dashboard shell with sidebar is implemented
- reports page loads persisted scan data using `scanId`
- preferences page persists settings through backend APIs
- multi-page scan mode is enabled as a queued scan-worker job with a 5-page dashboard cap
- queued multi-page scans expose current page, queued page URLs, removed page URLs, retry attempts, and stale-worker recovery state
- users can remove queued pages or prioritize a queued page before it is scanned
- multi-page scans can skip previously scanned internal pages when the user enables crawl memory in Preferences
- reports show a computed accessibility score when persisted score data exists or can be derived from issue totals

### `backend/`

Contains the API, scan logic, database logic, and migrations.

Current backend responsibilities:

- receive scan requests
- validate input
- fetch page content
- run accessibility checks
- save scan results
- return structured JSON for both live and saved scan views
- create users, verify credentials, issue sessions, and revoke sessions
- create queued scan jobs for bounded multi-page dashboard scans
- track queue state, current page, removed pages, worker lock/heartbeat metadata, and retry attempts for running multi-page scans
- persist score, mode, pages scanned, pages skipped, scanned/skipped page URL lists, issue page URLs, and element locator metadata

Current technologies:

- **FastAPI**
- **SQLAlchemy**
- **Alembic**
- **PostgreSQL**
- **Playwright**

### `docs/`

Contains setup guides, architecture notes, implementation guides, and project tracking files.

### `backend/tests/`

Contains backend API smoke tests and unit tests for scanner and repository behavior.

Current coverage includes:

- health and deterministic test routes
- scan and queue-control API smoke paths
- scanner custom rules, crawl filtering, queue ordering, and rendered fallback behavior
- repository scoring, queue state updates, queued-page controls, and stale worker recovery

### Frontend tests

The current frontend automated gate is TypeScript typechecking. A fuller component or browser-level frontend test suite is still planned.

### `README.md`

Provides the project summary and developer entry point.

## 4. Backend Architecture

The backend is split into focused modules so the project is easier to maintain.

### `backend/app/main.py`

FastAPI entry point.

Responsibilities:

- create the FastAPI app
- configure CORS
- expose API routes
- coordinate live scan handling
- expose saved scan endpoints
- expose authentication endpoints

Current routes:

- `GET /`
- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /test/page-bad`
- `GET /test/page-js-rendered`
- `POST /scan/page`
- `GET /scans`
- `GET /scans/{scan_id}`
- `POST /scans/{scan_id}/queue/remove`
- `POST /scans/{scan_id}/queue/prioritize`
- `DELETE /scans`
- `GET /preferences`
- `PUT /preferences`
- `POST /preferences/reset`

### `backend/app/schemas/scan.py`

Defines live scan request and response models.

Important models:

- `ScanPageRequest`
- `ScanIssue`
- `ScanSummary`
- `ScanPageResponse`

Note:

- `ScanPageResponse` now includes an optional `scan_id` so the frontend can later reference the saved scan record.

### `backend/app/schemas/history.py`

Defines the response models for saved scan history APIs.

Important models:

- `SavedScanListItem`
- `SavedScanListResponse`
- `SavedScanResponse`

### `backend/app/schemas/auth.py`

Defines sign-up, login, current-user, and auth response models.

### `backend/app/services/page_scanner.py`

Contains the live scan pipeline.

Responsibilities:

- fetch HTML from a target URL
- parse the page
- run custom accessibility checks
- run axe-core inside Playwright
- merge and normalize results
- capture issue screenshots
- build the final live scan response

Current behavior:

- single-page scans run the full rendered-page custom plus axe-core pipeline with screenshots when available
- multi-page scans create a queued saved scan record, then the scan-worker service runs rendered-page custom checks plus axe-core
- multi-page scans are capped at 5 pages in the dashboard flow while larger scan orchestration remains future work
- repeat multi-page scans can skip previously scanned discovered internal pages while always scanning the submitted start URL
- running multi-page scans publish queue state as links are discovered, including current page, queued pages, and pages removed by the user
- the scan worker retries failed jobs while attempts remain and recovers stale `running` jobs after the stale timeout

### `backend/app/services/axe_scanner.py`

Contains the axe-core integration.

Responsibilities:

- load and cache axe-core JavaScript
- run axe-core inside Playwright
- map violations into project issue format
- format WCAG criteria
- help merge custom and axe-core results

### `backend/app/db.py`

Contains database setup.

Responsibilities:

- read `DATABASE_URL`
- create the SQLAlchemy engine
- create the session factory
- provide the FastAPI database dependency

### `backend/app/models/`

Contains SQLAlchemy ORM models.

Current models:

- `User`
- `UserSession`
- `ScanRun`
- `ScanIssueRecord`

### `backend/app/repositories/auth_repository.py`

Contains persistence logic for users and sessions.

Responsibilities:

- create user records
- find users by email
- create persisted user sessions
- resolve a bearer JWT to the current user
- revoke sessions on logout

### `backend/app/services/auth_service.py`

Contains authentication helpers.

Responsibilities:

- hash passwords with PBKDF2-SHA256
- verify submitted passwords against stored password hashes
- create signed JWT access tokens
- hash JWT `jti` values before session persistence

### `backend/app/repositories/scan_repository.py`

Contains persistence logic for scans.

Responsibilities:

- save successful scans
- save failed scans
- list saved scans
- load one saved scan with its issues
- convert ORM objects into API response models

### `backend/alembic/`

Contains database migration files.

Current responsibility:

- create and track the PostgreSQL schema for saved scans, issues, preferences, users, and sessions

Production startup rule:

- the backend Docker image starts through `backend/start.sh`
- `backend/start.sh` runs `alembic upgrade head` before Uvicorn starts
- hosted deployments should not override the Docker command with direct `uvicorn ...`, because that skips migrations and can leave required tables missing

## 5. Current Scan Flow

The current single-page scan flow is:

1. The frontend or API client sends `POST /scan/page` with a URL.
2. FastAPI validates the request body.
3. The backend validates the URL format.
4. The scanner navigates to the page in Playwright, waits for rendered JavaScript content, and captures rendered HTML.
5. If rendering is unavailable, the scanner falls back to raw HTTP HTML fetch.
6. The backend runs custom checks against the rendered or fallback HTML.
7. The backend runs axe-core in Playwright.
8. The backend merges issues and captures screenshots.
9. The backend saves the finished scan in PostgreSQL.
10. The API returns the live scan result plus `scan_id`.

The current multi-page scan flow is:

1. The frontend sends `POST /scan/page` with `mode="multi"` and crawl preferences.
2. The backend creates a saved scan record with `status="queued"` and clamps the page limit to a maximum of 5 pages.
3. The crawler follows allowed internal links while respecting depth, ignore patterns, same-domain settings, and robots settings.
4. Each page is rendered in Playwright when available, then analyzed with custom HTML checks plus axe-core.
5. Issues are tagged with their affected `page_url` and locator metadata.
6. When crawl memory is enabled, discovered internal URLs that were previously scanned on the same domain are skipped.
7. The scan-worker claims the queued row, marks it `status="running"`, and increments worker attempt metadata.
8. As links are discovered, the worker persists `current_page_url`, `queued_page_urls`, `excluded_page_urls`, scanned URLs, skipped URLs, and heartbeat timestamps.
9. The dashboard polls the saved scan, shows the current queue, and can call queue-control routes to remove or prioritize waiting pages.
10. If a worker stops updating heartbeat data, stale-job recovery requeues the scan while attempts remain or marks it failed after max attempts.
11. The worker updates the row to `status="complete"` with actual `mode`, `pages_scanned`, `pages_skipped`, scanned/skipped page URL lists, issue counts, and a computed score.
12. Reports provide a selectable page list so users can inspect issues tied to each scanned page and see which pages were skipped.

If a scan fails after request validation:

1. The backend catches the scan error.
2. The backend saves a failed scan record with `status="error"`.
3. The API returns the original HTTP error to the client.

## 6. Persistence Flow

The current persistence layer stores two kinds of records.

### `scan_runs`

Stores one row per scan attempt.

Important fields:

- scan ID
- requested URL
- final URL
- status
- mode
- started time
- completed time
- duration
- issue counts
- pages scanned
- pages skipped by crawl memory
- scanned and skipped page URL lists
- accessibility score
- optional error message

### `scan_issues`

Stores one row per issue found in a successful scan.

Important fields:

- issue ID
- parent scan ID
- rule ID
- severity
- element
- message
- recommendation
- source-location hints
- affected page URL
- DOM path and text preview
- WCAG criteria
- detection source

Current rule:

- issue screenshots are returned in the live scan response, but they are not stored in PostgreSQL yet.

## 7. Current Accessibility Checks

### Custom checks

The project currently includes custom HTML-based checks for:

1. missing or empty `<title>`
2. missing `lang` on `<html>`
3. images missing `alt`
4. vague link text
5. duplicate IDs
6. heading level skips

### axe-core checks

axe-core runs inside Playwright and adds many standards-based checks, including:

- color contrast
- accessible names
- form labels
- ARIA validity
- landmark structure
- table semantics
- deprecated elements

### Deduplication rule

When both custom logic and axe-core find the same issue, the project keeps the custom version when it has better source detail, then enriches it with WCAG information from axe-core.

## 8. Current Frontend Status

### Home dashboard

Implemented:

- URL input
- scan trigger
- progress panel
- summary metrics
- overview panels
- issue list with expandable detail rows

### Issues page

Implemented:

- page route and layout
- filters and detail UI
- real saved scan data connection

### Scan history page

Implemented:

- page route and layout
- metrics and list UI
- filter and compare controls
- real backend data connection to `GET /scans`

## 9. Planned Full Architecture

The project overview describes a larger target system than the current implementation.

Planned future stages include:

### Multi-page crawling

- current dashboard crawls run through the scan-worker service and stay bounded at 5 pages
- current crawls stay inside configured domain rules, follow page limits, avoid duplicate visits, and aggregate results across pages
- current crawls use rendered-page custom HTML checks plus axe-core for every scanned page when Playwright rendering is available
- current crawls support user-controlled crawl memory to skip already scanned internal pages
- current crawls expose queue progress and support queued-page removal/prioritization during worker execution
- current worker jobs include retry and stale-job recovery; planned larger crawling should add worker scaling controls

### Reporting

- saved history views
- CSV export
- PDF export
- persisted report pages with score, selectable per-page issue views, skipped-page visibility, issue status wording, and locator guidance

### AI recommendation layer

Planned AI features from the project overview:

- plain-English explanation of each issue
- why the issue matters
- suggested fix
- corrected code examples where useful

These LLM-based features are not implemented yet.

## 10. Current API Summary

### `GET /`

Purpose:

- quick check that the API process is running

### `GET /health`

Purpose:

- health check for local testing and deployment verification

### `GET /test/page-bad`

Purpose:

- deterministic local test page with intentional accessibility issues

### `GET /test/page-js-rendered`

Purpose:

- deterministic local test page that injects accessibility issues after JavaScript renders
- manual proof path for Playwright-rendered analysis from the frontend

### `POST /scan/page`

Purpose:

- scan one page or a bounded multi-page crawl, save the result, and return the live response

Example request:

```json
{
  "url": "https://example.com",
  "mode": "single"
}
```

Example bounded multi-page request:

```json
{
  "url": "https://example.com",
  "mode": "multi",
  "page_limit": 5,
  "crawl_depth": 1
}
```

Important response fields:

```json
{
  "scan_id": "6d0d2c2f-9f0c-4b1f-9f89-d0d2f0c2a111",
  "url": "https://example.com",
  "summary": {
    "total_issues": 3,
    "high": 1,
    "medium": 1,
    "low": 1
  },
  "issues": []
}
```

### `GET /scans`

Purpose:

- return saved scan summaries for the history page

Example use cases:

- newest scans first
- filter by status
- filter by mode
- search by URL

### `GET /scans/{scan_id}`

Purpose:

- return one saved scan with its saved issue records

## 11. Current Status

Implemented today:

- backend single-page scanning
- rendered-page custom HTML checks plus axe-core checks
- contextual issue screenshots in live scan results
- PostgreSQL persistence for successful and failed scan attempts
- persisted accessibility score calculation for saved scans
- saved scan list API
- saved scan detail API
- dashboard home scan UI
- bounded worker-backed multi-page crawl mode with a 5-page dashboard cap, full axe-core checks, and per-page issue attribution
- running crawl queue visibility, queued-page removal, queued-page prioritization, retry attempts, and stale-job recovery
- crawl memory preference for skipping previously scanned internal pages during repeat domain scans
- dedicated issues screen backed by saved scan data
- scan history screen backed by saved scan data
- reports screen backed by saved scan data, including issue locator guidance
- Docker setup for production-style and development workflows

Implemented intelligent-analysis features:

- automated standards-based issue detection using axe-core
- automated issue merging between custom rules and axe-core findings
- automated repair guidance and help-link surfacing in issue results
- automated WCAG tagging for detected issues
- automated locator guidance using affected page URLs, source hints, line/column data, DOM paths, source snippets, and text previews
- automated contextual screenshot capture to support issue review

Not built yet:

- worker scaling controls for larger multi-page scans
- full automated frontend test suite
- generative AI / LLM-based repair suggestions

## 12. How To Explain This In The Final Report

You can describe the architecture like this:

> The system uses a client-server architecture. The Next.js frontend provides the user interface for starting scans and viewing results. The FastAPI backend validates input, fetches pages, runs accessibility analysis, stores scan records in PostgreSQL, and returns structured JSON responses. The design separates API routing, schemas, scan services, database models, repositories, and migrations so the project can grow toward multi-page crawling, reporting, and AI-generated repair guidance.

## 13. Documentation Maintenance Rule

Project documentation should be updated whenever a meaningful implementation step is completed.

Use this documentation split:

- `docs/architecture/system-architecture.md` for the technical blueprint
- `docs/tracking/implementation-log.md` for completed work and verification evidence
- `docs/tracking/feature-checklist.md` for feature status tracking
- `docs/implementation/` for beginner-friendly implementation references

When a new feature is finished, update:

1. architecture documentation if the design changed
2. implementation documentation if the feature needs clear future reference notes
3. implementation log with what was built and how it was verified
4. checklist status if any feature moved from planned to implemented
