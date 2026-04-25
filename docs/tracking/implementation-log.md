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
- `docs/architecture/system-architecture.md`

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
- `docs/architecture/system-architecture.md`

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
- `docs/architecture/system-architecture.md`

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
- `docs/architecture/system-architecture.md`

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
- `docs/guides/docker-setup-guide.md`

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
- `docs/guides/docker-setup-guide.md`

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
- `docs/tracking/implementation-log.md`

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
- `docs/tracking/implementation-log.md`

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
- `docs/tracking/implementation-log.md` (this file)
- `docs/architecture/system-architecture.md` (modified)

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
- `docs/architecture/system-architecture.md`
- `docs/tracking/implementation-log.md`

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
- `docs/architecture/system-architecture.md`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

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

- `docs/tracking/feature-checklist.md`
- `docs/architecture/system-architecture.md`
- `docs/tracking/implementation-log.md`

### Verification

- reviewed the current backend scan pipeline in `backend/app/services/page_scanner.py`
- reviewed the axe-core integration in `backend/app/services/axe_scanner.py`
- confirmed that the implemented features are rules-based and automation-driven, but not LLM-based

### Outcome

The documentation now explicitly lists the implemented intelligent analysis features without overstating the current system as using generative AI.

### Next step

If the project overview document defines a specific planned AI feature set, close the `.docx` file and align the docs wording with that source document exactly.

## 2026-04-07 - Documentation Alignment With Project Overview

### Completed work

Read the latest `project_overview.docx` and aligned the project documentation with its intended target scope:

- confirmed the overview defines the long-term AI feature as real-time LLM-generated repair guidance and corrected code examples
- clarified in the docs that this LLM layer is planned but not implemented yet
- updated the architecture and README so the intended AI scope, multi-page crawl scope, persistence, and report export scope are visible

### Why this was done

The project overview describes a broader target system than the current implementation. Without reflecting that in the docs, it was too easy to confuse:

- what the final project is intended to become
- what is actually implemented today

This update makes the documentation more faithful to the approved project direction while keeping implementation status accurate.

### Files involved

- `documents/project_overview.docx` (source reference)
- `README.md`
- `docs/architecture/system-architecture.md`
- `docs/tracking/implementation-log.md`

### Verification

- extracted the text content from `project_overview.docx`
- confirmed the overview explicitly includes:
  - multi-page crawling
  - AI-generated repair suggestions
  - corrected code examples
  - persistent scan history
  - PDF and CSV export
- updated project docs without changing implemented feature claims

### Outcome

The documentation now distinguishes more clearly between the current implemented system and the broader AI-enabled target system described in the project overview.

### Next step

Update the PRD, SRS, or final report draft so the same implemented-versus-planned distinction is consistent across all project documents.

## 2026-04-07 - Scan History Page

### Completed work

Implemented the Scan History page as a new dashboard view:

- created the `Scan` type and `MOCK_SCANS` mock data module
- created the scan history page at `/scan-history` inside the dashboard layout
- built five focused components: `ScanHistoryMetrics`, `ScanHistoryFilterBar`, `CompareBanner`, `ScanHistoryRow`, `ScanHistoryList`
- implemented client-side filtering by search query, scan status, and scan mode
- implemented client-side sorting (newest, oldest, most/fewest issues)
- implemented compare mode with checkbox selection (max 2 scans)
- implemented animated progress bar for running scans
- used the existing `Badge` component for severity chips
- used the existing `Input`, `Select`, `Button`, and `ScrollArea` shadcn/ui components
- followed the design system tokens from `globals.css` and `CLAUDE.md` throughout
- updated the sidebar nav link to `/scan-history`

### Why this was done

The sidebar had a Scan History link pointing to a route that did not exist. This page fills that gap and provides the scan history view described in the reference design, including:

- at-a-glance scan metrics
- filterable and sortable scan list
- status indicators (running, complete, error)
- severity breakdown per scan
- accessibility score display
- compare mode for side-by-side scan selection

### Files involved

- `frontend/src/lib/mock-scans.ts` (new)
- `frontend/src/app/(dashboard)/scan-history/page.tsx` (new)
- `frontend/src/components/scan-history/ScanHistoryMetrics.tsx` (new)
- `frontend/src/components/scan-history/ScanHistoryFilterBar.tsx` (new)
- `frontend/src/components/scan-history/CompareBanner.tsx` (new)
- `frontend/src/components/scan-history/ScanHistoryRow.tsx` (new)
- `frontend/src/components/scan-history/ScanHistoryList.tsx` (new)
- `frontend/src/components/dashboard/DashboardShell.tsx` (modified — nav href)
- `docs/tracking/implementation-log.md` (this file)

### Verification

- `npx tsc --noEmit` passed with zero errors after all files were created
- all components follow existing patterns from the Issues page and dashboard home
- severity chips use the `Badge` component with existing severity variants
- no inline styles — Tailwind classes only
- no new npm dependencies added

### Outcome

The Scan History page is now a functional dashboard view with mock data, ready for API integration when the backend scan history endpoint is implemented.

### Next step

Connect the scan history page to a real backend endpoint, replace mock data with API calls, and implement real pagination.

## 2026-04-07 - Database Setup Guide

### Completed work

Added a new database setup guide for the next persistence milestone:

- created `docs/guides/database-setup-guide.md`
- documented PostgreSQL local setup through Docker Compose
- documented backend package installation for `SQLAlchemy`, `Alembic`, and `psycopg`
- documented `DATABASE_URL` examples for both local backend runs and Docker backend runs
- documented Alembic initialization and first migration commands
- documented common database setup problems and quick repeat steps
- added the new guide to the README documentation list

### Why this was done

The project is preparing to move from mock scan history to real persisted scan records.

That next step needs a clear setup guide so the database environment can be reproduced without guesswork.

### Files involved

- `docs/guides/database-setup-guide.md` (new)
- `README.md`
- `docs/tracking/implementation-log.md`

### Verification

- checked the current Docker documentation style in `docs/guides/docker-setup-guide.md`
- aligned the new guide to the same step-by-step format
- confirmed the guide includes the required commands, run locations, and troubleshooting notes

### Outcome

The project now has a dedicated beginner-friendly guide for setting up PostgreSQL and the backend migration toolchain before implementing persistence.

### Next step

Add the actual PostgreSQL service to the Compose files, install the backend database packages, and initialize Alembic in the backend.

## 2026-04-07 - Compose Database Wiring Fix

### Completed work

Corrected the Docker Compose database wiring for both production-style and development-style stacks:

- removed `DATABASE_URL` from the `db` service in both Compose files
- added `DATABASE_URL` to the `backend` service in both Compose files
- added backend dependency on the `db` health check in both Compose files
- clarified the database setup guide so it explicitly shows `DATABASE_URL` belongs in the backend service block

### Why this was done

The database connection string was added to the wrong container.

`postgresql+psycopg://postgres:postgres@db:5432/accessibility_assistant` is correct for the backend container, but it should be passed to the backend process, not to the PostgreSQL container itself.

### Files involved

- `docker-compose.yml`
- `docker-compose.dev.yml`
- `docs/guides/database-setup-guide.md`
- `docs/tracking/implementation-log.md`

### Verification

- checked both Compose files against the guide
- corrected the invalid YAML environment entry
- aligned the Compose files with the intended backend-to-database connection model

### Outcome

Both Compose files now express the correct container responsibilities:

- `db` starts PostgreSQL
- `backend` receives `DATABASE_URL`
- the backend waits for PostgreSQL health before starting

### Next step

Run `docker compose config` for both files, then build and start the stack to confirm the database container and backend container come up in the correct order.


## 2026-04-07 - Documentation Reorganization And Persistence Guide

### Completed work

Reorganized the project documentation and added a beginner-friendly implementation document before backend persistence coding begins:

- created a docs index at `docs/README.md`
- reorganized the docs folder into `architecture`, `guides`, `implementation`, and `tracking`
- moved the existing architecture, guide, and tracking files into their new folders
- created `docs/implementation/backend-persistence-implementation-guide.md`
- updated documentation references so the new structure is consistent

### Why this was done

The documentation had grown, but all files were still stored in one flat folder.

That made the docs harder to navigate and made it less clear which files were for setup, which were for architecture, and which were for project tracking.

The new implementation guide was added so the backend persistence task can be understood clearly before coding starts.

### Files involved

- `docs/README.md` (new)
- `docs/architecture/system-architecture.md`
- `docs/guides/docker-setup-guide.md`
- `docs/guides/database-setup-guide.md`
- `docs/implementation/backend-persistence-implementation-guide.md` (new)
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`
- `README.md`

### Verification

- checked the existing documentation references before moving files
- reorganized the docs into grouped folders
- updated the main README documentation list
- confirmed the new persistence implementation guide was created for future reference

### Outcome

The documentation is now easier to browse, and the backend persistence task now has a clear beginner-friendly implementation reference before any code changes begin.

### Next step

Use the new persistence implementation guide to start the backend database integration work in a structured order.

## 2026-04-07 - Backend Scan Persistence And Saved Scan APIs

### Completed work

Implemented the first real persistence milestone for the backend:

- added SQLAlchemy database configuration in `backend/app/db.py`
- added ORM base model setup in `backend/app/models/base.py`
- added `ScanRun` and `ScanIssueRecord` models in `backend/app/models/scan.py`
- added saved-scan response schemas in `backend/app/schemas/history.py`
- extended `ScanPageResponse` to include optional `scan_id`
- added scan repository functions for saving, listing, and loading scans
- updated `POST /scan/page` to save successful scan results into PostgreSQL
- updated `POST /scan/page` to save failed scan attempts with `status="error"`
- added `GET /scans` for saved scan summaries
- added `GET /scans/{scan_id}` for saved scan details
- wired Alembic to the real SQLAlchemy metadata and database URL
- replaced the placeholder migration with real `scan_runs` and `scan_issues` table creation
- updated project docs so the current architecture and feature status match the implementation

### Why this was done

The project had database setup instructions and Docker wiring, but the application still behaved like a stateless scanner.

That meant:

- scan history could not use real backend data
- saved scan detail views could not be built yet
- scan results disappeared after each request
- the database existed, but the backend was not using it

This milestone turns persistence into a real backend feature and prepares the frontend for real history integration.

### Files involved

- `backend/app/db.py`
- `backend/app/main.py`
- `backend/app/models/base.py`
- `backend/app/models/scan.py`
- `backend/app/repositories/scan_repository.py`
- `backend/app/schemas/history.py`
- `backend/app/schemas/scan.py`
- `backend/alembic/env.py`
- `backend/alembic.ini`
- `backend/alembic/versions/9848b576f059_create_scan_tables.py`
- `docs/architecture/system-architecture.md`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`
- `README.md`

### Verification

- imported the FastAPI app successfully after the persistence changes
- ran `alembic upgrade head` successfully to create the database tables
- executed a repository smoke test that:
  - saved a completed scan
  - loaded it back by ID
  - listed it through the saved-scan query
  - removed the temporary test record after verification
- confirmed the new routes exist in `backend/app/main.py`

### Outcome

The backend now saves scan results in PostgreSQL and exposes saved scan APIs that the frontend can use next.

### Next step

Connect the frontend scan history page to `GET /scans`, then connect the issues view to `GET /scans/{scan_id}` so the UI can stop relying on mock data.

## 2026-04-07 - Frontend Saved Scan History Integration

### Completed work

Connected the dashboard history and issues views to the real backend persistence APIs:

- added a shared frontend API base module in `frontend/src/lib/api.ts`
- added saved-scan fetch helpers and mapping utilities in `frontend/src/lib/saved-scans.ts`
- updated the scan history page to load real data from `GET /scans`
- added frontend loading and error states for the scan history page
- changed history row selection so it opens the issues page with `scanId`
- updated the issues page to load saved scan details from `GET /scans/{scan_id}`
- mapped saved backend issues into the dashboard issues UI model
- updated issue filters, counts, and badges to use the backend severity model `high / medium / low`
- added real scan selection in the issues page header instead of hardcoded scan options
- updated project docs to reflect that scan history and saved scan detail views now use backend data

### Why this was done

The backend persistence APIs were already implemented, but the frontend still used mock data for both history and issue inspection.

That meant:

- the user could save scans, but not see those saved scans in the UI
- the history page looked complete but was not connected to real backend records
- the issues page could not inspect a real saved scan after selecting it from history

This step closes that gap and makes the dashboard use the saved-scan backend for real data.

### Files involved

- `frontend/src/lib/api.ts`
- `frontend/src/lib/saved-scans.ts`
- `frontend/src/components/home/constants.ts`
- `frontend/src/components/home/types.ts`
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/app/(dashboard)/scan-history/page.tsx`
- `frontend/src/components/scan-history/ScanHistoryList.tsx`
- `frontend/src/components/scan-history/ScanHistoryMetrics.tsx`
- `frontend/src/components/scan-history/ScanHistoryRow.tsx`
- `frontend/src/app/(dashboard)/issues/page.tsx`
- `frontend/src/components/issues/IssueFilterBar.tsx`
- `frontend/src/components/issues/IssueCountBar.tsx`
- `frontend/src/components/issues/IssueList.tsx`
- `frontend/src/components/issues/IssueDetailPanel.tsx`
- `docs/architecture/system-architecture.md`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`
- `README.md`

### Verification

- ran `npx tsc --noEmit` successfully in `frontend/`
- confirmed the scan history page now requests paged saved scans instead of using `MOCK_SCANS`
- confirmed the issues page now requests saved scan detail instead of using `MOCK_ISSUES`
- confirmed history row navigation now points to `/issues?scanId=<id>`

### Outcome

The frontend dashboard can now browse real saved scans and inspect real saved issue records from the backend.

### Next step

Connect the home dashboard scan result to the saved-scan issues page, then decide whether report export or compare mode should be implemented next.

## 2026-04-24 - Dashboard to Issues View Connection

### Completed work

Connected the home dashboard's live scan result to the saved-scan issues view:

- extended `OverviewPanels.tsx` to display a "View Detailed Report" button when a scan completes successfully
- configured the button to open `/issues?scanId={scan_id}` in a new browser tab, allowing the user to preserve the high-level dashboard metrics while exploring issue details
- marked the corresponding gap in `feature-checklist.md` as completed

### Why this was done

Although the dashboard displayed real scan metrics and issue excerpts, the user lacked an intuitive path to view the permanently stored scan details that the API had just saved.

By adding this button to the Scan Details panel pane, the user can easily explore the issue details in a deep-dive view using existing infrastructure, completing the loop between "requesting a scan" and "reviewing a saved scan report".

### Files involved

- `frontend/src/components/home/OverviewPanels.tsx`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

### Verification

- ran the frontend locally and confirmed that the "View Detailed Report" button successfully renders when a scan completes.
- verified the button accurately constructs the URL with the backend-provided `scan_id`.
- verified clicking the button opens the dedicated issues page in a new tab.

### Outcome

The dashboard correctly offloads complex report-view investigations to the dedicated issues page, bridging the gap between initiating a new scan and examining its persistent record.

### Next step

Decide whether report export or real comparison logic for the scan history compare mode should be tackled next.

## 2026-04-24 - Reports And Preferences Page UI

### Completed work

Implemented the full UI for the Reports and Preferences pages based on the provided HTML design mockups:

**New shadcn/ui primitives (3 components)**

- created `Switch` component using Radix `@radix-ui/react-switch`
- created `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` components using Radix `@radix-ui/react-tabs`
- created `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose` components using Radix `@radix-ui/react-dialog`
- all three follow the same pattern as the existing `Button`, `Input`, `Badge`, and `Select` primitives

**Preferences page (`/preferences`)**

- created a settings page with a left-side section navigation and a scrollable settings body
- created `PreferencesNav` — sticky sidebar with scroll-to-section navigation
- created `SectionCard` and `FieldRow` — reusable card wrappers for consistent section styling
- created `AiProviderSection` — provider tabs (OpenAI, DeepSeek, Anthropic), API key input with reveal toggle, model select, connection status indicator, active provider dropdown, auto-suggest toggle
- created `CrawlDefaultsSection` — scan mode radio cards (Single/Multi/Sitemap), page limit and crawl depth number inputs, request delay and timeout fields, ignored URL tag input with add/remove, domain and robots.txt toggles
- created `WcagStandardSection` — WCAG version radio (2.1/2.2), conformance level cards (A/AA/AAA) with descriptions, best-practice toggle
- created `NotificationsSection` — scan complete toggle, score threshold alert with number input, severity alert toggles with color-coded pills
- created `AppearanceSection` — theme cards (Light/Dark/System) with mini-preview blocks, density radio (Compact/Default/Comfortable), WCAG reference toggle, animate scan progress toggle
- created `DangerZoneSection` — clear scan history and reset preferences buttons with confirmation dialogs using the new Dialog component
- created `SaveBar` — sticky bottom bar that appears when the user makes changes, with discard and save buttons
- added toast notification for save/discard/danger zone actions

**Reports page (`/reports`)**

- created a report view page with static demo data matching the HTML mockup
- created `report-data.ts` — static demo data constants for all report sections
- created `ExportBar` — dark-themed header with Print, CSV, and PDF export buttons
- created `ReportHeader` — breadcrumb navigation, URL title, scan metadata (date, mode, pages, issues, WCAG level, duration), status badge
- created `ScoreRing` — SVG donut chart with animated stroke-dashoffset, color-coded by score threshold
- created `SummaryGrid` — three-column grid containing the score ring, severity breakdown bars, and WCAG principles cards (Perceivable, Operable, Understandable, Robust)
- created `PagesTab` — expandable table of crawled pages with per-page severity counts and element-level issue details
- created `CategoriesTab` — accordion of issue categories (Images & Alt Text, Colour & Contrast, Keyboard & Focus, Forms & Labels, ARIA & Semantics) with severity breakdowns
- created `AiSuggestionsTab` — AI repair suggestion cards with severity badges, confidence indicators, explanations, code diffs (removed/added), and action buttons (Apply fix, Copy patch, Dismiss)
- wired all tabs using the new Tabs component from shadcn/ui

**Dashboard shell fix**

- updated the Preferences sidebar link to use pathname-based active styling, matching the logic used by the main navigation items

### Why this was done

The project had functional Dashboard, Issues, and Scan History pages but was missing the Reports and Preferences modules. Both were listed as not implemented in the feature checklist.

The Reports page provides a detailed view of scan results with severity breakdown, WCAG principle analysis, expandable page-level details, and AI-powered repair suggestions. The Preferences page provides a settings interface for configuring AI providers, crawl defaults, WCAG standards, notifications, and appearance.

Both pages were designed to match the existing design system exactly — using only Tailwind CSS v4 utility classes and shadcn/ui components, with zero custom CSS files. This ensures visual and code consistency across all pages.

### Design system alignment

Before building the pages, a design system audit was performed across all existing pages to document the established patterns:

- all styling uses Tailwind CSS v4 utility classes inline, no separate CSS files per component
- shadcn/ui components (`Button`, `Input`, `Select`, `Badge`) are used for all interactive elements
- CSS custom properties from `globals.css` are referenced via Tailwind `var()` syntax
- cards use `rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card` consistently
- severity colours use `--high`, `--medium`, `--low` and `--severity-critical`, `--severity-serious`, `--severity-moderate`, `--severity-minor` tokens

The new pages follow these patterns exactly.

### Files involved

New files:

- `frontend/src/components/ui/switch.tsx`
- `frontend/src/components/ui/tabs.tsx`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/app/(dashboard)/preferences/page.tsx`
- `frontend/src/components/preferences/PreferencesNav.tsx`
- `frontend/src/components/preferences/SectionCard.tsx`
- `frontend/src/components/preferences/AiProviderSection.tsx`
- `frontend/src/components/preferences/CrawlDefaultsSection.tsx`
- `frontend/src/components/preferences/WcagStandardSection.tsx`
- `frontend/src/components/preferences/NotificationsSection.tsx`
- `frontend/src/components/preferences/AppearanceSection.tsx`
- `frontend/src/components/preferences/DangerZoneSection.tsx`
- `frontend/src/components/preferences/SaveBar.tsx`
- `frontend/src/app/(dashboard)/reports/page.tsx`
- `frontend/src/components/reports/report-data.ts`
- `frontend/src/components/reports/ExportBar.tsx`
- `frontend/src/components/reports/ReportHeader.tsx`
- `frontend/src/components/reports/ScoreRing.tsx`
- `frontend/src/components/reports/SummaryGrid.tsx`
- `frontend/src/components/reports/PagesTab.tsx`
- `frontend/src/components/reports/CategoriesTab.tsx`
- `frontend/src/components/reports/AiSuggestionsTab.tsx`

Modified files:

- `frontend/src/components/dashboard/DashboardShell.tsx`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

### Verification

- ran `npx tsc --noEmit` in `frontend/` with zero type errors
- ran `npx next build` successfully with zero build errors
- visually verified the Preferences page in the browser at `http://localhost:3000/preferences`:
  - sidebar highlights "Preferences" as active
  - all six section cards render correctly
  - side navigation is visible and functional
  - theme switching triggers the sticky save bar
  - danger zone dialogs open and close correctly
- visually verified the Reports page in the browser at `http://localhost:3000/reports`:
  - dark export bar renders with Print, CSV, PDF buttons
  - report header shows breadcrumb, URL, and metadata
  - summary grid shows score ring (57/100), severity bars, and WCAG principle cards
  - Pages Crawled tab shows expandable rows with severity counts
  - AI Repair Suggestions tab shows code diffs with confidence badges

### Outcome

The frontend now has complete UI implementations for both the Reports and Preferences pages. Both pages are built entirely with the project's standardised design system (Tailwind CSS v4 + shadcn/ui) and integrate seamlessly with the existing dashboard navigation.

### Next step

Connect the Reports page to real saved scan data from the backend instead of static demo data. Implement actual preference persistence (localStorage or backend API). Add export functionality (CSV/PDF) to the Reports page.

## 2026-04-24 - Report Export (Print, CSV, PDF)

### Completed work

Implemented client-side report export for all three export formats:

- created `export-utils.ts` with pure-function CSV generation. The CSV includes all report sections: metadata, severity breakdown, WCAG principles, pages crawled, detailed element-level issues, categories, and AI suggestions
- wired the ExportBar Print button to `window.print()` which opens the browser print dialog
- wired the ExportBar CSV button to `downloadCSV()` which generates a Blob and triggers a file download with a timestamped filename
- wired the ExportBar PDF button to `exportPDF()` which sets a descriptive document title and opens the browser print dialog (user selects "Save as PDF" as the destination)
- added a toast notification on CSV download that reads "CSV report downloaded"
- added `print:hidden` to the ExportBar, tab navigation, bottom spacing, and toast so they are excluded from printed output
- added `@media print` rules in `globals.css` to:
  - hide the sidebar and mobile toggle button
  - reclaim the sidebar's grid column for full-width content
  - enforce `print-color-adjust: exact` so severity badge colours and bar chart fill colours print correctly
  - prevent page breaks inside card sections
  - compact horizontal padding for paper margins

### Why this was done

The Reports page already had Print, CSV, and PDF buttons in the export bar but they were non-functional. This was identified as the next high-impact frontend-only feature in the checklist.

Report export is essential for:

- sharing scan results with stakeholders who may not have access to the dashboard
- printing accessibility audit reports for compliance documentation
- archiving scan results as portable files
- meeting the project's data and reporting requirements

### Files involved

New files:

- `frontend/src/components/reports/export-utils.ts`

Modified files:

- `frontend/src/components/reports/ExportBar.tsx`
- `frontend/src/app/(dashboard)/reports/page.tsx`
- `frontend/src/app/globals.css`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

### CSV format

The exported CSV contains the following sections in order:

1. Report metadata (URL, date, scan mode, pages scanned, WCAG level, score, status, duration)
2. Severity breakdown (Critical, Serious, Moderate, Minor with counts and percentages)
3. WCAG principles (Perceivable, Operable, Understandable, Robust with issue counts)
4. Pages crawled (URL, status, total issues, and severity counts per page)
5. Detailed issues (page URL, issue description, severity, WCAG criteria, affected element)
6. Issues by category (category name with severity breakdown)
7. AI repair suggestions (issue title, severity, WCAG criteria, pages affected, confidence, file, line)

### Verification

- ran `npx tsc --noEmit` in `frontend/` with zero errors
- visually verified the Reports page in the browser at `http://localhost:3000/reports`
- clicked the CSV button and confirmed the toast notification appeared
- confirmed the CSV file was generated with the correct filename format and valid content

### Outcome

All three export buttons on the Reports page are now functional. CSV generates a downloadable file, Print opens the browser print dialog, and PDF opens the same dialog with a descriptive title for "Save as PDF" output.

### Next step

Connect the Reports page to real saved scan data from the backend instead of static demo data. Implement actual preference persistence. Consider implementing the scan history compare mode.

## 2026-04-24 - Scan History Compare Mode

### Completed work

Implemented the full comparison view logic for the Scan History page:

- created `ScanHistoryCompareView.tsx`, a dedicated UI component to display the delta between two selected scan runs
- added `isComparing` state to `ScanHistoryPage` to swap out the history list for the comparison view when the "Compare" button is clicked
- configured the compare view to fetch the complete issue list for both selected scans using `fetchSavedScan`
- implemented delta calculations to determine "Resolved", "New", and "Persistent" issues by comparing `rule_id` and `element` combinations across the two runs
- implemented differential metrics cards showing changes in Overall Score, Total Issues, and High Severity issues
- verified UI states for loading and error conditions (e.g. if one of the scans fails to load)
- updated `cancelCompare` to correctly reset all comparison state
- updated the `feature-checklist.md` to mark historical comparison views as complete

### Why this was done

The Scan History page already allowed users to select exactly 2 scans via the `compareMode` toggle, but clicking the final "Compare" button did nothing. A core feature of an accessibility monitoring tool is tracking progress over time. The compare mode provides a quick way to see if issues were successfully resolved or if new regressions were introduced between two specific runs.

### Files involved

New files:

- `frontend/src/components/scan-history/ScanHistoryCompareView.tsx`

Modified files:

- `frontend/src/app/(dashboard)/scan-history/page.tsx`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

### Verification

- ran `npx tsc --noEmit` in `frontend/` with zero errors
- the UI cleanly transitions between the list and comparison view

### Next step

Decide whether to connect the Reports page to real backend data, implement actual LLM integration for AI repair suggestions, or build out multi-page/sitemap scanning options for the dashboard.

## 2026-04-25 - Backend-Encrypted Preferences

### Completed work

Transitioned the Preferences page from a static, non-functional UI into a fully integrated feature by implementing backend-side storage and management:

- created the AppPreferences SQLAlchemy model to store all user settings, including encryption-related fields
- added an Alembic migration (`9848b576f060_create_preferences_table.py`) to create the `app_preferences` table
- implemented a symmetric encryption utility (`backend/app/utils/encryption.py`) using cryptography's Fernet for secure API key handling
- added GET /preferences and PUT /preferences endpoints in main.py, ensuring API keys are never returned in plaintext to the frontend
- created PreferencesContext.tsx to centralize settings management
- integrated PreferencesProvider into the main application layout (layout.tsx)
- updated `frontend/src/app/(dashboard)/preferences/page.tsx` to initialize a local draft state from the PreferencesContext
- converted all preference section components (AiProviderSection, CrawlDefaultsSection, WcagStandardSection, NotificationsSection, AppearanceSection) to use controlled inputs linked to the draft state
- wired the "Save" and "Discard" actions in the SaveBar to the context's updatePreferences function

### Why this was done

The Preferences page was a placeholder UI. For the application to support customizable behaviors like AI provider selection, crawl limits, and custom appearance themes, it required a functional persistence layer. A secure Backend-Encrypted approach was selected to ensure that sensitive API keys supplied by users are securely stored and never leaked back in plaintext to the frontend.

### Files involved

New files:
- `backend/alembic/versions/9848b576f060_create_preferences_table.py`
- `backend/app/models/preferences.py`
- `backend/app/utils/encryption.py`
- `frontend/src/lib/contexts/PreferencesContext.tsx`

Modified files:
- `backend/app/main.py`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/(dashboard)/preferences/page.tsx`
- `frontend/src/components/preferences/AiProviderSection.tsx`
- `frontend/src/components/preferences/CrawlDefaultsSection.tsx`
- `frontend/src/components/preferences/WcagStandardSection.tsx`
- `frontend/src/components/preferences/NotificationsSection.tsx`
- `frontend/src/components/preferences/AppearanceSection.tsx`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

### Verification

- Backend migrations ran successfully and the database table was created.
- Endpoints successfully get and put preferences.
- Frontend components correctly load and save draft preferences without throwing TypeScript errors.
- API keys are submitted securely, encrypted at rest, and returned to the frontend simply as a boolean flag has_api_key.

### Next step

Ensure that other components in the application (like the Scan engine or the AI repair generation) now use the active preferences fetched from the database, or implement the next missing feature.

## 2026-04-25 - Stabilization And Real Data Integration

### Completed work

Implemented the next-phase stabilization and integration tasks:

- connected `/reports` to persisted scan data using `scanId` query parameter with fallback to latest saved scan
- replaced static report rendering with mapped saved-scan data for metadata, severity breakdown, WCAG principles, pages, and categories
- updated report export utilities (CSV/PDF/Print) to export live mapped report data instead of hardcoded mock data
- added report navigation links from dashboard, issues, and scan-history views
- improved scan-history compare identity matching from `rule_id + element` to a richer key including locator context (`dom_path`/`source_hint`) and `text_preview`
- hardened score display logic in compare and reports when score is missing
- added backend danger-zone APIs:
  - `DELETE /scans` to clear saved scan history
  - `POST /preferences/reset` to reset app preferences
- removed brittle masked API-key sentinel behavior and switched to explicit preference update semantics with `clear_api_key`
- wired Preferences danger-zone UI to real backend actions
- added minimal automated quality gates:
  - backend pytest smoke tests (`backend/tests/test_api_smoke.py`)
  - GitHub Actions workflow for frontend typecheck + backend compile/smoke tests
- synchronized feature/docs status in README, architecture, checklist, and implementation log

### Why this was done

The project had strong scanning and persistence foundations but still had key gaps between implemented capabilities and user-facing behavior/documentation:

- reports were still driven by static mock data
- danger-zone actions were UI-only
- compare matching could misclassify changed issues
- documentation overstated/understated several features
- there was no baseline CI quality gate

This update closes those gaps and creates a clearer path for multi-page crawl, LLM suggestions, and deeper test coverage.

### Files involved

Key backend updates:

- `backend/app/main.py`
- `backend/app/repositories/scan_repository.py`
- `backend/app/repositories/preferences_repository.py`
- `backend/app/schemas/preferences.py`
- `backend/tests/test_api_smoke.py`

Key frontend updates:

- `frontend/src/lib/saved-scans.ts`
- `frontend/src/app/(dashboard)/reports/page.tsx`
- `frontend/src/components/reports/*`
- `frontend/src/components/home/OverviewPanels.tsx`
- `frontend/src/app/(dashboard)/issues/page.tsx`
- `frontend/src/app/(dashboard)/scan-history/page.tsx`
- `frontend/src/components/scan-history/ScanHistoryRow.tsx`
- `frontend/src/components/scan-history/ScanHistoryList.tsx`
- `frontend/src/components/scan-history/ScanHistoryCompareView.tsx`
- `frontend/src/lib/contexts/PreferencesContext.tsx`
- `frontend/src/components/preferences/AiProviderSection.tsx`
- `frontend/src/components/preferences/DangerZoneSection.tsx`
- `frontend/src/app/page.tsx`

CI and docs:

- `.github/workflows/quality-gate.yml`
- `README.md`
- `docs/architecture/system-architecture.md`
- `docs/tracking/feature-checklist.md`
- `docs/tracking/implementation-log.md`

### Verification

- frontend typecheck command runs successfully (`npx tsc --noEmit`)
- backend compile check succeeds (`python -m compileall app`)
- backend smoke tests added for `/health`, `/scans` delete action, and `/preferences/reset`
- report page now fetches persisted scan detail and renders mapped sections from live data

### Next step

Implement multi-page crawling and queued scan execution so scan mode and crawl defaults can drive actual crawl behavior, then add a fuller backend/frontend automated test suite.
