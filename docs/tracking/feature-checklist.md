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
- [x] Repair suggestion group endpoint `GET /scans/{scan_id}/repair-suggestion-groups`
- [x] Repair suggestion generation endpoint `POST /scans/{scan_id}/repair-suggestion-groups/{group_key}/generate`
- [x] Repair suggestion patch-bundle export endpoint `GET /scans/{scan_id}/repair-suggestion-bundle`
- [x] Scan cancel endpoint `POST /scans/{scan_id}/cancel`
- [x] User sign-up endpoint `POST /auth/signup`
- [x] User login endpoint `POST /auth/login`
- [x] Google profile exchange endpoint `POST /auth/google`
- [x] Forgot-password endpoint `POST /auth/forgot-password`
- [x] Reset-password endpoint `POST /auth/reset-password`
- [x] Current-user endpoint `GET /auth/me`
- [x] Logout endpoint `POST /auth/logout`
- [x] Password hashing for stored user records
- [x] Persisted user session tokens
- [x] Single-use password reset tokens with older-link invalidation
- [x] Authenticated-user ownership for scan records
- [x] Authenticated-user ownership for preferences
- [x] Saved preferences applied as scan defaults for single, background, and worker paths
- [x] WCAG standard and best-practice preferences drive axe-core tag selection (default `wcag21aa`)
- [x] Notification preference fields persisted (`notify_score_threshold_enabled`, `notify_score_threshold`, `notify_severities`)
- [x] `cancelled` terminal scan status with persisted `cancel_requested_at`
- [x] Worker honours cancel requests between pages and never retries a cancelled scan
- [x] Cancelled status accepted by saved-scan history filters
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
- [x] SQLAlchemy model for persisted AI repair suggestions
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
- [x] Dedicated scan-worker service for queued single-page and multi-page scans
- [x] Worker retry policy and stale-job recovery
- [x] Persist current page, queued page URLs, and user-excluded queue URLs for running scans
- [x] Shared Chromium browser session reused across all pages in a scan job
- [x] Screenshot capture deduplicated per element selector with concurrent Cloudinary uploads
- [x] Incremental per-page issue persistence while multi-page scans run
- [x] Worker replica scaling via Compose (`SCAN_WORKER_REPLICAS`, safe row-locked job claiming)
- [x] Fast worker job pickup (0.5s default poll interval)
- [x] Automated backend pytest suite for core API, scanner, repository, worker, auth, preference resolution, bundle export, cancel, performance-path, and observability paths (201 tests across 14 files)
- [x] Minimal backend API smoke tests

## Frontend

- [x] Unified visual system across marketing, account and workspace routes
- [x] Responsive public home/about and shared account layout, including `/signup`
- [x] Mobile workspace navigation with Escape, focus containment and focus return
- [x] Mobile issue inspector with full detail content and focus restoration
- [x] Keyboard-accessible history links, comparison checkboxes and report actions
- [x] Explicit preference field labels and selected-state announcements
- [x] Global operating-system reduced-motion support and visible keyboard focus
- [x] Browser regression coverage for all routes at mobile, tablet and desktop widths

- [x] Next.js frontend scaffold
- [x] `src/`-based frontend source structure
- [x] Shared root layout in `src/app/layout.tsx`
- [x] Public marketing landing page at `/`
- [x] Public marketing About page at `/about`
- [x] Home dashboard scan page at `/dashboard`
- [x] Login page
- [x] Sign-up page
- [x] Forgot-password page
- [x] Reset-password page
- [x] Auth.js credentials session integration for login and sign-up
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
- [x] Frontend sends Auth.js session-backed bearer tokens for scan, history, report, issue, queue, and preference API calls
- [x] Multi-page scan UI
- [x] Dashboard polls queued/running background scans until completion
- [x] Dashboard streams partial per-page issues and live counts while a scan is still running
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
- [x] Reports group similar issues for AI repair suggestions
- [x] Reports can generate and display a saved AI repair suggestion per issue group
- [x] Reports "Export all patches" downloads the grouped repair bundle as a markdown file
- [x] Cancel scan control with inline confirmation for queued/running scans
- [x] Cancelled terminal state rendered in dashboard progress, notifications, and scan history
- [x] In-app terminal scan notifications (complete, failed, high severity, low score, cancelled)
- [x] Preferences notification threshold/severity settings wired to backend fields
- [x] Preferences expose current DeepSeek model choices for repair suggestions
- [x] Automated frontend Vitest suite for scan-state, queue, saved-scan, report, AI-suggestion, notification, cancel, export, lightweight polling, and accessible navigation/forms (55 tests)
- [x] Minimal frontend smoke check via TypeScript gate

## AI / Intelligent Analysis

- [x] Automated standards-based accessibility analysis using axe-core
- [x] Automated issue deduplication between custom checks and axe-core findings
- [x] Automated repair guidance text from custom rules and axe-core help output
- [x] Automated WCAG criteria tagging for issues
- [x] Automated locator guidance using source hints, DOM paths, and text previews
- [x] Actionable locator guidance by issue type for links, images, DOM paths, source snippets, and affected pages
- [x] Automated contextual screenshot capture and persistence for issue review
- [x] Grouped generative AI / LLM-based repair suggestions
- [x] DeepSeek API support for grouped AI repair suggestions
- [x] Export all grouped AI repair suggestions as one markdown or JSON patch bundle
- [ ] Automatic code repair suggestions per issue
- [ ] Conversational remediation assistant

## Data And Reporting

- [x] Database schema and migrations
- [x] Stored user records
- [x] Stored user session records
- [x] Stored password reset tokens
- [x] Stored scan sessions
- [x] Stored scan sessions scoped to the authenticated user
- [x] Stored preferences scoped to the authenticated user
- [x] Stored AI repair suggestions scoped to the authenticated user
- [x] Stored notification preferences (score threshold and severity selection)
- [x] Stored cancel-request state (`cancel_requested_at`) and cancelled terminal status
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
- [x] Frontend typecheck/test and backend compile/test quality gate automation
- [x] Frontend component/unit test gate in CI
- [x] Frontend production build gate in CI
- [x] Browser end-to-end test suite (Playwright, 8 tests across 5 spec files)
- [ ] Automated coverage reporting and thresholds

## Performance & Observability

- [x] Reproducible scanner and database benchmark harness (`scripts/perf/bench_scan.py`, `scripts/perf/bench_db.py`)
- [x] Measured baseline and post-optimization evidence (`docs/architecture/performance-baseline.md`, `performance-results.md`, `scan-performance-analysis.md`)
- [x] Worker-level Chromium reuse across queued scan jobs (`SCAN_BROWSER_REUSE_ENABLED`, recycle after `SCAN_BROWSER_MAX_JOBS`)
- [x] Browser crash/disconnect recovery plus one-time per-worker session teardown
- [x] Configurable render waits (`SCAN_RENDER_IDLE_TIMEOUT_MS`, `SCAN_RENDER_SETTLE_MS`)
- [x] Screenshot capture cap per page (`SCAN_MAX_SCREENSHOTS`)
- [x] Vendored, pinned axe-core asset with worker-startup warm cache (`AXE_SCRIPT_PATH`, CDN fallback only)
- [x] Per-scan phase timings on scan responses and structured `scan_timing` worker log lines
- [x] Multi-page scan time budget (`SCAN_MAX_SECONDS`)
- [x] SSRF hardening: scheme/credential/length validation, optional private-target blocking, post-redirect final-URL revalidation (`SCAN_ALLOW_PRIVATE_TARGETS`)
- [x] Raw-HTML fallback now runs axe-core correctly (latent swallowed-error defect fixed)
- [x] Database performance indexes via migration `9848b576f075`
- [x] Crawl-memory lookup rewritten to a single column-only query (no issue eager-loading)
- [x] Incremental/append-only progress persistence for streamed issues, with retry-clean partial rows and an authoritative final replace
- [x] Saved-scan history N+1 query removal (batched page-URL query; constant statement count)
- [x] Lightweight status polling (`GET /scans/{scan_id}?include_issues=false`) with on-demand full-detail fetch
- [x] Configurable PostgreSQL connection pool (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT`, `DB_POOL_RECYCLE`, `DB_POOL_PRE_PING`)
- [x] In-process token-bucket rate limiting for scans and auth (`RATE_LIMIT_*`, HTTP 429 + `Retry-After`)
- [x] Prometheus-style `GET /metrics` endpoint and slow-scan logging (`METRICS_ENABLED`, `SCAN_SLOW_LOG_SECONDS`)
- [x] Functional-equivalence verification for the optimized scanner (only the documented screenshot-cap and fallback-fix output changes)

## Current Gaps Worth Addressing Next

- [x] Connect the home dashboard scan result to the saved-scan issues view
- [x] Add real comparison logic for the scan history compare mode
- [x] Decide how reports should be generated from persisted scan records
- [x] Add at least a minimal automated smoke test path for backend and frontend
- [x] Add queue/background processing for multi-page scans
- [x] Move background scans to a dedicated external worker queue
- [x] Add worker retry policy and stale-job recovery
- [x] Add user-controlled queued-page removal and prioritization during running multi-page scans
- [x] Add full JavaScript page rendering for SPA-heavy sites before analysis
- [x] Scope saved scans and preferences by authenticated user
- [x] Generate one AI repair suggestion for grouped similar issues
- [x] Export all grouped AI repair suggestions as a single patch bundle
- [x] Apply saved preferences (mode, crawl limits, WCAG standard, best practices) to scan execution
- [x] Persist notification preferences and deliver in-app terminal scan notifications
- [x] Allow users to cancel a queued or running scan
- [x] Add a browser end-to-end test suite and gate the frontend production build in CI
- [x] Reduce scan latency without changing detection results (worker browser reuse, render waits, screenshot cap, vendored axe-core)
- [x] Remove crawl-memory/history DB query amplification and progress write amplification
- [x] Make dashboard scanning poll a lightweight status payload instead of full issue lists
- [x] Add performance indexes, connection pooling, rate limiting, and metrics/slow-scan observability
