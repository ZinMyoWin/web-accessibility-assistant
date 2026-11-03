# System Architecture

## 1. Project Purpose

The **Web Accessibility Audit and Repair Assistant** is a web-based system that scans webpages, detects accessibility issues, and returns developer-friendly repair guidance.

The current system is designed to do these main jobs:

1. Accept a URL from the user.
2. Scan one page directly in local background mode, or queue single-page and bounded multi-page scans when worker mode is enabled, applying the user's saved scan preferences (mode, page limits, crawl depth, delays, URL filters, WCAG standard, best practices) as defaults with per-request overrides.
3. Save the scan result in PostgreSQL for later use.
4. Let the frontend show summaries, issues, scan history, and persisted reports.
5. Give users actionable locator guidance so they can find the affected element on the original webpage.
6. Let users create accounts, log in, and store session records.
7. Keep saved scan history and preferences scoped to the authenticated user.
8. Group similar accessibility issues, generate one persisted AI repair suggestion per issue pattern, and export every suggestion for a scan as one downloadable patch bundle.
9. Let users cancel a queued or running scan while keeping the partial results already found.
10. Keep scanning and API reads fast and observable through a benchmarked scan engine, indexed queries, lightweight polling, metrics and rate limiting.
11. Prepare the project for later work such as larger full-site scan orchestration and broader AI remediation workflows.

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
  |       +--> Worker-level browser reuse + vendored axe-core asset
  |
  +--> Accessibility Analysis
  |       |
  |       +--> Custom HTML-based checks
  |       +--> axe-core standards-based checks
  |       +--> Issue merge and deduplication
  |       +--> Per-scan phase timings and scan time budget
  |
  +--> Observability / Protection
  |       |
  |       +--> Prometheus-style `GET /metrics`
  |       +--> In-process rate limiting (scan and auth scopes)
  |       +--> Structured slow-scan and `scan_timing` logs
  |
  +--> AI Repair Suggestions
  |       |
  |       +--> Similar issue grouping
  |       +--> OpenAI or DeepSeek API call using the user's stored provider key
  |       +--> Persisted suggestion per user, scan, and group
  |       +--> Patch bundle export as markdown or JSON
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
          +--> Scan cancellation (`POST /scans/{scan_id}/cancel`)
          +--> Repair bundle export (`GET /scans/{scan_id}/repair-suggestion-bundle`)
```

## 3. Main Project Folders

### `frontend/`

Contains the web interface.

Current frontend responsibilities:

- show a public AccessAudit landing page before authentication
- create an account and log in
- enter a URL
- start a scan
- view scan summaries
- inspect issue details
- open the dashboard issues page
- open the scan history page UI
- open persisted reports with per-page issue grouping
- generate grouped AI repair suggestions from the report view
- export all grouped AI repair suggestions for a scan as one markdown patch bundle
- cancel a queued or running scan from the dashboard toolbar with inline confirmation
- evaluate saved notification preferences and show in-app terminal scan notifications (complete, failed, high severity, low score, cancelled)
- render the `cancelled` terminal status distinctly in the dashboard, notifications, and scan history
- poll `GET /scans/{scan_id}?include_issues=false` for cheap status/queue updates and fetch full issue details only when the summary changes or the scan reaches a terminal state
- show issue locator guidance using affected page URLs, DOM paths, line/column data, source snippets, and text previews
- send the logged-in user's bearer token for scan, history, report, queue-control, cancel, bundle-export, and preferences API calls

Current technologies:

- **Next.js 15**
- **Tailwind CSS v4**
- **shadcn/ui**

Current status:

- frontend source is organized under `frontend/src/`
- `/` renders the unauthenticated public marketing landing page
- `/dashboard` renders the authenticated home dashboard scan flow
- public login and register pages share the `(auth)` route group layout (`/login`, `/register`, `/forgot-password`, `/reset-password`)
- login/register submit through Auth.js credentials with client validation, loading/disabled states, inline errors, "remember me" session lifetime, and terms gating on register
- Google sign-in is scaffolded end to end (Auth.js GoogleProvider, env-gated) and exchanges the verified profile for a backend token via `POST /auth/google`; requires `GOOGLE_CLIENT_ID/SECRET` and a shared `OAUTH_PROXY_SECRET`
- password reset is scaffolded (`/auth/forgot-password` issues a single-use token and invalidates older unused tokens, `/auth/reset-password` updates the password and invalidates remaining unused tokens); email delivery is not yet wired, and reset-link logging is disabled unless `PASSWORD_RESET_LOG_LINKS=true` is set for local development
- dashboard routes are guarded by Auth.js middleware and the client dashboard shell for anonymous users
- Auth.js manages the frontend session and stores the backend bearer token in its JWT session for API calls
- home dashboard scan flow is implemented
- issues page loads real saved scan details from the backend
- scan history page loads real saved scan summaries from the backend
- shared dashboard shell with sidebar is implemented
- reports page loads persisted scan data using `scanId`
- preferences page persists settings through backend APIs
- scan history, reports, issues, and preferences now read and write account-scoped data
- multi-page scan mode is enabled as a queued scan-worker job with a 5-page dashboard cap
- queued multi-page scans expose current page, queued page URLs, removed page URLs, retry attempts, and stale-worker recovery state
- users can remove queued pages or prioritize a queued page before it is scanned
- multi-page scans can skip previously scanned internal pages when the user enables crawl memory in Preferences
- reports show a computed accessibility score when persisted score data exists or can be derived from issue totals
- reports group similar issues for AI repair suggestions and show the saved suggestion after generation
- reports can export every grouped suggestion of a scan as one downloadable markdown patch bundle
- the dashboard can cancel a queued/running scan; cancellation stops polling, keeps partial results, disables queue controls, and marks the run `cancelled`
- terminal dashboard scans produce in-app notifications driven by the persisted notification preferences
- scan history renders cancelled rows and exposes a "Cancelled" status filter
- dashboard scan requests no longer need to re-send crawl defaults: the backend resolves omitted fields from saved preferences
- dashboard polling is lightweight: status/queue/summary come from `GET /scans/{id}?include_issues=false`, and the full issue payload is fetched only when the issue count changes or the scan reaches a terminal status
- the dashboard renders the worker's streamed partial issues and live "N issues found so far" counts without paying an O(issues) request every two seconds

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
- issue and validate password reset tokens while preventing older unused reset links from remaining valid
- require bearer-token authentication for scan creation, saved scans, queue controls, scan-history clearing, and preferences
- continue to own persisted user/session records while the Next.js frontend uses Auth.js credentials sessions as the browser-facing auth layer
- create queued scan jobs for bounded multi-page dashboard scans
- track queue state, current page, removed pages, worker lock/heartbeat metadata, and retry attempts for running multi-page scans
- persist score, mode, pages scanned, pages skipped, scanned/skipped page URL lists, issue page URLs, and element locator metadata
- persist scan runs, preferences, and AI repair suggestions with the authenticated user's ID
- generate one AI repair suggestion for a group of similar issues, then reuse the saved suggestion unless regeneration is requested later
- export all grouped repair suggestions of a scan as one markdown or JSON patch bundle
- resolve scan execution options from saved preferences, with explicit request values taking precedence, and persist the resolved options for queued worker jobs
- translate the saved WCAG standard and best-practice preference into axe-core `runOnly` tags
- accept and persist notification preferences (score-threshold switch/value, severity selection) without sending email
- cancel queued scans immediately and request that running scans stop between pages, without retrying cancelled jobs or overwriting completed results
- reuse one Chromium browser across queued scan jobs (worker-level `BrowserSession`), recover from crashes, and recycle it after a configurable number of jobs
- bound scan cost with configurable render waits, screenshot caps and a multi-page time budget, and emit per-scan phase timings
- serve a vendored axe-core asset with a worker-startup warm cache instead of fetching it from a CDN at scan time
- enforce in-process rate limits on scan creation and auth endpoints
- expose Prometheus-style process metrics and log slow scans
- validate scan targets against SSRF rules (scheme/credentials/length and optional private-network blocking, re-applied to post-redirect URLs)

Current technologies:

- **FastAPI**
- **SQLAlchemy**
- **Alembic**
- **PostgreSQL**
- **Playwright**

### `docs/`

Contains setup guides, architecture notes, implementation guides, and project tracking files.

### `backend/tests/`

Contains 201 backend tests across 14 files: API smoke tests plus unit tests for scanner, repository, worker, auth, preferences, preference resolution, bundle export, cancel behaviour, scanner performance knobs, and the API-level performance/observability paths.

Current coverage includes:

- health and deterministic test routes
- scan, queue-control, bundle-export, cancel, and metrics API smoke paths
- scanner custom rules, crawl filtering, queue ordering, rendered fallback, between-page cancellation, browser-session injection, render-wait knobs, screenshot caps, time budget, and SSRF validation
- repository scoring, queue state updates, queued-page controls, stale worker recovery, user scoping, cancelled-scan transitions, crawl-memory query shape, incremental issue persistence, and history batching
- preference resolution (inherited defaults versus explicit overrides), notification-preference validation, WCAG-to-axe tag mapping, repair-bundle rendering, rate limiting, and lightweight `include_issues=false` reads

### Frontend tests

The frontend automated gate has three tiers:

- TypeScript typechecking (`npx tsc --noEmit`)
- Vitest + Testing Library unit/component tests: 42 tests across 11 files for scan state, lightweight polling, queue controls, saved-scan mapping, report pages/grouping, AI suggestion generation and export, in-app notifications, scan cancellation, and helper utilities (jsdom, no backend)
- Playwright browser E2E tests: 8 tests across 5 specs for the public landing/registration pages, login validation, the anonymous dashboard guard redirect, the authenticated dashboard scan flow with mocked API responses, and the scan-cancel flow (`frontend/e2e/`)

The E2E suite needs no backend or database: it stubs browser-to-backend calls with `page.route()` fixtures and mints a real signed NextAuth session cookie for authenticated specs. Both the production build and the E2E suite are gated in CI.

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
- enforce rate limits on scan creation and auth endpoints
- expose the Prometheus-style `/metrics` endpoint
- support lightweight saved-scan reads via `include_issues=false`

Current routes:

- `GET /`
- `GET /health`
- `GET /metrics`
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/google`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /test/page-bad`
- `GET /test/page-js-rendered`
- `POST /scan/page`
- `GET /scans`
- `GET /scans/{scan_id}`
- `POST /scans/{scan_id}/cancel`
- `GET /scans/{scan_id}/repair-suggestion-bundle`
- `POST /scans/{scan_id}/queue/remove`
- `POST /scans/{scan_id}/queue/prioritize`
- `DELETE /scans`
- `GET /preferences`
- `PUT /preferences`
- `POST /preferences/reset`
- `GET /scans/{scan_id}/repair-suggestion-groups`
- `POST /scans/{scan_id}/repair-suggestion-groups/{group_key}/generate`

### `backend/app/schemas/scan.py`

Defines live scan request and response models.

Important models:

- `ScanPageRequest`
- `ScanIssue`
- `ScanSummary`
- `ScanPageResponse`

Note:

- `ScanPageRequest` fields are all optional: omitted values inherit the user's saved preferences (see `scan_options_resolver.py`), and explicitly sent values override them.
- `ScanPageRequest` now also carries `wcag_standard` and `include_best_practices`, which are threaded to axe-core tag selection.
- `ScanPageResponse` now includes an optional `scan_id` so the frontend can later reference the saved scan record.

### `backend/app/schemas/history.py`

Defines the response models for saved scan history APIs.

Important models:

- `SavedScanListItem`
- `SavedScanListResponse`
- `SavedScanResponse`

Notes:

- scan status is `queued`, `running`, `complete`, `error`, or `cancelled`; the history list filter accepts `cancelled`
- saved-scan responses expose `cancel_requested_at` so the UI can distinguish an accepted cancellation request from a finished cancel

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

- single-page scans run the full rendered-page custom plus axe-core pipeline with screenshots when available; in worker mode they are queued for the scan-worker instead of running inside the web request
- one shared `BrowserSession` (Playwright Chromium instance) is launched lazily per scan job and reused for every page in that job; each page still gets a fresh browser context, and the browser relaunches automatically on the next page if it crashes
- `scan_page(url, options, queue_control=None, browser_session=None)` accepts a caller-owned session: the scan-worker passes one process-level Chromium to every job (reused, recreated on crash, recycled after `SCAN_BROWSER_MAX_JOBS` jobs, closed at shutdown), while callers that do not inject a session (direct local scans) keep the create-and-close lifecycle; `SCAN_BROWSER_REUSE_ENABLED=false` makes the worker fall back to that per-scan lifecycle too
- render waits are env-tunable (`SCAN_RENDER_IDLE_TIMEOUT_MS` default 1500 ms, `SCAN_RENDER_SETTLE_MS` default 100 ms) while still waiting on `load` + network-idle so late-rendered SPA content is captured
- issue screenshots are captured once per unique element selector (issues sharing a selector or the viewport fallback share one capture), capped at `SCAN_MAX_SCREENSHOTS` per page (default 10), and uploaded to Cloudinary concurrently in a thread pool after capture instead of blocking the browser loop
- a multi-page crawl is bounded by `SCAN_MAX_SECONDS` (default 240 s): the crawl loop fails cleanly with a time-budget error instead of running unbounded
- every scan records phase timings (`browser_setup`, `goto`, `render_wait`, `page_content`, `parse`, `custom_checks`, `axe`, `merge`, `screenshots`, `session_teardown`) which are attached to the response as an optional `timings` field and logged by the worker as one structured `scan_timing` JSON line
- the raw-HTML fallback now runs axe-core correctly (a swallowed `NameError` previously reduced fallback scans to custom-check-only results)
- multi-page scans are queued and executed by the scan-worker (bounded at 5 pages in the dashboard flow; larger orchestration remains future work); repeat scans can skip previously scanned internal pages via crawl memory
- as pages are discovered the worker publishes queue state (current page, queued/removed pages, cumulative issues so far); it retries failed jobs while attempts remain, recovers stale `running` jobs, and honours between-page cancellation
- a `should_cancel` callback (from the worker or in-process job) is checked between pages through `CrawlQueueControl`; when it returns true the scanner raises `ScanCancelled` so the run stops with its partial results preserved instead of being treated as a failure

### `backend/app/services/axe_scanner.py`

Contains the axe-core integration.

Responsibilities:

- load and cache axe-core JavaScript from the vendored `backend/app/assets/axe.min.js` asset (553,283 bytes, axe-core 4.10.2, SHA-256 recorded), falling back to the pinned CDN URL only when the local asset is missing/unreadable and `AXE_SCRIPT_PATH` is unset
- warm the axe script cache at worker startup (`warm_axe_cache()`) so the first user scan never pays the asset load
- run axe-core inside Playwright
- map violations into project issue format
- format WCAG criteria
- help merge custom and axe-core results
- translate a saved WCAG preference into axe-core `runOnly` tag values (`build_axe_tag_values`)

WCAG standard to axe tag mapping:

- base coverage is always WCAG 2.0 A/AA (`wcag2a`, `wcag2aa`)
- selecting 2.1 or 2.2 adds that version's A/AA tags (`wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa`)
- AAA selections add the matching AAA tags (and `wcag2aaa` for the 2.0 base)
- A-only selections omit all AA tags
- `best-practice` is included unless the saved `include_best_practices` preference is false
- the saved default is `wcag21aa` (migration `...f074`), which keeps the 2.1 rule coverage the scanner previously hardcoded

### `backend/app/services/scan_options_resolver.py`

Resolves scan execution options from saved preferences and request overrides.

Current responsibilities:

- treat every `POST /scan/page` field as optional and detect explicit values with Pydantic `model_fields_set`
- inherit `default_scan_mode`, page limit, crawl depth, delays, ignored URL patterns, same-domain/robots/crawl-memory switches, `wcag_standard`, and `include_best_practices` from `AppPreferences` when omitted
- let explicit request values win over saved preferences
- clamp multi-page dashboard scans to five pages and persist the resolved settings in `scan_options` so the worker reconstructs the same configuration

### `backend/app/services/repair_bundle_service.py`

Renders a downloadable bundle of every repair suggestion for a scan.

Current responsibilities:

- accept `format=markdown` (default) or `format=json`, rejecting anything else with a validation error the route maps to 400
- include scan URL/date/status/score plus every generated suggestion's full content, and list groups without a saved suggestion in a "Not yet generated" section
- return the export envelope `{scan_id, generated_at, filename, content_type, group_count, generated_count, missing_count, content}` with filename `accessaudit-repair-bundle-<scan8>.md|json`
- never include secrets such as provider API keys

### `backend/app/db.py`

Contains database setup.

Responsibilities:

- read `DATABASE_URL`
- create the SQLAlchemy engine with env-driven pool settings for PostgreSQL (`DB_POOL_SIZE` default 5, `DB_MAX_OVERFLOW` default 10, `DB_POOL_TIMEOUT` default 30 s, `DB_POOL_RECYCLE` default 1800 s, `DB_POOL_PRE_PING` default true); SQLite test URLs skip pool arguments
- create the session factory
- provide the FastAPI database dependency

### `backend/app/services/metrics.py`

Tiny process-local metrics registry, rendered by `GET /metrics` in Prometheus text exposition format (`text/plain; version=0.0.4`).

Current responsibilities:

- counters `scan_requests_total{status}`, `scan_issues_total{severity}`, `rate_limited_total{scope}`
- histogram `scan_duration_seconds` with fixed buckets
- gauges `scan_queue_depth` and `scan_worker_attempts_total` refreshed from the database at scrape time (queue depth uses the `ix_scan_runs_status_started_at` index)
- emit one structured slow-scan log line when a completed scan exceeds `SCAN_SLOW_LOG_SECONDS` (default 10 s)
- `METRICS_ENABLED=false` makes the endpoint return 404; all values are per-process

### `backend/app/services/rate_limit.py`

In-process token-bucket rate limiter for `POST /scan/page` (per authenticated user) and `/auth/signup`, `/auth/login`, `/auth/forgot-password` (per client IP).

Current responsibilities:

- env knobs `RATE_LIMIT_ENABLED` (default true), `RATE_LIMIT_SCAN_PER_MINUTE` (default 30), `RATE_LIMIT_AUTH_PER_MINUTE` (default 10)
- return HTTP 429 with a `Retry-After` header and a scope-specific detail message
- prune idle buckets; buckets are per process, so horizontally scaled deployments need a shared store (e.g. Redis) or ingress-level limits

### `backend/app/utils/url_utils.py`

Validates scan-target URLs and provides SSRF protection.

Current responsibilities:

- always reject non-`http(s)` schemes, URLs with embedded credentials, and URLs longer than 2048 characters
- when `SCAN_ALLOW_PRIVATE_TARGETS=false` (recommended in production), resolve the hostname and reject private, loopback, link-local, reserved, multicast and non-global IPv4/IPv6 addresses (including resolution failures); the default `true` keeps local demo/test targets working and logs a one-time warning
- the scanner re-runs validation on the post-navigation/post-fetch final URL so redirects cannot bypass the policy

### `backend/app/models/`

Contains SQLAlchemy ORM models.

Current models:

- `User`
- `UserSession`
- `PasswordResetToken`
- `ScanRun` (including `cancel_requested_at` for accepted cancellation requests)
- `ScanIssueRecord`
- `AppPreferences` (including `notify_score_threshold_enabled`, `notify_score_threshold`, `notify_severities`, and `wcag_standard` defaulting to `wcag21aa`)
- `RepairSuggestion`

### `backend/app/repositories/repair_suggestion_repository.py`

Contains grouping and persistence logic for AI repair suggestions.

Current responsibilities:

- group similar scan issues by rule, severity, message, recommendation, WCAG criteria, and detection source
- intentionally ignore page URL and DOM path when building the group key so repeated instances of the same issue share one suggestion
- load existing saved suggestions for the authenticated user, scan, and group
- persist generated suggestions with a unique `(user_id, scan_run_id, group_key)` key

### `backend/app/services/repair_suggestion_service.py`

Contains provider-backed generation calls for grouped repair guidance.

Current responsibilities:

- build a compact prompt from group metadata and representative examples
- request structured JSON from the OpenAI Responses API or JSON-mode chat completions from DeepSeek
- normalize provider/model combinations so DeepSeek suggestions use a DeepSeek model even when older preferences contain an OpenAI model
- validate the returned explanation, impact, recommended fix, optional before/after code, confidence, and limitations fields before persistence

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
- list saved scans for the current user
- load one saved scan with its issues only when it belongs to the current user
- convert ORM objects into API response models
- request and apply scan cancellation (`request_scan_cancel`, `is_scan_cancel_requested`, `mark_scan_cancelled`): a queued scan becomes `cancelled` immediately, a running scan stores `cancel_requested_at` and is cancelled between pages, terminal scans return 409 at the route, cancelled runs are never requeued or retried, and a late cancel cannot overwrite a completed result
- treat `cancelled` as a terminal status alongside `complete` and `error` (`TERMINAL_SCAN_STATUSES`) while `queued`/`running` remain the active statuses
- crawl-memory lookup (`get_previously_scanned_page_urls_for_domain`) selects only `requested_url`/`final_url`/`scanned_page_urls` for the user's complete scans (1 column-only SELECT, no issue eager-loading), replacing the historical O(history) eager-load
- incremental issue persistence (`append_scan_issue_records`) appends only the unpersisted tail of streamed issues during progress publishes, while completion keeps the authoritative replace; a retried claim first deletes partial issue rows so appends stay idempotent
- saved-scan history lists batch their issue-page-URL lookups (one column-only query for all rows) and skip eager loading entirely when `include_issues=False`, keeping statement counts constant
- record terminal-scan metrics and emit the slow-scan log line on completion

### `backend/alembic/`

Contains database migration files.

Current responsibility:

- create and track the PostgreSQL schema for saved scans, issues, preferences, users, sessions, password reset tokens, user ownership fields, notification preferences, scan cancellation, repair suggestions, and scan-performance indexes
- 17 revisions with a single linear head `9848b576f075` (`...f072` notification preferences, `...f073` scan cancel request flag, `...f074` default WCAG standard `wcag21aa`, `...f075` performance indexes)
- the f075 indexes are `ix_scan_runs_user_id_started_at`, `ix_scan_runs_status_started_at` (worker claim), `ix_scan_runs_status_heartbeat_at` (stale recovery), and `ix_scan_issues_scan_run_id_position` (ordered issue loads); they are non-unique and additive

Production startup rule:

- the backend Docker image starts through `backend/start.sh`
- `backend/start.sh` runs `alembic upgrade head` before Uvicorn starts
- hosted deployments should not override the Docker command with direct `uvicorn ...`, because that skips migrations and can leave required tables missing

## 5. Current Scan Flow

The current single-page scan flow in direct local mode is:

1. The frontend or API client sends `POST /scan/page` with a bearer token and URL (every other field is optional).
2. FastAPI resolves the current user from the token, validates the request body, and resolves scan options from saved preferences overlaid with any explicit request fields.
3. The backend validates the URL format.
4. The scanner navigates to the page in Playwright, waits for rendered JavaScript content, and captures rendered HTML.
5. If rendering is unavailable, the scanner falls back to raw HTTP HTML fetch.
6. The backend runs custom checks against the rendered or fallback HTML.
7. The backend runs axe-core in Playwright.
8. The backend merges issues and captures screenshots.
9. The backend saves the finished scan in PostgreSQL with the current user's ID.
10. The API returns the live scan result plus `scan_id`.

In worker mode, including production-style deployments:

1. The frontend sends `POST /scan/page` with a bearer token, URL, and `mode="single"`.
2. The backend creates a user-owned scan record with `status="queued"` and returns the scan ID immediately.
3. The dashboard polls `GET /scans/{scan_id}?include_issues=false` while the scan is queued or running, and fetches the full detail when the issue total changes or the scan reaches a terminal status.
4. The scan-worker claims the row, runs the rendered-page custom plus axe-core pipeline in its process-level reused Chromium session, saves the final result, and marks the row `status="complete"` or `status="error"`.
5. The web API remains available for `/health`, auth, history, and polling while Chromium runs in the worker process.

The current multi-page scan flow is:

1. The frontend sends `POST /scan/page` with a bearer token, `mode="multi"`, and optional crawl overrides (omitted fields inherit saved preferences).
2. The backend creates a user-owned saved scan record with `status="queued"` and clamps the page limit to a maximum of 5 pages.
3. The crawler follows allowed internal links while respecting depth, ignore patterns, same-domain settings, and robots settings.
4. Each page is rendered in Playwright when available, then analyzed with custom HTML checks plus axe-core; the worker reuses one Chromium process across pages and across jobs.
5. Issues are tagged with their affected `page_url` and locator metadata.
6. When crawl memory is enabled, discovered internal URLs that were previously scanned by the same user on the same domain are skipped (single column-only lookup).
7. The scan-worker claims the queued row, marks it `status="running"`, and increments worker attempt metadata.
8. As links are discovered, the worker persists `current_page_url`, `queued_page_urls`, `excluded_page_urls`, scanned URLs, skipped URLs, heartbeat timestamps, and the issues found so far (append-only writes for new issues, with replacement only on the final authoritative completion write, so retries never duplicate records).
9. The dashboard polls the lightweight scan status, streams partial per-page issues and summary counts into the results view while later pages are still being scanned, shows the current queue, and can call queue-control routes to remove or prioritize waiting pages.
10. Every page consumes the bounded render-wait configuration, and the whole crawl is capped by the `SCAN_MAX_SECONDS` time budget.
11. If a worker stops updating heartbeat data, stale-job recovery requeues the scan while attempts remain or marks it failed after max attempts.
12. The worker updates the row to `status="complete"` with actual `mode`, `pages_scanned`, `pages_skipped`, scanned/skipped page URL lists, issue counts, and a computed score.
13. Reports provide a selectable page list so users can inspect issues tied to each scanned page and see which pages were skipped.

### Scan cancellation lifecycle

1. The dashboard shows "Cancel scan" only while the active scan is `queued` or `running`; the user confirms inline.
2. The frontend sends `POST /scans/{scan_id}/cancel` with the session bearer token and stops polling once the request is accepted.
3. A queued scan is marked terminal immediately (`status="cancelled"`, `completed_at`, `duration_seconds`, `error_message="Cancelled by user"`); a running scan persists `cancel_requested_at` and keeps its current status until a worker or background job observes the flag.
4. `page_scanner.py` checks the cancel callback between pages and raises `ScanCancelled`; `scan_worker.py` also checks before claiming work and after the final page, and marks the run `cancelled` with partial issue data preserved.
5. Cancelled jobs are never retried and stale-job recovery never requeues them; a cancellation that loses the race to completion leaves the completed result untouched.
6. Terminal scans return HTTP 409 from the cancel route, and another user's scan returns 404.
7. The frontend renders the cancelled state as a neutral terminal outcome (progress text `Scan cancelled - partial results are kept below.`, a dismissible "Scan cancelled" notification, a "Cancelled" history filter and row label) rather than an error.

### Performance characteristics

Measured before/after evidence lives in `performance-baseline.md` and `performance-results.md`; the design rationale and bottleneck ranking live in `scan-performance-analysis.md`.

- **Worker browser lifecycle:** the scan-worker owns one `BrowserSession` and passes it to every job, so production scans pay no per-scan Chromium start/teardown. The session is recreated on disconnect/browser-fatal errors and recycled after `SCAN_BROWSER_MAX_JOBS` (default 250); the one-time teardown is amortised. `SCAN_BROWSER_REUSE_ENABLED=false` restores the per-scan lifecycle (used by local/direct mode and the kill switch).
- **Per-page costs:** render waits are bounded by `SCAN_RENDER_IDLE_TIMEOUT_MS`/`SCAN_RENDER_SETTLE_MS` (default 1500/100 ms), screenshots are capped at `SCAN_MAX_SCREENSHOTS` per page, and axe-core loads from the vendored asset instead of the network.
- **Scan budget:** multi-page crawls observe `SCAN_MAX_SECONDS` (default 240 s) between pages and fail cleanly when exceeded.
- **API read costs:** the dashboard's 2 s poll uses `include_issues=false` (1 row, O(1) payload); the full issue list is fetched only when the issue total changes or the scan terminates.
- **DB costs:** crawl-memory lookup is one column-only SELECT, history lists batch their issue-page URLs (constant statement count), and progress publishes append only new issue rows; migration `f075` adds the supporting composite indexes.
- **Observability:** phase timings are returned per scan and logged as `scan_timing` JSON by the worker; `/metrics` exposes request/duration/issue/queue/rate-limit series and slow scans above `SCAN_SLOW_LOG_SECONDS` get a structured warning.
- **Protection:** scan and auth endpoints are rate limited in-process (429 + `Retry-After`); scan targets pass SSRF validation with optional private-network blocking.

### Measured headline (production worker shape)

| Workload | Baseline | Optimized | Change |
|---|---|---|---|
| Single-page clean | 2,783.3 ms | 850.5 ms | −69.4 % |
| Single-page issue-dense with screenshots | 4,279.9 ms | 1,584.7 ms | −63.0 % |
| 5-page crawl, delay 0 | 7,254.4 ms | 4,188.8 ms | −42.3 % |
| 5-page crawl, delay 250 ms | 8,577.3 ms | 5,190.2 ms | −39.5 % |

The per-call `scan_page()` path (no injected session) also improves when compared like-for-like: clean −30.4 %, issue-dense −17.6 %, 5-page crawl −16.5 %, because render waits, screenshot caps and axe vendoring still apply. Functional equivalence holds except for the documented screenshot cap and the raw-HTML fallback now running axe-core.

If a scan fails after request validation:

1. The backend catches the scan error.
2. The backend saves a failed scan record with `status="error"`.
3. The API returns the original HTTP error to the client.

## 6. Persistence Flow

The current persistence layer stores scan, issue, preference, auth, and repair-suggestion records.

### `scan_runs`

Stores one row per scan attempt.

Important fields:

- scan ID
- user ID
- requested URL
- final URL
- status (`queued`, `running`, `complete`, `error`, or `cancelled`)
- mode
- resolved scan options snapshot (`scan_options`) used by queued worker jobs
- started time
- completed time
- duration
- issue counts
- pages scanned
- pages skipped by crawl memory
- scanned and skipped page URL lists
- accessibility score
- cancellation request time (`cancel_requested_at`)
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
- contextual screenshot URL or local data URL
- WCAG criteria
- detection source

Current rule:

- issue screenshots are uploaded to Cloudinary when `CLOUDINARY_URL` is configured, and saved issue records store the returned URL; local runs without Cloudinary still use inline data URLs. Production omits the screenshot when Cloudinary upload fails unless `CLOUDINARY_SCREENSHOT_FALLBACK=data_url` is explicitly enabled.

Read/write performance rules:

- progressive issue writes are append-only (`append_scan_issue_records`): a publish writes only issues beyond the persisted count, and a retried claim clears partial rows first; the final completion write replaces the set so the saved scan is authoritative
- `GET /scans/{scan_id}?include_issues=false` skips the issue query entirely and returns a lightweight response; saved-scan history lists batch their issue-page-URL lookup in one column-only query

### `app_preferences`

Stores one preferences row per authenticated user (`user_id` is unique).

Important fields:

- AI provider, model, and the encrypted provider API key
- crawl defaults: default scan mode, page limit, depth, request delay, page timeout, ignored URL patterns, same-domain and robots switches, crawl-memory switch
- WCAG standard (`wcag21aa` default after migration `...f074`) and best-practices switch
- notification switches (`notify_on_scan_complete`, `notify_on_scan_failed`, `notify_on_high_severity`, `weekly_summary`), score-threshold switch/value (`notify_score_threshold_enabled`, `notify_score_threshold`), severity selection (`notify_severities`), and inert email-notification fields
- appearance fields (theme, reduced motion, high contrast, density) that are persisted but not applied at runtime

Notification flow:

1. The dashboard finishes polling a terminal scan (`complete`, `error`, or `cancelled`).
2. `frontend/src/lib/scan-notifications.ts` evaluates the persisted notification preferences against the scan status, summary counts, and score.
3. `components/home/ScanNotifications.tsx` renders dismissible, polite status banners; cancelled scans always produce a neutral "Scan cancelled" notification.
4. No email transport exists: notification preferences are evaluated in-app only.

### `repair_suggestions`

Stores one generated AI suggestion per authenticated user, scan, and grouped issue pattern.

Important fields:

- suggestion ID
- user ID
- scan run ID
- group key
- rule ID
- severity
- affected count
- affected page URLs
- provider and model
- explanation, impact, and recommended fix
- optional before and after code examples
- confidence and limitations

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

### WCAG standard selection

axe-core is run with `runOnly` tags derived from the user's saved `wcag_standard` and `include_best_practices` preferences (see `axe_scanner.build_axe_tag_values`). The default `wcag21aa` preserves the 2.1 rule coverage the scanner previously hardcoded; `wcag2aa` limits analysis to 2.0-only coverage, 2.2 selections add 2.2 tags, AAA selections add AAA tags, A-only selections drop AA tags, and best-practice rules are opt-out.

## 8. Current Frontend Status

### Shared visual foundations (3 November 2026)

The public, account and workspace route groups share semantic design tokens in
`frontend/src/app/globals.css`, Manrope loaded through `next/font`, and the existing
Radix/Tailwind UI primitives. The visual redesign preserves the API, authentication,
scan hooks, saved-scan mapping and preference contexts as the behavior owners.

`MarketingLogo` is shared across public, account and workspace chrome. `AuthShell`
provides one layout for canonical auth pages and legacy `/signup`. `DashboardShell`
owns the workspace's single main landmark, desktop sidebar, skip link and mobile
Radix navigation dialog. Below 1024px, `IssueList` presents the complete existing
`IssueDetailPanel` in a modal inspector and returns focus to the selected issue.

History rows expose working links and comparison controls; reports flow naturally
and retain their page list in print. Preference controls keep draft/save/discard
ownership and now have associated labels. Operating-system reduced motion applies
globally. Stored theme/high-contrast/density settings still have their existing
runtime limitations. Details: `docs/design/2026-11-03-accessaudit-redesign.md`.

### Home dashboard

Implemented:

- URL input
- scan trigger
- progress panel (idle, active, done, error, cancelled)
- cancel-scan control with inline confirmation while queued/running
- in-app terminal scan notifications driven by saved preferences
- lightweight status polling with on-demand full issue fetches
- summary metrics
- overview panels
- issue list with expandable detail rows

### Reports page

Implemented:

- persisted report data with score, severity, and per-page issue grouping
- grouped AI repair suggestions per scan
- "Export all patches" download of the full grouped repair bundle

### Preferences page

Implemented:

- AI provider/model and encrypted API key
- crawl defaults, WCAG standard, best practices
- notification switches plus score-threshold and severity selection persisted through the backend
- appearance and danger-zone settings

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
- current crawls reuse one Chromium browser per worker process (fresh context per page) and stream partial per-page results to the dashboard while the crawl runs
- current crawls can be cancelled between pages from the dashboard, keeping the partial results already found
- current worker jobs include retry and stale-job recovery; queued-job claiming uses `FOR UPDATE SKIP LOCKED` row locks, so multiple worker replicas can run safely (`docker compose up --scale scan-worker=N` or `SCAN_WORKER_REPLICAS`)
- current worker processes reuse one Chromium across scan jobs; horizontal worker scaling remains the preferred way to add throughput

### Performance and reliability follow-ups

Not implemented yet, documented in `scan-performance-analysis.md` §14:

- bounded intra-crawl page parallelism (2–3 contexts) to overlap the network-idle floor, at the cost of Chromium memory and more complex queue/cancel semantics
- a cheaper DOM/network-stability detector to reduce the ~508 ms/page network-idle observation
- worker retry backoff with jitter (retries are currently immediate)
- Redis/shared rate limiting and a shared metrics store for multi-instance deployments
- OpenTelemetry tracing and Grafana dashboards (metrics + structured logs exist today)
- fail-fast production secret validation instead of development fallbacks
- full-site crawl orchestration beyond the 5-page dashboard cap

### Reporting

- saved history views
- CSV export
- PDF export
- persisted report pages with score, selectable per-page issue views, skipped-page visibility, issue status wording, and locator guidance

### AI recommendation layer

Current implemented AI behavior:

- the Reports page groups similar issues so users generate one suggestion for many repeated instances
- each generated suggestion is saved to PostgreSQL by authenticated user, scan, and issue group
- the backend uses the user's stored Preferences API key and active provider/model settings
- OpenAI suggestions use the Responses API with JSON schema output, while DeepSeek suggestions use Chat Completions JSON mode
- generated responses include a plain-English explanation, why the issue matters, a suggested fix, optional corrected code examples, confidence, and limitations

Future AI work from the project overview:

- conversational remediation assistant
- broader code-repair workflows outside the current grouped report suggestion flow

Exportable patch bundles are now implemented: `GET /scans/{scan_id}/repair-suggestion-bundle` renders every grouped suggestion (plus a "Not yet generated" list) as one markdown or JSON document for download.

The current AI layer does not generate a separate suggestion for every individual issue instance.

## 10. Current API Summary

### `GET /`

Purpose:

- quick check that the API process is running

### `GET /health`

Purpose:

- health check for local testing and deployment verification

### `GET /metrics`

Purpose:

- expose Prometheus text metrics for the API process: scan request/duration/issue counters and histogram, rate-limited counters, plus database-refreshed queue-depth and worker-attempt gauges
- returns 404 when `METRICS_ENABLED=false`; values are per process, so scrape every API/worker process in a scaled deployment

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
- every field other than `url` is optional; omitted fields inherit the user's saved scan preferences, explicit fields override them

```json
{
  "url": "https://example.com"
}
```

Example request with explicit overrides:

```json
{
  "url": "https://example.com",
  "mode": "multi",
  "page_limit": 5,
  "crawl_depth": 1,
  "wcag_standard": "wcag22aa",
  "include_best_practices": false
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

- return saved scan summaries for the authenticated user's history page

Example use cases:

- newest scans first
- filter by status
- filter by mode
- search by URL

### `GET /scans/{scan_id}`

Purpose:

- return one saved scan with its saved issue records when it belongs to the authenticated user
- query parameter `include_issues` (default true): set `false` for the dashboard's lightweight 2 s status poll — the response keeps its shape, counts and queue metadata but returns an empty `issues` list and skips the issue query

### `GET /scans/{scan_id}/repair-suggestion-groups`

Purpose:

- return grouped issue patterns for a saved scan when it belongs to the authenticated user
- include any existing saved AI suggestion for each group

### `POST /scans/{scan_id}/repair-suggestion-groups/{group_key}/generate`

Purpose:

- generate one AI repair suggestion for the selected issue group
- persist the suggestion by authenticated user, scan, and group key
- return the saved suggestion on repeat calls unless forced regeneration is added by a future UI flow

### `POST /scans/{scan_id}/cancel`

Purpose:

- cancel a queued scan (immediate terminal `cancelled` status) or request that a running scan stop between pages (persist `cancel_requested_at`)
- authenticated and ownership scoped; another user's scan returns 404, an already-finished scan returns 409
- returns the saved scan JSON with status `cancelled` (queued) or the still-active status plus `cancel_requested_at` (running)

### `GET /scans/{scan_id}/repair-suggestion-bundle`

Purpose:

- export every repair suggestion of a saved scan as one downloadable document
- query parameter `format` accepts `markdown` (default) or `json`; invalid formats return 400
- returns `{scan_id, generated_at, filename, content_type, group_count, generated_count, missing_count, content}`; groups without a saved suggestion are listed in a "Not yet generated" section
- authenticated and ownership scoped; another user's scan returns 404

## 11. Current Status

The current implementation includes the complete browser-to-API-to-worker-to-database scan flow, user-scoped history/preferences, report views, queue controls, screenshot persistence, grouped OpenAI/DeepSeek repair suggestions with patch-bundle export, preference-driven scan options with WCAG-to-axe mapping, persisted notification preferences with in-app delivery, scan cancellation with a preserved partial-result terminal state, and a three-tier frontend gate (typecheck, Vitest, Playwright) plus a production build gate in CI.

Performance and operability are now part of the architecture too: worker-level browser reuse, tuned render waits/screenshot caps/time budget, a vendored axe-core asset, incremental persistence, indexed crawl-memory/history/queue queries, lightweight dashboard polling, connection pooling, in-process rate limiting, Prometheus-style metrics and structured scan timings. Measured baseline-vs-optimized evidence is in `performance-results.md`; remaining follow-ups are listed in §9 and `scan-performance-analysis.md` §14.

Use `../tracking/feature-checklist.md` as the source of truth for the detailed implemented/pending list. This architecture document explains how those features fit together; it intentionally does not repeat the full checklist.

## 12. How To Explain This In The Final Report

You can describe the architecture like this:

> The system uses a client-server architecture. The Next.js frontend provides the user interface for starting scans, viewing results, and generating grouped repair suggestions. The FastAPI backend validates input, fetches pages, runs accessibility analysis, groups similar issues for AI repair suggestions, stores scan and suggestion records in PostgreSQL, and returns structured JSON responses. The design separates API routing, schemas, scan services, database models, repositories, and migrations so the project can grow toward larger multi-page crawling, reporting, and broader AI remediation workflows.

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

## 14. Developer Change Map

Use this map before editing. It reduces the chance of putting logic in the wrong layer.

| Change | Start Here | Usually Also Check |
|---|---|---|
| Add or change an API route | `backend/app/main.py` | matching schema, repository/service, `backend/tests/test_api_smoke.py` |
| Change request or response JSON | `backend/app/schemas/` | frontend callers in `frontend/src/lib/` and related tests |
| Change database fields | `backend/app/models/` | repository mapping, Alembic migration, repository tests |
| Change scanning rules | `backend/app/services/page_scanner.py` | `axe_scanner.py`, scanner unit tests, issue mapping UI |
| Change worker behavior | `backend/app/scan_worker.py` | queue functions in `scan_repository.py`, both Compose files |
| Change login/session behavior | `frontend/src/lib/auth-options.ts` and `backend/app/main.py` | `AuthContext.tsx`, auth repository/service, auth tests |
| Change saved scan/report data | `backend/app/schemas/history.py` and `frontend/src/lib/saved-scans.ts` | reports/issues/history components and tests |
| Change preferences | `backend/app/schemas/preferences.py` | model, repository, `PreferencesContext.tsx`, preferences components, `backend/app/services/scan_options_resolver.py`, `axe_scanner.build_axe_tag_values` |
| Change scan cancellation | `POST /scans/{scan_id}/cancel` in `backend/app/main.py` | cancel functions in `scan_repository.py`, `page_scanner.py`/`scan_worker.py`, dashboard cancel UI, `frontend/e2e/scan-cancel.spec.ts` |
| Change repair-bundle export | `backend/app/services/repair_bundle_service.py` | `GET /scans/{scan_id}/repair-suggestion-bundle`, `AiSuggestionsTab.tsx`, bundle/export tests |
| Change scan performance knobs or browser lifecycle | `backend/app/services/page_scanner.py`, `backend/app/scan_worker.py` | env defaults, benchmark harness in `scripts/perf/`, `docs/architecture/performance-*.md` |
| Change DB indexes or query shape | `backend/alembic/versions/`, `backend/app/repositories/scan_repository.py` | migration head, benchmark evidence, repository tests |
| Change metrics or rate limits | `backend/app/services/metrics.py`, `backend/app/services/rate_limit.py`, `backend/app/main.py` | configuration tables, smoke/unit tests, observability notes |
| Change browser E2E coverage | `frontend/e2e/` | `frontend/playwright.config.ts`, `.github/workflows/quality-gate.yml`; keep role/text selectors stable |

### Safe backend sequence

1. Update the Pydantic schema if the API contract changes.
2. Put business or integration logic in a service.
3. Put database reads/writes in a repository.
4. Keep the route handler focused on authentication, validation, orchestration, and HTTP errors.
5. Add a migration for model changes; never rely on SQLAlchemy models to alter an existing database automatically.
6. Add focused tests, then run the full backend suite.

### Safe frontend sequence

1. Check for an existing component or data mapper before adding one.
2. Keep bearer headers centralized through `frontend/src/lib/api.ts`.
3. Keep saved-scan API mapping in `frontend/src/lib/saved-scans.ts`.
4. Preserve loading, empty, error, queued, running, complete, and failed states.
5. Run typecheck, component tests, and a production build.

## 15. Configuration Reference

Configuration is read from environment variables; secrets must not be committed.

### Frontend and Auth.js

| Variable | Used By | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `frontend/src/lib/api.ts` | Browser-facing FastAPI URL |
| `AUTH_API_BASE_URL` | `frontend/src/lib/auth-options.ts` | Server-side FastAPI URL used by Auth.js |
| `AUTH_SECRET` | Auth.js | Signs the frontend session JWT |
| `NEXTAUTH_URL` | Auth.js | Public frontend base URL |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `auth-options.ts` | Enable Google sign-in when both are set |
| `OAUTH_PROXY_SECRET` | frontend and backend | Authenticates the trusted server-to-server `/auth/google` exchange |

### Backend and worker

| Variable | Used By | Meaning |
|---|---|---|
| `DATABASE_URL` | `backend/app/db.py` | PostgreSQL connection string |
| `AUTH_JWT_SECRET` | `backend/app/services/auth_service.py` | Signs backend bearer tokens |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEX` | `backend/app/main.py` | Allowed browser origins |
| `SCAN_EXECUTION_MODE` | `backend/app/main.py` | `worker` queues scans; other values use local background behavior |
| `SCAN_WORKER_POLL_INTERVAL_SECONDS` | `backend/app/scan_worker.py` | Worker polling delay (default 0.5s) |
| `SCAN_WORKER_REPLICAS` | `docker-compose.yml` | Number of scan-worker containers (default 1) |
| `SCAN_WORKER_STALE_AFTER_SECONDS` | `backend/app/scan_worker.py` | Age at which a running job can be recovered |
| `SCAN_WORKER_ID` | `backend/app/scan_worker.py` | Optional explicit worker identifier |
| `FRONTEND_BASE_URL` | `backend/app/main.py` | Base URL used to build reset links |
| `PASSWORD_RESET_LOG_LINKS` | `backend/app/main.py` | Local-only switch for printing reset links |
| `CLOUDINARY_URL` | `backend/app/services/page_scanner.py` | Enables hosted screenshot uploads |
| `CLOUDINARY_SCREENSHOT_FOLDER` | `page_scanner.py` | Cloudinary destination folder |
| `CLOUDINARY_SCREENSHOT_FALLBACK` | `page_scanner.py` | Allows inline data URL fallback after upload failure |
| `ENCRYPTION_KEY` | `backend/app/utils/encryption.py` | Encrypts provider API keys stored in preferences |

### Performance, reliability and observability knobs

| Variable | Default | Used By | Meaning |
|---|---|---|---|
| `SCAN_BROWSER_REUSE_ENABLED` | `true` | `scan_worker.py` | Worker reuses one Chromium across jobs; `false` restores per-scan browser lifecycle |
| `SCAN_BROWSER_MAX_JOBS` | `250` | `scan_worker.py` | Recycle the reused browser after N jobs (controls memory growth) |
| `SCAN_RENDER_IDLE_TIMEOUT_MS` | `1500` | `page_scanner.py` | Network-idle ceiling per page |
| `SCAN_RENDER_SETTLE_MS` | `100` | `page_scanner.py` | Extra settle wait after load/network-idle |
| `SCAN_MAX_SCREENSHOTS` | `10` | `page_scanner.py` | Maximum unique screenshots captured per page |
| `SCAN_MAX_SECONDS` | `240` | `page_scanner.py` | Wall-clock budget for a multi-page crawl |
| `AXE_SCRIPT_PATH` | vendored `backend/app/assets/axe.min.js` | `axe_scanner.py` | Override the axe-core asset path (CDN is fallback only) |
| `SCAN_ALLOW_PRIVATE_TARGETS` | `true` | `url_utils.py` | Allow private/loopback scan targets; set `false` in production |
| `DB_POOL_SIZE` | `5` | `db.py` | SQLAlchemy pool size (PostgreSQL only) |
| `DB_MAX_OVERFLOW` | `10` | `db.py` | Max overflow connections |
| `DB_POOL_TIMEOUT` | `30` | `db.py` | Seconds to wait for a pooled connection |
| `DB_POOL_RECYCLE` | `1800` | `db.py` | Recycle connections older than N seconds |
| `DB_POOL_PRE_PING` | `true` | `db.py` | Validate pooled connections before use |
| `RATE_LIMIT_ENABLED` | `true` | `rate_limit.py` | Master switch for the in-process token-bucket limiter |
| `RATE_LIMIT_SCAN_PER_MINUTE` | `30` | `main.py` | Per-authenticated-user scan limit |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `10` | `main.py` | Per-client-IP auth limit |
| `METRICS_ENABLED` | `true` | `main.py` | Expose `GET /metrics` (404 when false) |
| `SCAN_SLOW_LOG_SECONDS` | `10` | `metrics.py` | Emit a structured slow-scan log line above this duration |

Caveats: browser reuse keeps a Chromium process (~150–300 MB RSS) per worker; rate-limit buckets, metrics and phase timings are per process/worker; and the connection-pool settings must respect the managed PostgreSQL connection cap (`replicas × (DB_POOL_SIZE + DB_MAX_OVERFLOW)`).

Why this matters: local fallback secrets in `auth_service.py` and `encryption.py` are development conveniences, not production configuration.

## 16. Testing And Debugging Strategy

### Automated tests

- Backend pytest tests live in `backend/tests/` (201 tests across 14 files).
- `test_api_smoke.py` exercises FastAPI routes in-process with `TestClient`.
- `test_page_scanner_unit.py` covers custom checks, crawling, rendering fallback, and scan behavior.
- `test_scan_repository_unit.py`, `test_auth_unit.py`, `test_scan_options_resolver_unit.py`, `test_scan_cancel_unit.py`, `test_preferences_unit.py`, `test_repair_bundle_unit.py`, `test_bundle_and_cancel_api.py`, `test_scan_perf_unit.py`, `test_perf_api_unit.py`, and the repair suggestion tests cover persistence, domain rules, preference resolution, bundle rendering, cancellation, performance knobs, rate limiting, metrics, and lightweight reads, often with in-memory SQLite.
- Frontend Vitest tests sit beside components or under `frontend/src/lib/` (42 tests across 11 files); `frontend/src/test/setup.ts` configures Testing Library matchers.
- Playwright browser E2E tests live in `frontend/e2e/` (8 tests across 5 specs) and run against a production build (`npm run build && npm run start`) via `playwright.config.ts`; they stub browser-to-backend requests and mint a NextAuth session cookie, so no backend is required. Running the suite against `next dev` was avoided because dev-server HMR recompiles during a run made multi-test runs flaky.

Run them with:

```powershell
# backend
cd backend
.\venv\Scripts\python.exe -m pytest -q tests

# frontend unit/component tests
cd frontend
npm test

# browser E2E (requires Chromium: npx playwright install chromium)
npx playwright install chromium
npm run test:e2e
```

Performance benchmarks (optional; ~5 min for the scanner, ~25 s for the DB suite):

```powershell
cd backend
.\venv\Scripts\python.exe ..\scripts\perf\bench_scan.py --json-out ..\scripts\perf\optimized.json
.\venv\Scripts\python.exe ..\scripts\perf\bench_db.py --iterations 20 --json-out ..\scripts\perf\db_optimized.json
```

Benchmark evidence and methodology: `performance-baseline.md`, `performance-results.md`, `scan-performance-analysis.md`.

CI is defined in `.github/workflows/quality-gate.yml` and runs four jobs: frontend typecheck + Vitest, frontend production build, Playwright E2E, and backend compile + pytest. It does not run a lint command or enforce coverage thresholds.

### Debugging order

1. Check `GET /health` to confirm the API process responds.
2. Check `/docs` to inspect the live FastAPI contract.
3. Use `/test/page-bad` for deterministic custom and axe issues.
4. Use `/test/page-js-rendered` to prove JavaScript-rendered analysis is active.
5. If a scan remains queued, inspect the `scan-worker` process and its `DATABASE_URL`.
6. If auth fails, separate browser-session problems (`AUTH_SECRET`, Auth.js) from backend-token problems (`AUTH_JWT_SECRET`, `UserSession`).
7. If database fields are missing, inspect `backend/alembic/versions/` and run `alembic upgrade head`.

## 17. Risky And Complex Areas

### Worker state and retries

`ScanRun` stores status, queue URLs, worker ownership, lock time, heartbeat, retry counts, and `cancel_requested_at`. Changes must stay aligned across `backend/app/models/scan.py`, `scan_repository.py`, `scan_worker.py`, scan response schemas, and dashboard polling. Cancellation adds a fourth terminal status (`cancelled`) and must never be treated as a retryable failure.

### Two-layer authentication

Auth.js owns the browser session while FastAPI owns users, backend JWTs, and persisted sessions. A frontend login can appear successful while protected API calls fail if the backend token is missing or expired.

### Untrusted URL scanning

`backend/app/utils/url_utils.py::validate_public_http_url` rejects non-`http(s)` schemes, URLs with embedded credentials, and URLs longer than 2048 characters. When `SCAN_ALLOW_PRIVATE_TARGETS=false` (recommended in production) it resolves the hostname and rejects private, loopback, link-local, reserved, multicast and non-global addresses, including resolution failures; the scanner also re-validates the post-redirect final URL. The default is `true` so local demo/test pages work. DNS rebinding remains a residual risk — mitigate with production egress policy.

### Browser reuse and worker memory

The scan-worker keeps one Chromium process alive and reuses it across jobs (`SCAN_BROWSER_REUSE_ENABLED`, default true; recycle at `SCAN_BROWSER_MAX_JOBS`, default 250; recreate on disconnect/browser-fatal errors). This trades ~150–300 MB RSS per worker for ~1.9 s saved per job; keep the kill switch (`SCAN_BROWSER_REUSE_ENABLED=false`) for rollback and plan worker memory accordingly.

### Per-process rate limiting and metrics

Rate-limit buckets, metrics and phase timings are in-process. A multi-instance or multi-replica deployment needs a shared limiter/metrics store (e.g. Redis) or ingress-level limits, and `/metrics` must be scraped from every process. The current settings are intentionally dependency-free for a single-instance final-year deployment.

### DB pool sizing

`DB_POOL_SIZE` (default 5) and `DB_MAX_OVERFLOW` (default 10) are per process. Keep `api replicas × (pool + overflow)` below the managed PostgreSQL connection cap, and remember the scan worker also opens its own pool.

### Screenshots and data size

Local scans can use inline data URLs. Production should use Cloudinary so large image data is not stored in PostgreSQL. Backend and worker need matching Cloudinary settings.

### Historical documents

The database and persistence guides describe the sequence used to build the first version. They are not the source of truth for current behavior. Use this document and `../tracking/feature-checklist.md` for current state.

### Test boundaries

Vitest component tests, in-process API tests, and the Playwright suite (which mocks the backend) are valuable but they do not collectively prove the live browser-to-worker-to-database flow, and no automated suite runs against a seeded PostgreSQL instance. Use the deployment verification checklist in the root README for hosted end-to-end evidence until that layer is automated.

## 18. Glossary

- **API**: the HTTP interface used by the frontend to call FastAPI.
- **Alembic migration**: a versioned database schema change under `backend/alembic/versions/`.
- **Auth.js**: the frontend session layer used by the Next.js application.
- **Bearer token**: the backend access token sent as `Authorization: Bearer <token>`.
- **BrowserSession / worker browser reuse**: one Playwright Chromium session owned by the scan-worker process and injected into each `scan_page()` call so scans do not pay browser start/teardown.
- **CORS**: browser rules that control which frontend origins may call the backend.
- **Crawl memory**: saved knowledge of previously scanned internal URLs for a user/domain.
- **DOM path**: a CSS-like path that helps locate an affected element in the page structure.
- **Lightweight poll**: `GET /scans/{id}?include_issues=false`, returning status/queue/summary with an empty issue list for cheap dashboard polling.
- **Metrics**: process counters/histogram/gauges rendered in Prometheus text format by `GET /metrics`.
- **ORM**: SQLAlchemy's mapping between Python classes and database tables.
- **Phase timings**: per-scan durations (`browser_setup`, `render_wait`, `axe`, `screenshots`, etc.) attached to the response and logged as `scan_timing`.
- **Rate limit**: in-process token bucket that returns HTTP 429 with `Retry-After` for excessive scan/auth requests.
- **SSRF**: server-side request forgery; mitigated by scan-target validation and optional private-network blocking.
- **Cancel flag**: `scan_runs.cancel_requested_at`, set when a running scan is asked to stop; the worker turns it into the terminal `cancelled` status between pages.
- **Patch bundle**: one downloadable markdown/JSON document containing every grouped repair suggestion for a scan.
- **Playwright E2E**: browser-level tests under `frontend/e2e/` that drive the real Next.js UI without a backend.
- **Repository**: a module that owns database queries and persistence operations.
- **Schema**: a Pydantic class that defines accepted request data or returned response data.
- **Scan run**: one persisted scan attempt in `scan_runs`, including queued, running, complete, error, or cancelled states.
- **Worker**: the separate process that claims queued scans and performs Playwright/axe analysis.
- **WCAG**: Web Content Accessibility Guidelines, the standards referenced by issue tags.
- **WCAG tag mapping**: the translation of a saved WCAG standard into axe-core `runOnly` tags (`build_axe_tag_values`).

## 19. Deployment Reference

The repository is prepared for a split deployment: Next.js on Vercel, plus a FastAPI web service, scan worker, and managed PostgreSQL database on Render or equivalent services.

### Backend web service

- Build context: `backend/`
- Dockerfile: `backend/Dockerfile`
- Health check: `/health`
- Startup: keep the image default command so `backend/start.sh` runs `alembic upgrade head` before Uvicorn
- Current migration head: `9848b576f075` (notification preferences, scan cancel flag, default WCAG 2.1 AA, scan-performance indexes)
- Required production values include `DATABASE_URL`, `AUTH_JWT_SECRET`, `FRONTEND_URL`, and a real `ENCRYPTION_KEY`
- Recommended production additions: `SCAN_ALLOW_PRIVATE_TARGETS=false`, `METRICS_ENABLED=true`, `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` sized to the provider connection cap
- Add `CORS_ALLOWED_ORIGIN_REGEX` only when preview domains need access

Do not replace the container command with direct `uvicorn`. That bypasses `backend/start.sh` and can leave the database behind the current migrations.

### Scan worker

- Use the same backend image and `DATABASE_URL` as the web service.
- Command: `python -m app.scan_worker`
- Keep `SCAN_BROWSER_REUSE_ENABLED=true` (the default) for the measured production-shape gains; size worker memory for one persistent Chromium (~150–300 MB) and use `SCAN_BROWSER_MAX_JOBS` to cap growth.
- Set the same Cloudinary screenshot variables as the backend.
- The worker does not expose an HTTP port; scrape `/metrics` from the web service for queue depth and scan counters.

### Frontend

- Framework: Next.js
- Root directory: `frontend/`
- `NEXT_PUBLIC_API_BASE_URL`: public backend URL used by the browser
- `AUTH_API_BASE_URL`: backend URL reachable from the Vercel server runtime
- `AUTH_SECRET`: stable frontend session secret
- `NEXTAUTH_URL`: deployed frontend URL
- Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and matching `OAUTH_PROXY_SECRET` only when Google sign-in is enabled

### Deployment verification

After deployment:

1. Confirm backend `/health` and `/docs` respond.
2. Confirm the worker starts without migration or database errors.
3. Register/login through the deployed frontend.
4. Run a scan and confirm it moves from queued to complete.
5. Open the saved report and confirm screenshots use hosted URLs when Cloudinary is configured.
6. Keep `PASSWORD_RESET_LOG_LINKS=false`; password reset is not production-complete until transactional email is added.

Formal hosted verification evidence is still marked incomplete in `../tracking/feature-checklist.md`.

## 20. Open Questions

- Are the production Render/Vercel environments configured with all required auth, encryption, Cloudinary, and OAuth secrets?
- Has every deployed database applied Alembic migration `9848b576f075`?
- What transactional email provider will deliver password reset links and future scan notifications?
- Should production add network-egress policy or DNS pinning to harden the remaining DNS-rebinding SSRF risk?
- Should the empty root `database/` directory be removed or used for database assets?
- Should the Playwright suite grow a seeded-backend mode that exercises the worker and database instead of only mocked API responses?
- Should CI add a lint job and automated coverage thresholds?
- Should rate limiting and metrics move to a shared store (Redis/Prometheus) if the deployment scales beyond one API process and one worker?
- Should the scanner adopt bounded intra-crawl page parallelism, and does migration f075 measurably help on production PostgreSQL?
