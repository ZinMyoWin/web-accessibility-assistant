# System Architecture

## 1. Project Purpose

The **Web Accessibility Audit and Repair Assistant** is a web-based system that scans webpages, detects accessibility issues, and returns developer-friendly repair guidance.

The MVP is designed to do four things well:

1. Accept a URL from the user.
2. Scan one page, and later multiple pages in the same site.
3. Detect common accessibility issues.
4. Present issues, severity, and suggested fixes in a format developers can act on.

## 2. High-Level Architecture

The project is organized as a standard web application with separate frontend, backend, database, documentation, and test layers.

```text
User
  |
  v
Frontend UI
  |
  v
FastAPI Backend
  |
  +--> Page Fetching / Rendering
  |       |
  |       +--> HTTP fetch for simple pages
  |       +--> Playwright for dynamic pages later
  |
  +--> Accessibility Analysis
  |       |
  |       +--> Built-in custom checks
  |       +--> axe-core integration later
  |
  +--> Recommendation Mapping
  |
  +--> Database later
          |
          +--> Scan history
          +--> Issue records
          +--> Report metadata
```

## 3. Main Project Folders

### `frontend/`

Contains the web interface. It will allow the user to:

- enter a URL
- start a scan
- view issue summaries
- inspect detailed recommendations
- export reports later

Planned technology: **Next.js**

Current status:

- Next.js frontend scaffold created
- single-page scan form implemented
- results summary and issue list UI implemented

### `backend/`

Contains the API and scan logic. It is responsible for:

- receiving scan requests
- validating input
- fetching page content
- running accessibility checks
- returning structured JSON results

Current technology: **FastAPI**

Current frontend-backend integration support:

- CORS enabled for local frontend development on ports `3000` and `3001`

### `database/`

Will contain database configuration, schema scripts, or migration files.

Planned technology: **PostgreSQL**

This layer will later store:

- scan sessions
- scanned pages
- issue results
- history and comparison data

### `docs/`

Contains project documentation such as architecture notes, API behavior, design decisions, and report-supporting documents.

### `tests/`

Will contain unit, integration, and end-to-end tests.

### `README.md`

Provides the project summary and acts as the entry point for developers and markers.

## 4. Backend Architecture

The backend is intentionally split into small responsibilities so the project can scale without turning `main.py` into one large file.

### `backend/app/main.py`

This is the FastAPI entry point.

Responsibilities:

- create the FastAPI app
- expose API routes
- convert internal scanner errors into HTTP responses

Current routes:

- `GET /` - basic root endpoint
- `GET /health` - health check endpoint
- `GET /test/page-bad` - local test page with intentional accessibility issues
- `POST /scan/page` - scan one page and return structured results

### `backend/app/schemas/scan.py`

Defines the request and response contracts for the scan endpoint.

Responsibilities:

- define what the client must send
- define what the API will return
- keep the API response shape stable and predictable

Current models:

- `ScanPageRequest`
- `ScanIssue`
- `ScanSummary`
- `ScanPageResponse`

### `backend/app/services/page_scanner.py`

Contains the main scan logic.

Responsibilities:

- fetch HTML from a target URL
- parse the page
- run accessibility checks
- capture contextual screenshots for detected issues when possible
- normalize the results
- generate a summary object

This file is the beginning of the scanning engine. It is currently simple by design so the project can prove the single-page workflow before adding more advanced tooling.

### `backend/app/utils/url_utils.py`

Contains small reusable helpers.

Current responsibility:

- validate that a submitted URL is an `http` or `https` URL with a valid host

## 5. Current Scan Flow

The current MVP backend flow for one-page scanning is:

1. The frontend or API client sends a `POST /scan/page` request with a URL.
2. FastAPI validates the request body using `ScanPageRequest`.
3. The backend validates the URL format.
4. The scanner fetches the HTML of the page.
5. The scanner parses the HTML and extracts key elements.
6. The scanner runs a small set of custom accessibility checks.
7. The backend returns JSON containing:
   - scanned URL
   - scan timestamp
   - issue summary
   - issue list
   - source location hints when available
   - issue screenshots when capture succeeds

## 6. Current Accessibility Checks

The current version checks for a small but useful baseline set of issues:

1. missing or empty `<title>`
2. missing `lang` on the `<html>` element
3. images missing `alt`
4. vague link text such as `click here`
5. duplicate `id` values
6. heading hierarchy skips

These are not enough for a full accessibility audit. They are the first practical checks used to prove the scan pipeline works.

## 7. Why the Architecture Is Split This Way

This separation is intentional.

### Keep API logic separate from scan logic

`main.py` should define routes and HTTP behavior.

`page_scanner.py` should contain scanning rules and processing logic.

This makes the code easier to:

- test
- extend
- debug
- explain in the final report

### Keep schemas separate from processing

The request and response models live in `schemas/` so the API contract is clearly defined and reusable.

### Keep helpers separate from business logic

Utility functions live in `utils/` so service files stay focused on the main workflow.

## 8. Planned Full Architecture

As the project grows, the backend will expand into a more complete pipeline.

### Stage 1: Current baseline

- FastAPI backend
- one-page scan endpoint
- custom HTML-based checks

### Stage 2: Stronger page analysis

- Playwright for rendering JavaScript-heavy pages
- axe-core integration for standards-based issue detection
- normalization of tool findings into one internal JSON format

### Stage 3: Recommendation engine

Each issue type will be mapped to:

- plain-language explanation
- why the issue matters
- suggested fix
- sample code where useful

### Stage 4: Frontend dashboard

The frontend will provide:

- URL input form
- scan trigger button
- result cards and tables
- severity summary view

Current implementation status:

- URL input implemented
- scan button implemented
- summary cards implemented
- issue list implemented
- local test URL workflow supported

### Stage 5: Multi-page crawling

The crawler will:

- stay inside one domain
- enforce a page limit
- avoid revisiting duplicates
- aggregate results across pages

### Stage 6: Persistence and reporting

The database layer will store:

- scan records
- page records
- issue records

The reporting layer will support:

- scan history
- CSV export
- PDF export

## 9. Recommended Data Flow for the Full MVP

```text
User enters URL in frontend
        |
        v
Frontend sends request to backend
        |
        v
Backend validates URL and scan options
        |
        v
Scanner fetches or renders the page
        |
        v
Accessibility checks run
        |
        v
Issues are normalized and enriched with recommendations
        |
        +--> response sent to frontend
        |
        +--> stored in database later
        |
        +--> exported as report later
```

## 10. Current API Summary

### `GET /`

Purpose:

- quick check that the API process is running

### `GET /health`

Purpose:

- health endpoint for local testing and service verification

### `GET /test/page-bad`

Purpose:

- deterministic local test page for validating scanner behavior
- contains intentional issues so the scan endpoint can be checked without relying on external websites

### `POST /scan/page`

Purpose:

- scan one public webpage and return structured accessibility findings

Expected request body:

```json
{
  "url": "https://example.com"
}
```

Response shape:

```json
{
  "url": "https://example.com",
  "scanned_at": "2026-03-12T10:00:00+00:00",
  "summary": {
    "total_issues": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "issues": [
    {
      "rule_id": "heading-order",
      "severity": "medium",
      "element": "<h3>",
      "message": "Heading levels skip hierarchy.",
      "recommendation": "Use headings in order without skipping levels.",
      "line": 42,
      "column": 7,
      "source_hint": "<h3>Example heading</h3>",
      "screenshot_data_url": "data:image/png;base64,..."
    }
  ]
}
```

Location fields:

- `line` and `column` refer to the fetched HTML source
- `source_hint` shows the matching opening tag or a short location hint
- `screenshot_data_url` contains a contextual screenshot of the affected page area when Playwright capture succeeds
- on framework-generated sites, these may not map directly to the original source file in the repository

## 11. Current Status

Completed:

- project folder structure
- backend skeleton
- FastAPI app setup
- health endpoint
- single-page scan endpoint
- baseline custom checks

Not built yet:

- Playwright rendering
- axe-core integration
- database persistence
- multi-page crawl
- reporting
- formal test suite

## 12. How to Explain This in the Final Report

You can describe the architecture in simple terms:

> The system uses a client-server architecture. The frontend provides the user interface for submitting scan requests and viewing results. The backend exposes API endpoints, performs webpage retrieval and accessibility analysis, and returns structured results. The design separates routing, data models, utility functions, and scan services to improve maintainability and support future extension to crawling, recommendation generation, persistence, and reporting.

That is the core architecture story for the project.

## 13. Documentation Maintenance Rule

Project documentation should be updated whenever a meaningful implementation step is completed.

Use this documentation split:

- `system-architecture.md` for the technical blueprint
- `implementation-log.md` for completed work and verification evidence

When a new feature is finished, update:

1. architecture documentation if the design changed
2. implementation log with what was built, why, files changed, and verification
3. API or module documentation later if the feature introduces a new interface
