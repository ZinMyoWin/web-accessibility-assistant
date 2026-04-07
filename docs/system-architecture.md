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
  |       +--> Built-in custom checks (line/column detail)
  |       +--> axe-core standards-based checks (WCAG coverage)
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

Current technologies: **Next.js 15**, **Tailwind CSS v4**, and **shadcn/ui** (currently used for the dashboard scan-mode select component)

Current status:

- Next.js frontend scaffold created
- frontend source reorganized under `frontend/src/`
- dashboard home scan form implemented
- results summary and issue list UI implemented
- separate issues page implemented with mock issue data
- shared dashboard shell with sidebar implemented
- shadcn/ui Select component integrated for dashboard controls
- sidebar destinations for history, reports, and preferences are not implemented yet
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

This file manages the overall scan pipeline: fetching HTML, running custom checks, coordinating with axe-core, and capturing screenshots.

### `backend/app/services/axe_scanner.py`

Contains the axe-core integration logic.

Responsibilities:

- download and cache the axe-core JavaScript library from CDN
- inject axe-core into a Playwright page and run analysis
- map axe-core violation results into the project `ScanIssue` format
- extract and format WCAG success criteria from axe-core tags
- merge custom and axe-core issues with deduplication for overlapping rules

### `backend/app/utils/url_utils.py`

Contains small reusable helpers.

Current responsibility:

- validate that a submitted URL is an `http` or `https` URL with a valid host

## 5. Current Scan Flow

The current backend flow for one-page scanning is:

1. The frontend or API client sends a `POST /scan/page` request with a URL.
2. FastAPI validates the request body using `ScanPageRequest`.
3. The backend validates the URL format.
4. The scanner fetches the HTML of the page.
5. The scanner parses the HTML and extracts key elements.
6. The scanner runs custom accessibility checks (line/column-level detail).
7. A Playwright browser session is opened and the page HTML is loaded.
8. axe-core is injected into the page and runs standards-based analysis.
9. Custom and axe-core issues are merged with deduplication.
10. Contextual screenshots are captured for all merged issues.
11. The backend returns JSON containing:
    - scanned URL
    - scan timestamp
    - issue summary
    - issue list with WCAG criteria references
    - source location hints when available (custom checks)
    - detection source (custom, axe-core, or both)
    - issue screenshots when capture succeeds

## 6. Current Accessibility Checks

### Custom checks (with line/column positions)

These 6 checks parse the raw HTML and provide source-level location detail:

1. missing or empty `<title>`
2. missing `lang` on the `<html>` element
3. images missing `alt`
4. vague link text such as `click here`
5. duplicate `id` values
6. heading hierarchy skips

### axe-core checks (standards-based)

The axe-core engine runs inside Playwright and covers WCAG 2.0 A/AA, WCAG 2.1 A/AA, and best-practice rules. This adds dozens of additional checks including:

- color contrast (color-contrast)
- button accessible names (button-name)
- form input labels (label, select-name)
- ARIA attribute validity (aria-valid-attr, aria-roles)
- table headers (td-headers-attr)
- landmark structure (region, landmark-*)
- deprecated HTML elements (marquee)
- and many more

### Deduplication

When both systems detect the same rule, the custom check version is kept (for line/column detail) and enriched with WCAG criteria from axe-core. The issue source is marked as "both". Non-overlapping axe-core rules are added with source "axe-core".

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

### Stage 2: Stronger page analysis (partially complete)

- Playwright for rendering JavaScript-heavy pages (used for axe-core and screenshots)
- axe-core integration for standards-based issue detection (completed)
- normalization of tool findings into one internal JSON format (completed)
- full JavaScript rendering for single-page apps (not yet started)

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
- shared shadcn/ui component primitives for higher-quality form controls
Current implementation status:

- URL input implemented
- scan button implemented
- summary cards implemented
- issue list implemented
- dedicated issues page implemented with mock data and local drilldown
- local test URL workflow supported
- dashboard shell and mobile sidebar implemented
- history, reports, and preferences routes not implemented yet
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
      "screenshot_data_url": "data:image/png;base64,...",
      "wcag_criteria": ["WCAG 2.0 A", "WCAG 1.3.1"],
      "source": "both"
    }
  ]
}
```

Location fields:

- `line` and `column` refer to the fetched HTML source (available for custom checks)
- `source_hint` shows the matching opening tag or a short location hint
- `screenshot_data_url` contains a contextual screenshot of the affected page area when Playwright capture succeeds
- `wcag_criteria` lists relevant WCAG success criteria (e.g. `["WCAG 2.0 A", "WCAG 1.3.1"]`)
- `source` indicates detection origin: `"custom"`, `"axe-core"`, or `"both"`
- on framework-generated sites, line/column may not map directly to the original source file in the repository

## 11. Current Status

Completed:

- project folder structure
- backend skeleton
- FastAPI app setup
- health endpoint
- single-page scan endpoint
- baseline custom checks (6 rules with line/column detail)
- axe-core integration (WCAG 2.0/2.1 A/AA + best-practice rules)
- issue merge and deduplication pipeline
- WCAG criteria display in frontend
- `src/`-based frontend structure
- componentized home dashboard page
- shared dashboard shell
- dedicated issues screen with filters and detail panel

Implemented intelligent-analysis features:

- automated standards-based issue detection using axe-core
- automated issue merging between custom rules and axe-core findings
- automated repair guidance and help-link surfacing in issue results
- automated WCAG tagging for detected issues
- automated locator guidance using source hints, DOM paths, and text previews
- automated contextual screenshot capture to support issue review
Not built yet:

- full JavaScript rendering for single-page apps
- database persistence
- multi-page crawl
- reporting
- formal test suite
- functional history, reports, and preferences pages
- generative AI / LLM-based repair suggestions

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







