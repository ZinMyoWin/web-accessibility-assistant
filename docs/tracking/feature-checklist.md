# Feature Checklist

Use this file as the current source of truth for what is implemented, partially implemented, and not implemented yet.

Update this checklist whenever a feature is added, removed, or materially changes status.

## Backend

- [x] FastAPI application entry point
- [x] Root endpoint `GET /`
- [x] Health endpoint `GET /health`
- [x] Local deterministic test page `GET /test/page-bad`
- [x] Single-page scan endpoint `POST /scan/page`
- [x] Saved scan list endpoint `GET /scans`
- [x] Saved scan detail endpoint `GET /scans/{scan_id}`
- [x] Preferences endpoints `GET /preferences` and `PUT /preferences`
- [x] Clear scan history endpoint `DELETE /scans`
- [x] Reset preferences endpoint `POST /preferences/reset`
- [x] User sign-up endpoint `POST /auth/signup`
- [x] User login endpoint `POST /auth/login`
- [x] Current-user endpoint `GET /auth/me`
- [x] Logout endpoint `POST /auth/logout`
- [x] Password hashing for stored user records
- [x] Persisted user session tokens
- [x] Public URL validation
- [x] Raw HTML fetch for submitted pages
- [x] Custom HTML-based accessibility checks
- [x] Structured scan response schema
- [x] Severity summary generation
- [x] Source location hints for custom issues
- [x] DOM path hints for custom issues
- [x] Precise repeated-element DOM path hints with `:nth-of-type()` for new custom scans
- [x] Screenshot capture with Playwright
- [x] axe-core integration
- [x] Deduplication of custom and axe-core findings
- [x] WCAG criteria tagging in results
- [x] CORS configuration for local and hosted frontends
- [x] Database connection layer with SQLAlchemy sessions
- [x] SQLAlchemy models for scan runs and scan issues
- [x] Alembic migration setup for database schema changes
- [x] Persist successful scan results to PostgreSQL
- [x] Persist failed scan attempts to PostgreSQL
- [x] Full JavaScript page rendering for real SPA content before analysis
- [x] Background multi-page site crawling
- [x] Multi-page page limit capped at 5 pages in the dashboard flow
- [x] Crawl memory can skip previously scanned internal pages on repeat domain scans
- [x] Persist skipped-page counts for scan runs
- [x] Persist scanned and skipped page URL lists for scan runs
- [x] Full axe-core analysis for background multi-page scans
- [x] In-process background jobs for bounded multi-page scans
- [x] Dedicated scan-worker service for queued multi-page scans
- [x] Worker retry policy and stale-job recovery
- [x] Persist current page, queued page URLs, and user-excluded queue URLs for running scans
- [x] Full automated backend test suite
- [x] Minimal backend API smoke tests

## Frontend

- [x] Next.js frontend scaffold
- [x] `src/`-based frontend source structure
- [x] Shared root layout in `src/app/layout.tsx`
- [x] Home dashboard scan page
- [x] Login page
- [x] Sign-up page
- [x] Dashboard route guard for anonymous users
- [x] Sidebar user identity and logout control
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
- [x] shadcn/ui Switch, Tabs, and Dialog component integration
- [x] Dedicated issues view with filters and detail panel
- [x] Home dashboard split into smaller reusable components and a scan hook
- [x] Scan history page route and UI scaffold
- [x] Real scan history in the UI
- [x] Saved scan detail flow in the UI
- [x] Real data flow from home dashboard to issues page
- [x] Working `/reports` page
- [x] Working `/preferences` page
- [x] Report export from the frontend (Print, CSV, PDF)
- [x] Reports backed by persisted scan records
- [x] Report route accepts `scanId` query parameter
- [x] Preferences applied to dashboard scan defaults
- [x] Danger-zone actions wired to backend APIs
- [x] Multi-page scan UI
- [x] Dashboard polls queued/running background multi-page scans until completion
- [x] Dashboard shows the running scan queue, current page, removed pages, and retry attempt count
- [x] Dashboard can remove or prioritize queued pages before the worker scans them
- [x] Report issue cards show "Where to find it" locator guidance
- [x] Issues detail panel shows affected-page locator guidance
- [x] Dashboard issue rows show affected-page locator guidance
- [x] Preferences toggle for skipping already scanned pages on the same domain
- [x] Dashboard, reports, and scan history show skipped-page counts
- [x] Reports provide selectable page-level issue views
- [x] Issues page provides scanned-page filtering and page-specific issue lists
- [x] Dashboard scan details show scanned and skipped page coverage
- [ ] Full automated frontend test suite
- [x] Minimal frontend smoke check via TypeScript gate

## AI / Intelligent Analysis

- [x] Automated standards-based accessibility analysis using axe-core
- [x] Automated issue deduplication between custom checks and axe-core findings
- [x] Automated repair guidance text from custom rules and axe-core help output
- [x] Automated WCAG criteria tagging for issues
- [x] Automated locator guidance using source hints, DOM paths, and text previews
- [x] Actionable locator guidance by issue type for links, images, DOM paths, source snippets, and affected pages
- [x] Automated contextual screenshot capture for issue review
- [ ] Generative AI / LLM-based fix generation
- [ ] Automatic code repair suggestions per issue
- [ ] Conversational remediation assistant

## Data And Reporting

- [x] Database schema and migrations
- [x] Stored user records
- [x] Stored user session records
- [x] Stored scan sessions
- [x] Stored page-level issue records
- [x] Historical comparison views
- [x] Compare identity uses rule plus locator context
- [x] CSV export
- [x] PDF export (via browser print-to-PDF)
- [x] Score display hidden when score is unavailable
- [x] Saved reports display derived/persisted accessibility scores
- [x] Page rows use "Issues found" status wording instead of misleading "Fail" labels
- [x] Reports include skipped-page metadata for crawl-memory scans
- [x] Reports distinguish scanned pages from skipped pages

## DevOps And Project Support

- [x] Production-style Docker setup
- [x] Development Docker setup with hot reload
- [x] README setup documentation
- [x] System architecture document
- [x] Implementation log
- [ ] Formal deployment verification evidence for hosted frontend and backend
- [x] CI pipeline
- [x] Lint/test/build quality gate automation

## Current Gaps Worth Addressing Next

- [x] Connect the home dashboard scan result to the saved-scan issues view
- [x] Add real comparison logic for the scan history compare mode
- [x] Decide how reports should be generated from persisted scan records
- [x] Add at least a minimal automated smoke test path for backend and frontend
- [x] Add queue/background processing for multi-page scans
- [x] Move background multi-page scans to a dedicated external worker queue
- [x] Add worker retry policy and stale-job recovery
- [x] Add user-controlled queued-page removal and prioritization during running multi-page scans
- [x] Add full JavaScript page rendering for SPA-heavy sites before analysis
