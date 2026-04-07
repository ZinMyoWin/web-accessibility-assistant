# Feature Checklist

Use this file as the current source of truth for what is implemented, partially implemented, and not implemented yet.

Update this checklist whenever a feature is added, removed, or materially changes status.

## Backend

- [x] FastAPI application entry point
- [x] Root endpoint `GET /`
- [x] Health endpoint `GET /health`
- [x] Local deterministic test page `GET /test/page-bad`
- [x] Single-page scan endpoint `POST /scan/page`
- [x] Public URL validation
- [x] Raw HTML fetch for submitted pages
- [x] Custom HTML-based accessibility checks
- [x] Structured scan response schema
- [x] Severity summary generation
- [x] Source location hints for custom issues
- [x] DOM path hints for custom issues
- [x] Screenshot capture with Playwright
- [x] axe-core integration
- [x] Deduplication of custom and axe-core findings
- [x] WCAG criteria tagging in results
- [x] CORS configuration for local and hosted frontends
- [ ] Full JavaScript page rendering for real SPA content before analysis
- [ ] Multi-page site crawling
- [ ] Persistence layer for scans and issues
- [ ] Background jobs / queued scan processing
- [ ] Automated backend test suite

## Frontend

- [x] Next.js frontend scaffold
- [x] `src/`-based frontend source structure
- [x] Shared root layout in `src/app/layout.tsx`
- [x] Home dashboard scan page
- [x] Shared dashboard shell with sidebar and mobile toggle
- [x] URL input and scan submission flow
- [x] Test-page shortcut button
- [x] Scan progress panel with stage messaging
- [x] Summary metric cards
- [x] Severity breakdown panel
- [x] Scan details panel
- [x] Expandable issue rows on the home dashboard
- [x] Screenshot display per issue when available
- [x] WCAG criteria tags in issue details
- [x] shadcn/ui select component integration
- [x] Dedicated issues view with filters and detail panel
- [x] Home dashboard split into smaller reusable components and a scan hook
- [ ] Real data flow from home dashboard to issues page
- [ ] Working `/history` page
- [ ] Working `/reports` page
- [ ] Working `/preferences` page
- [ ] Real scan history in the UI
- [ ] Report export from the frontend
- [ ] Multi-page scan UI
- [ ] Automated frontend tests

## AI / Intelligent Analysis

- [x] Automated standards-based accessibility analysis using axe-core
- [x] Automated issue deduplication between custom checks and axe-core findings
- [x] Automated repair guidance text from custom rules and axe-core help output
- [x] Automated WCAG criteria tagging for issues
- [x] Automated locator guidance using source hints, DOM paths, and text previews
- [x] Automated contextual screenshot capture for issue review
- [ ] Generative AI / LLM-based fix generation
- [ ] Automatic code repair suggestions per issue
- [ ] Conversational remediation assistant
## Data And Reporting

- [ ] Database schema and migrations
- [ ] Stored scan sessions
- [ ] Stored page-level issue records
- [ ] Historical comparison views
- [ ] CSV export
- [ ] PDF export

## DevOps And Project Support

- [x] Production-style Docker setup
- [x] Development Docker setup with hot reload
- [x] README setup documentation
- [x] System architecture document
- [x] Implementation log
- [ ] Formal deployment verification evidence for hosted frontend and backend
- [ ] CI pipeline
- [ ] Lint/test/build quality gate automation

## Current Gaps Worth Addressing Next

- [ ] Replace sidebar placeholder links with real routes or remove them until implemented
- [ ] Connect the issues page to actual scan results instead of mock data
- [ ] Decide whether scan history requires database persistence now or after multi-page crawl
- [ ] Add at least a minimal automated smoke test path for backend and frontend

