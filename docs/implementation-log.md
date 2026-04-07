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
## 2026-03-20 - Docker Development Workflow

### Completed work

Added a separate Docker-based development workflow:

- added `backend/Dockerfile.dev`
- added `frontend/Dockerfile.dev`
- added `docker-compose.dev.yml`
- documented how to use the development Docker workflow

### Why this was done

The existing Docker setup was suitable for a production-style run, but not ideal for active development because it required rebuild-oriented usage.

This development workflow was added to:

- support hot reload for frontend and backend
- reduce rebuild time during coding
- keep production-style and development-style Docker usage separate
- improve day-to-day implementation speed

### Files involved

- `backend/Dockerfile.dev`
- `frontend/Dockerfile.dev`
- `docker-compose.dev.yml`
- `README.md`
- `docs/docker-setup-guide.md`

### Verification

- development Dockerfiles created for frontend and backend
- development Docker Compose file created
- README updated with the dev startup command
- Docker guide updated with development workflow instructions

### Outcome

The project now has both a production-style Docker workflow and a development-focused Docker workflow with hot reload.

### Next step

Run `docker compose -f docker-compose.dev.yml up --build`, edit a frontend and backend file, and confirm the containers reload without a full rebuild.

## 2026-03-20 - Render Backend Deployment Preparation

### Completed work

Prepared the backend for deployment on Render:

- updated backend CORS handling to support environment-configured frontend origins
- kept local frontend origins for development
- documented the Render backend service field values needed for Docker deployment

### Why this was done

The backend previously allowed requests only from localhost frontend URLs.

That would cause browser CORS failures once the frontend is deployed to a public Render domain.

This update makes the backend deployment-ready by allowing the production frontend origin to be injected through Render environment variables instead of being hardcoded in source.

### Files involved

- `backend/app/main.py`
- `docs/implementation-log.md`

### Verification

- confirmed the FastAPI CORS middleware now reads:
  - `FRONTEND_URL`
  - `CORS_ALLOWED_ORIGINS`
- confirmed the origin list still includes local development URLs
- Render deployment verification is still pending and should be completed after the backend and frontend services are live

### Outcome

The backend can now be configured to accept requests from both local development and the deployed Render frontend without editing source code again for each environment.

### Next step

Deploy the backend and frontend on Render, set `FRONTEND_URL` on the backend service, set `NEXT_PUBLIC_API_BASE_URL` on the frontend service, and verify that a browser scan request completes without a CORS error.

## 2026-03-20 - Vercel Frontend Deployment Preparation

### Completed work

Prepared the project for a Vercel frontend deployment:

- updated the frontend test-page shortcut to use the configured API base URL instead of hardcoded localhost
- extended backend CORS configuration to support an optional origin regex for hosted preview deployments

### Why this was done

The frontend previously included a localhost-only test-page shortcut, which would not work after deployment.

Also, exact-origin CORS configuration is enough for a single production domain, but hosted preview deployments often use changing subdomains.

These updates reduce deployment friction by making the frontend and backend more environment-aware.

### Files involved

- `frontend/app/page.tsx`
- `backend/app/main.py`
- `docs/implementation-log.md`

### Verification

- confirmed the frontend test URL now resolves from `NEXT_PUBLIC_API_BASE_URL`
- confirmed the backend now supports:
  - `FRONTEND_URL`
  - `CORS_ALLOWED_ORIGINS`
  - `CORS_ALLOWED_ORIGIN_REGEX`
- local production-build verification is still pending because the Windows sandbox interrupted the `npm run build` check

### Outcome

The frontend is now better aligned with Vercel deployment, and the backend can be configured to accept either a single Vercel production origin or a pattern for preview deployments.

### Next step

Deploy the frontend to Vercel, set `NEXT_PUBLIC_API_BASE_URL` to the Render backend URL, and if preview deployments need API access, configure `CORS_ALLOWED_ORIGIN_REGEX` on the backend to match the Vercel preview domain pattern.

## 2026-04-01 - axe-core Integration

### Completed work

Integrated axe-core standards-based accessibility analysis into the scan pipeline:

- created `backend/app/services/axe_scanner.py` as the axe-core integration module
- axe-core JavaScript library is downloaded from CDN and cached in memory on first scan
- axe-core runs inside the existing Playwright browser session alongside screenshot capture
- axe-core results are mapped to the project `ScanIssue` format with severity, WCAG criteria, and recommendations
- added deduplication logic that merges custom checks with axe-core findings
- overlapping rules (document-title, html-lang, image-alt, link-name, duplicate-id, heading-order) keep the custom version enriched with WCAG tags from axe-core
- non-overlapping axe-core rules are appended as new issues
- added `wcag_criteria` field to `ScanIssue` for WCAG success criteria references
- added `source` field to `ScanIssue` to indicate detection origin (custom, axe-core, or both)
- restructured `page_scanner.py` to use a single Playwright session for both axe-core analysis and screenshot capture
- updated frontend issue cards to display WCAG criteria as visual pills
- updated frontend to show detection source (custom, axe-core, or both) on each issue
- updated frontend to render axe-core help URLs as clickable links in recommendations
- expanded the local test page to trigger additional axe-core rules including color contrast, button name, form labels, marquee, and table headers
- added CSS styles for WCAG tags, source pills, and help links

### Why this was done

The previous scan pipeline relied on 6 custom HTML-based checks. While useful for proving the pipeline, they covered only a small fraction of WCAG success criteria.

axe-core is an industry-standard accessibility engine maintained by Deque Systems. Integrating it gives the project:

- coverage of WCAG 2.0 A/AA, WCAG 2.1 A/AA, and best-practice rules
- detection of issues the custom parser cannot catch (color contrast, ARIA misuse, form accessibility, table structure, etc.)
- WCAG success criteria references for each issue, improving academic credibility
- alignment with the same engine used by Google Lighthouse and browser DevTools

### Files involved

- `backend/app/services/axe_scanner.py` (new)
- `backend/app/services/page_scanner.py` (modified)
- `backend/app/schemas/scan.py` (modified)
- `backend/app/main.py` (modified)
- `frontend/app/page.tsx` (modified)
- `frontend/app/globals.css` (modified)
- `docs/implementation-log.md` (this file)
- `docs/system-architecture.md` (modified)

### axe-core rules now active

The integration runs axe-core with the following rule tag sets:

- `wcag2a` — WCAG 2.0 Level A
- `wcag2aa` — WCAG 2.0 Level AA
- `wcag21a` — WCAG 2.1 Level A
- `wcag21aa` — WCAG 2.1 Level AA
- `best-practice` — industry best practices

This covers dozens of additional rules beyond the original 6, including:

- color contrast (color-contrast)
- button accessible names (button-name)
- form input labels (label, select-name)
- ARIA attribute validity (aria-valid-attr, aria-roles)
- table headers (td-headers-attr)
- landmark structure (region, landmark-*)
- deprecated HTML elements (marquee)
- and many more

### Deduplication strategy

When both custom checks and axe-core detect the same rule:

1. The custom check version is kept because it includes line/column positions and source hints from raw HTML parsing
2. WCAG criteria from axe-core are added to the custom issue
3. The issue source is marked as "both"
4. The axe-core duplicate is discarded

When axe-core detects a rule not covered by custom checks:

1. The axe-core issue is included with full detail
2. The issue source is marked as "axe-core"

### Architectural change

The Playwright browser session was previously used only for screenshots. It now serves two purposes in a single session:

1. axe-core injection and analysis
2. contextual screenshot capture for all issues

This avoids launching the browser twice and keeps scan latency reasonable.

### Verification

- axe_scanner.py module created with CDN-based script caching, result mapping, WCAG tag formatting, and merge logic
- page_scanner.py restructured to run axe-core before screenshots in one Playwright session
- ScanIssue schema extended with wcag_criteria and source fields
- frontend updated to render WCAG pills, source indicators, and clickable help links
- test page expanded with additional elements that trigger axe-core rules
- graceful fallback: if axe-core fails to load or run, the scan falls back to custom checks only

### Outcome

The scan pipeline now detects significantly more accessibility issues using industry-standard axe-core rules while preserving the original custom checks that provide source-level location hints.

### Next step

Run the backend and frontend, scan the test page, and verify that both custom and axe-core issues appear in the results with WCAG criteria tags and correct source indicators.

## 2026-04-01 - Dashboard UI Redesign

### Completed work

Replaced the single-page hero layout with a full dashboard interface:

- added a sidebar navigation with icons (Dashboard, Issues, Scan History, Reports, Preferences)
- added a top bar with URL input, scan mode selector, test-page shortcut, and scan button
- added an animated progress bar with stage-aware status messages during scans
- added four summary metric cards (Total, High, Medium, Low)
- added a severity breakdown panel with horizontal bar chart and top-rules list
- added a scan details panel showing URL, timestamp, and issue counts
- added a filterable issues list with severity toggle buttons (All, High, Medium, Low)
- added expandable issue rows that reveal screenshots, WCAG tags, element info, DOM paths, source hints, recommendations, and locator guidance
- switched from serif typography to Inter via next/font/google
- added responsive layout with collapsible sidebar on mobile and adaptive grid breakpoints
- preserved all existing API integration and data types

### Why this was done

The previous frontend was a vertically-stacked page with a hero section and a flat list of issues. While functional, it did not match the dashboard-style interface expected for the final project.

This redesign brings the frontend in line with the mockup provided, giving it a professional dashboard feel with:

- at-a-glance metrics visible before scrolling
- severity filtering to focus on what matters
- expandable detail views to reduce visual clutter
- a sidebar that establishes the application structure for future views

### Files involved

- `frontend/app/layout.tsx` (modified — added Inter font)
- `frontend/app/globals.css` (rewritten — dashboard styles)
- `frontend/app/page.tsx` (rewritten — dashboard component)

### Key improvements over the reference mockup

- real API integration instead of demo data
- simulated progress bar during actual backend scan calls
- expandable issue details with screenshots, WCAG criteria, source hints, and DOM paths
- "Learn more" links extracted from axe-core recommendations
- locator hints for finding elements in DevTools
- responsive sidebar that collapses to an overlay on mobile
- accessible markup (button elements for nav, aria-label on toggle)

### Verification

- `npm run build` completed successfully with zero errors
- all existing TypeScript types preserved and used correctly
- layout renders the dashboard shell with sidebar, topbar, and scrollable content area

### Outcome

The frontend now presents a professional dashboard interface that matches the project's target design while keeping all existing scan functionality intact.

### Next step

Run the full stack locally, perform a scan, and verify that metrics, severity breakdown, issue filtering, and expandable details all work correctly with real backend data.

## 2026-04-01 - shadcn/ui Dropdown Refresh

### Completed work

Improved the dashboard dropdown by introducing shadcn/ui into the frontend stack:

- installed Tailwind CSS v4 so shadcn/ui components can be used in the Next.js app
- added shadcn/ui project configuration (`components.json`) and PostCSS config for Tailwind
- generated the official shadcn/ui `Select` component and supporting `cn` utility
- replaced the native scan-mode `<select>` in the dashboard top bar with the shadcn/ui select component
- mapped the existing dashboard palette into shadcn-compatible theme tokens so the new control matches the current visual language
- kept the mobile behavior that hides the scan-mode control below the tablet breakpoint

### Why this was done

The previous native browser `<select>` looked visually out of place compared with the rest of the redesigned dashboard.

This change improves UI consistency by:

- using a reusable component from a modern UI library instead of browser-default form styling
- making the dropdown visually consistent with the dashboard input, cards, and buttons
- laying the groundwork for reusing shadcn/ui primitives for future frontend refinements

### Files involved

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/tsconfig.json`
- `frontend/postcss.config.mjs`
- `frontend/components.json`
- `frontend/lib/utils.ts`
- `frontend/components/ui/select.tsx`
- `frontend/app/page.tsx`
- `frontend/app/globals.css`
- `README.md`
- `docs/system-architecture.md`
- `docs/implementation-log.md`

### Verification

- installed the required frontend dependencies for Tailwind CSS v4, shadcn/ui helpers, and the generated select component
- confirmed the dashboard page renders the shadcn/ui select markup in place of the native `<select>`
- ran `npm run build` successfully after the integration

### Outcome

The dashboard now uses a reusable shadcn/ui dropdown that looks more consistent with the rest of the interface, and the frontend project is prepared to adopt additional shadcn/ui components later.

### Next step

Replace other ad-hoc dashboard controls with shared component primitives where it improves clarity without disrupting the current layout.

## 2026-04-07 - Frontend Source Reorganization And Dashboard Refactor

### Completed work

Reorganized and documented the current frontend implementation:

- moved the frontend source tree to a `src/`-based structure
- fixed frontend import alias resolution to target `src/*`
- updated shadcn/ui configuration to point at `src/app/globals.css`
- updated the home dashboard to render inside the shared `DashboardShell`
- refactored the oversized home dashboard page into smaller feature components and a dedicated scan hook
- created a project feature checklist document capturing implemented and missing work
- refreshed architecture and README documentation so current status better matches the codebase

### Why this was done

The frontend had become harder to maintain because:

- source files were no longer aligned with the intended `src/` layout
- the home page contained too much logic and UI in one file
- project documentation no longer matched the actual implementation status

This update improves maintainability and makes project tracking more reliable for future implementation and reporting.

### Files involved

- `frontend/tsconfig.json`
- `frontend/components.json`
- `frontend/src/app/page.tsx`
- `frontend/src/hooks/useDashboardScan.ts`
- `frontend/src/components/home/types.ts`
- `frontend/src/components/home/constants.ts`
- `frontend/src/components/home/utils.ts`
- `frontend/src/components/home/ScanToolbar.tsx`
- `frontend/src/components/home/ProgressPanel.tsx`
- `frontend/src/components/home/MetricsGrid.tsx`
- `frontend/src/components/home/OverviewPanels.tsx`
- `frontend/src/components/home/IssuesSection.tsx`
- `frontend/src/components/home/IssueRow.tsx`
- `README.md`
- `docs/system-architecture.md`
- `docs/feature-checklist.md`
- `docs/implementation-log.md`

### Verification

- regenerated Next route types after the source move
- ran `npx tsc --noEmit` successfully after the alias update
- ran `npx tsc --noEmit` successfully after the home page refactor
- manually reviewed current frontend routes to identify implemented versus missing pages

### Outcome

The frontend codebase is more maintainable, the home dashboard is split into focused modules, and the project now has an explicit checklist describing implemented and unimplemented features.

### Next step

Decide whether to implement the missing sidebar destinations first or remove those links until history, reports, and preferences are actually available.

## 2026-04-07 - Documentation Clarification For AI-Related Features

### Completed work

Updated the project documentation to make the implemented intelligent analysis features explicit:

- added an AI / intelligent-analysis section to the feature checklist
- clarified in the architecture document which automated analysis and guidance features are already implemented
- separated implemented automated analysis from not-yet-implemented generative AI functionality

### Why this was done

The project documentation did not clearly show the currently implemented analysis features, which made it easy to read the implementation status as if no AI-related or intelligent automation features had been added yet.

This clarification improves accuracy by distinguishing:

- implemented automated analysis and repair-guidance support
- not-yet-implemented generative AI or LLM-based remediation features

### Files involved

- `docs/feature-checklist.md`
- `docs/system-architecture.md`
- `docs/implementation-log.md`

### Verification

- reviewed the current backend scan pipeline in `backend/app/services/page_scanner.py`
- reviewed the axe-core integration in `backend/app/services/axe_scanner.py`
- confirmed that the implemented features are rules-based and automation-driven, but not LLM-based

### Outcome

The documentation now explicitly lists the implemented intelligent analysis features without overstating the current system as using generative AI.

### Next step

If the project overview document defines a specific planned AI feature set, close the `.docx` file and align the docs wording with that source document exactly.
