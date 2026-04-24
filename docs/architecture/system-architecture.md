# System Architecture

## 1. Project Purpose

The **Web Accessibility Audit and Repair Assistant** is a web-based system that scans webpages, detects accessibility issues, and returns developer-friendly repair guidance.

The current system is designed to do these main jobs:

1. Accept a URL from the user.
2. Scan one page and return structured accessibility findings.
3. Save the scan result in PostgreSQL for later use.
4. Let the frontend show summaries, issues, and scan history views.
5. Prepare the project for later work such as multi-page crawling, reporting, and AI-generated repair guidance.

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
  |       +--> HTTP fetch for page source
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

- enter a URL
- start a scan
- view scan summaries
- inspect issue details
- open the dashboard issues page
- open the scan history page UI

Current technologies:

- **Next.js 15**
- **Tailwind CSS v4**
- **shadcn/ui**

Current status:

- frontend source is organized under `frontend/src/`
- home dashboard scan flow is implemented
- issues page loads real saved scan details from the backend
- scan history page loads real saved scan summaries from the backend
- shared dashboard shell with sidebar is implemented
- reports and preferences pages are not implemented yet

### `backend/`

Contains the API, scan logic, database logic, and migrations.

Current backend responsibilities:

- receive scan requests
- validate input
- fetch page content
- run accessibility checks
- save scan results
- return structured JSON for both live and saved scan views

Current technologies:

- **FastAPI**
- **SQLAlchemy**
- **Alembic**
- **PostgreSQL**
- **Playwright**

### `docs/`

Contains setup guides, architecture notes, implementation guides, and project tracking files.

### `tests/`

Reserved for unit, integration, and end-to-end tests.

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

Current routes:

- `GET /`
- `GET /health`
- `GET /test/page-bad`
- `POST /scan/page`
- `GET /scans`
- `GET /scans/{scan_id}`

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

- `ScanRun`
- `ScanIssueRecord`

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

- create and track the PostgreSQL schema for saved scans and issues

## 5. Current Scan Flow

The current one-page scan flow is:

1. The frontend or API client sends `POST /scan/page` with a URL.
2. FastAPI validates the request body.
3. The backend validates the URL format.
4. The scanner fetches the page HTML.
5. The backend runs custom checks.
6. The backend runs axe-core in Playwright.
7. The backend merges issues and captures screenshots.
8. The backend saves the finished scan in PostgreSQL.
9. The API returns the live scan result plus `scan_id`.

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

- stay inside one domain
- follow page limits
- avoid duplicate visits
- aggregate results across pages

### Reporting

- saved history views
- CSV export
- PDF export

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

### `POST /scan/page`

Purpose:

- scan one page, save the result, and return the live response

Example request:

```json
{
  "url": "https://example.com"
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
- custom HTML checks plus axe-core checks
- contextual issue screenshots in live scan results
- PostgreSQL persistence for successful and failed scan attempts
- saved scan list API
- saved scan detail API
- dashboard home scan UI
- dedicated issues screen backed by saved scan data
- scan history screen backed by saved scan data
- Docker setup for production-style and development workflows

Implemented intelligent-analysis features:

- automated standards-based issue detection using axe-core
- automated issue merging between custom rules and axe-core findings
- automated repair guidance and help-link surfacing in issue results
- automated WCAG tagging for detected issues
- automated locator guidance using source hints, DOM paths, and text previews
- automated contextual screenshot capture to support issue review

Not built yet:

- home dashboard navigation into saved scan detail pages
- full JavaScript rendering for single-page apps before analysis
- multi-page crawl
- reporting exports
- formal test suite
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
