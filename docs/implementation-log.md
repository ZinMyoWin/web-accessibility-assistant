# Implementation Log

## Documentation Rule

Update this file every time a meaningful feature or milestone is completed.

For each update, record:

1. what was implemented
2. why it was implemented
3. which files were created or changed
4. how it was verified
5. what the next step is

This document is meant to support:

- progress tracking
- final report writing
- testing evidence
- supervisor updates

## 2026-03-12 - Backend Foundation

### Completed work

Implemented the first backend milestone for the project:

- created the FastAPI application entry point
- added root endpoint `GET /`
- added health endpoint `GET /health`
- confirmed the backend can run as a basic API service

### Why this was done

This establishes the minimum backend foundation before adding scan logic.

It proves:

- the backend framework is working
- the API structure exists
- the project has a verifiable first milestone

### Files involved

- `backend/app/main.py`
- `backend/requirements.txt`

### Verification

- confirmed the health endpoint returns a valid response
- confirmed FastAPI docs are available through `/docs`

### Outcome

The project now has a working backend service skeleton.

### Next step

Implement one-page scanning and return structured JSON results.

## 2026-03-12 - Single-Page Scan MVP

### Completed work

Implemented the first real scan feature in the backend:

- added `POST /scan/page`
- added request and response schemas
- added URL validation helper
- added page fetching logic
- added HTML parsing logic
- added baseline accessibility checks
- added issue summary generation

### Why this was done

This is the first end-to-end project feature.

It proves the system can:

- accept a public webpage URL
- retrieve the page
- inspect the HTML
- detect a small set of accessibility issues
- return structured results that a frontend can use later

### Files involved

- `backend/app/main.py`
- `backend/app/schemas/scan.py`
- `backend/app/services/page_scanner.py`
- `backend/app/utils/url_utils.py`

### Checks currently implemented

- missing or empty page title
- missing `lang` on the `<html>` element
- image missing `alt`
- vague link text
- duplicate IDs
- heading level skips

### Verification

- compiled the backend app successfully
- ran a mocked HTML smoke test to confirm issues are detected
- ran a real scan against `https://example.com`

### Outcome

The backend can now scan one page and return structured JSON in a consistent format.

### Next step

Build the frontend page that submits a URL and displays scan results.

## 2026-03-12 - Local Backend Test Page

### Completed work

Added a deterministic local test route for backend validation:

- added `GET /test/page-bad`
- returned HTML with intentional accessibility issues
- updated architecture documentation to include the test route

### Why this was done

Testing only against public websites is unreliable because some pages may not trigger the current baseline checks.

This local route provides a predictable test target for:

- scanner validation
- demonstration
- screenshots for the report

### Files involved

- `backend/app/main.py`
- `docs/system-architecture.md`

### Verification

- backend code updated successfully
- route is available through the FastAPI application definition
- manual scan test against `http://127.0.0.1:8000/test/page-bad` returned 6 issues as expected
- returned issues matched the intended baseline checks:
  - `document-title`
  - `html-lang`
  - `image-alt`
  - `link-name`
  - `duplicate-id`
  - `heading-order`
- note: `scanned_at` is returned in UTC, so `2026-03-11T17:25:57+00:00` corresponds to `2026-03-12 00:25:57` in Asia/Bangkok

### Outcome

The project now has a stable local page that should trigger the current issue detection rules.

### Next step

Begin frontend integration so the URL can be submitted and results displayed without using Swagger UI.

## 2026-03-12 - Frontend Scan Dashboard

### Completed work

Implemented the first frontend MVP for the project:

- created a Next.js frontend scaffold
- added a scan page with URL input
- added a button to use the local backend test page
- connected the frontend to `POST /scan/page`
- displayed severity summary cards
- displayed issue details and recommendations
- enabled backend CORS for local frontend development

### Why this was done

This moves the project beyond backend-only testing.

It proves the system can now:

- accept user input through a UI
- send scan requests from the browser to the backend
- display structured results without using Swagger UI

### Files involved

- `frontend/package.json`
- `frontend/tsconfig.json`
- `frontend/next-env.d.ts`
- `frontend/next.config.ts`
- `frontend/app/layout.tsx`
- `frontend/app/page.tsx`
- `frontend/app/globals.css`
- `backend/app/main.py`
- `README.md`
- `docs/system-architecture.md`

### Verification

- frontend files created successfully
- backend CORS configured for local development
- backend code compiled successfully after the CORS update
- frontend dependencies installed successfully
- `npm run build` completed successfully for the Next.js app

### Outcome

The project now has a browser-based scan interface ready for local development and manual testing.

### Next step

Install frontend dependencies, run the Next.js app, and manually test the scan flow from the UI.

## 2026-03-12 - Repository Ignore Rules

### Completed work

Added a root `.gitignore` file for the project.

Ignored generated and local-only files including:

- Python virtual environments
- Python cache directories
- Next.js build output
- Node modules
- coverage output
- log files
- local environment files
- editor and OS metadata

### Why this was done

These files should not be pushed because they are either:

- machine-specific
- generated automatically
- reproducible from source files
- unnecessarily large or noisy in version control

### Files involved

- `.gitignore`

### Verification

- matched ignore rules to the directories currently present in the project:
  - `backend/venv/`
  - `backend/app/**/__pycache__/`
  - `frontend/node_modules/`
  - `frontend/.next/`

### Outcome

The repository is now set up to avoid committing local environments, caches, and build artifacts.

### Next step

Start tracking the source files only and continue frontend manual testing.

## 2026-03-12 - Source Location Hints In Scan Results

### Completed work

Extended the scan results to include source-location guidance:

- added optional `line` and `column` fields to scan issues
- added optional `source_hint` text to scan issues
- captured tag positions while parsing fetched HTML
- displayed location information in the frontend issue cards
- added a frontend note explaining the limitation on framework-generated sites

### Why this was done

The earlier UI told the user what the issue was, but not where to start fixing it.

This change makes the results more actionable by pointing to:

- the approximate line in the fetched HTML
- the matching opening tag or location hint

### Files involved

- `backend/app/schemas/scan.py`
- `backend/app/services/page_scanner.py`
- `frontend/app/page.tsx`
- `frontend/app/globals.css`
- `docs/system-architecture.md`

### Verification

- backend issue schema updated successfully
- parser logic updated to capture source positions from HTML parsing
- frontend updated to render location fields when available

### Outcome

Scan results can now show where an issue appears in the fetched HTML, which makes manual fixing easier.

### Next step

Re-run the local scan and verify that the UI now shows line, column, and source hint details for each issue.

## 2026-03-12 - DOM Path And Text Preview Hints

### Completed work

Improved issue identification for repeated elements:

- added `dom_path` to scan issues
- added `text_preview` to scan issues
- tracked ancestor context during HTML parsing
- captured heading text for heading-order issues
- displayed DOM path and text preview in the frontend results

### Why this was done

Line and column alone are not enough when a page contains many repeated tags such as multiple `<h3>` elements.

This change gives the user:

- the actual heading text when available
- the approximate DOM path to the element

### Files involved

- `backend/app/schemas/scan.py`
- `backend/app/services/page_scanner.py`
- `frontend/app/page.tsx`

### Verification

- parser updated to keep ancestor context and heading text
- frontend updated to render the new location hints

### Outcome

Repeated elements such as multiple headings can now be distinguished more clearly in scan results.

### Next step

Re-run a scan on a page with repeated headings and confirm the UI shows both the heading text and DOM path.

## 2026-03-12 - Improved Locator Guidance

### Completed work

Refined issue location hints so they are easier to use in practice:

- shortened noisy source hints
- fixed DOM path generation for void elements such as `meta`, `link`, and `img`
- limited DOM paths to the most useful tail section
- added a frontend "Best way to find it" instruction for each issue

### Why this was done

The earlier output was technically correct but too noisy to be useful on real websites.

This change makes the result easier to act on by giving:

- cleaner source snippets
- shorter DOM paths
- plain-language guidance for how to find the element in DevTools

### Files involved

- `backend/app/services/page_scanner.py`
- `frontend/app/page.tsx`
- `frontend/app/globals.css`

### Verification

- backend smoke test confirmed improved outputs such as:
  - heading text preview: `Any browser Any platform One API`
  - compact DOM path: `body > main > section.features_keug > div.container > div.row > div.col.col-6 > h3`
  - cleaner image source hint with image label and source

### Outcome

Issue results are now more usable for manual debugging and inspection in the browser.

### Next step

Restart the app, re-run the scan, and verify the new locator guidance is sufficient for manual fixes.


## 2026-03-12 - Issue Screenshots In Scan Results

### Completed work

Extended the scan results so each issue can include a screenshot of the affected page area:

- added `screenshot_data_url` to scan issues
- integrated Playwright-based screenshot capture in the backend
- captured contextual page clips around the detected element instead of tiny element-only snapshots
- displayed issue screenshots in the frontend issue cards
- updated setup documentation to include Playwright browser installation

### Why this was done

Text-only issue details were still too hard to act on for non-technical users or for pages with repeated components.

This change makes the output more user-friendly by showing the actual section of the page where the issue appears.

### Files involved

- `backend/app/schemas/scan.py`
- `backend/app/services/page_scanner.py`
- `backend/requirements.txt`
- `frontend/app/page.tsx`
- `frontend/app/globals.css`
- `README.md`
- `docs/system-architecture.md`

### Verification

- Playwright Python package installed successfully
- Chromium browser installed successfully for Playwright
- backend compile check completed successfully
- backend smoke test confirmed screenshots are attached for:
  - `document-title`
  - `html-lang`
  - `image-alt`
  - `heading-order`

### Outcome

The scan UI can now show the page section that contains the issue, not just text metadata about the issue.

### Next step

Restart the backend and frontend, run a scan, and verify the screenshot thumbnails help the user identify the affected section quickly.
## 2026-03-20 - Docker Setup For Frontend And Backend

### Completed work

Containerized the current application stack:

- added a backend Dockerfile
- added a backend `.dockerignore`
- added a frontend Dockerfile
- added a frontend `.dockerignore`
- added a root `docker-compose.yml`
- added Docker run instructions to the README
- added a dedicated step-by-step Docker setup guide

### Why this was done

The project had working local run steps, but setup still depended on the machine having the correct tools installed and configured manually.

This Docker setup was added to:

- standardize the runtime environment
- make the frontend and backend easier to start together
- include Playwright browser setup inside the backend image
- reduce setup friction for later testing, demo, and supervision

### Files involved

- `backend/Dockerfile`
- `backend/.dockerignore`
- `frontend/Dockerfile`
- `frontend/.dockerignore`
- `docker-compose.yml`
- `README.md`
- `docs/docker-setup-guide.md`

### Verification

- Dockerfiles created for both services
- Docker Compose file created for the full stack
- Docker Compose configuration validated successfully using `docker compose config`
- inline comments added to Docker files for readability

### Outcome

The project now has a documented container-based startup path for both frontend and backend.

### Next step

Run `docker compose up --build`, verify both services in the browser, and then decide whether a separate Docker-based development workflow with hot reload is needed.

