# Feature Inventory

Snapshot date: 2026-11-03 (performance batch)
Code revision: `a2bc609` (`fullstack-dev`, including the 2026-11-02 feature batch) plus the uncommitted 2026-11-03 performance/observability batch (scanner engine, DB/API, polling, security, metrics, E2E portability).
Evidence basis: source inspection + executed verification — `201` backend pytest passed, `42` frontend Vitest passed, `8` Playwright browser E2E passed (run on an isolated port due to a local port-3000 collision), `npx tsc --noEmit` clean, `next build` succeeded (15 routes + middleware). Performance evidence: `docs/architecture/performance-baseline.md`, `performance-results.md`, `scan-performance-analysis.md`.

This document is a **report-ready inventory** of what the AccessAudit web accessibility assistant does. `feature-checklist.md` remains the source of truth for status; this file explains what each feature is, where it lives, and how complete it is.

## Status legend

| Symbol | Meaning |
|---|---|
| **Implemented** | Works end-to-end and is visible to users |
| **Partial** | Backend and/or UI exists, but an input is ignored, a control is disabled, or delivery is missing |
| **Scaffold** | Persisted, typed, or rendered, but no runtime behavior depends on it |
| **Planned** | Documented roadmap item with no implementation yet |

## 1. What the system is

AccessAudit scans a webpage, detects accessibility (WCAG) problems with a mix of custom HTML checks and axe-core, crawls a bounded set of internal pages, stores results per authenticated user, and presents scores, severity breakdowns, issue locators, screenshots, historical comparisons, cancellable scans, and AI-generated repair guidance that can be exported as a patch bundle.

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui (new-york), NextAuth v4 |
| Backend | FastAPI 0.135, SQLAlchemy 2.0, Pydantic 2, Alembic, uvicorn |
| Scanning | Playwright/Chromium (rendered DOM), axe-core 4.10.2, custom `HTMLParser` checks |
| Persistence | PostgreSQL (7 tables, 17 Alembic migrations, head `9848b576f075`) |
| Queue | Dedicated `scan-worker` process with DB claiming, retries, stale recovery, cancellation |
| AI | OpenAI and DeepSeek HTTP APIs for grouped repair suggestions |
| Infra & tests | Docker Compose (prod + dev), 4-job GitHub Actions gate (78 unit/API/smoke + 8 browser E2E tests), Render/Vercel deployment docs |

## 2. Feature inventory

### 2.1 Scanning and analysis engine

| Feature | Status | Where | Notes |
|---|---|---|---|
| Single-page scan API | Implemented | `backend/app/main.py` `POST /scan/page` | Validates URL, renders, scans, persists, returns full result; all crawl/WCAG fields optional and inherited from saved preferences |
| Custom accessibility checks (6 rules) | Implemented | `backend/app/services/page_scanner.py` | `document-title`, `html-lang`, `image-alt`, `link-name`, `duplicate-id`, `heading-order`; each carries line/column, DOM path, text preview, source hint |
| axe-core analysis | Implemented | `backend/app/services/axe_scanner.py` | axe-core 4.10.2 loaded from cdnjs at scan time; tags driven by the user's WCAG preference; falls back to custom-only when axe cannot load |
| WCAG-standard-driven rule selection | Implemented | `axe_scanner.py` `build_axe_tag_values`, `scan_options_resolver.py` | Default `wcag21aa` → `wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice`; 2.2 adds 2.2 tags; AAA adds AAA; A-only drops AA; `best-practice` opt-out |
| JavaScript-rendered DOM analysis | Implemented | `page_scanner.py` (`BrowserSession`, `_scan_rendered_page`) | Playwright navigates and waits for rendered content; one shared Chromium per scan job, fresh context per page |
| Raw-HTML fallback | Implemented | `page_scanner.py` (`urlopen` path, script-stripped Playwright fallback) | Used when rendering fails or is unavailable |
| Custom/axe deduplication | Implemented | `axe_scanner.py` (`merge_issues`) | Overlapping rules keep the custom issue (line/column) and absorb axe WCAG tags; `source` becomes `both` |
| Severity classification | Implemented (3 levels) | `axe_scanner.py`, `page_scanner.py` | axe critical/serious → `high`, moderate → `medium`, minor → `low`; the 4-level design vocabulary collapses at storage |
| Accessibility score | Implemented | `repositories/scan_repository.py` (`calculate_scan_score`) | `100 − (12·high + 4·medium + 1·low) / max(pages,1)`, clamped 0–100 |
| Issue locator guidance | Implemented | `page_scanner.py`, `frontend/src/lib/saved-scans.ts` (`buildFinderHint`) | Affected page URL, DOM path (`:nth-of-type`), line/column, source snippet, text preview, search hint |
| Contextual screenshots | Implemented (single-page) | `page_scanner.py` (`_attach_issue_screenshots`) | Element-clipped JPEG; Cloudinary upload with inline data-URL fallback; captured only for synchronous single-page scans |
| JS-rendered demo page | Implemented | `main.py` `GET /test/page-js-rendered` | Static HTML is clean; JavaScript injects violations — proves rendering is active |
| Deliberately broken demo page | Implemented | `main.py` `GET /test/page-bad` | Exercises most custom + axe rules for demos and smoke tests |

### 2.2 Crawling and job orchestration

| Feature | Status | Where | Notes |
|---|---|---|---|
| Bounded multi-page crawl | Implemented | `page_scanner.py` (BFS queue) | Page limit, depth, per-page delay, timeout |
| Crawl scope controls | Implemented | `page_scanner.py`, `models/preferences.py` | Stay-within-domain, robots.txt, ignored URL patterns (glob/substring), non-HTML extension skip list |
| Preference-driven crawl defaults | Implemented | `services/scan_options_resolver.py`, `main.py` | Omitted request fields inherit saved preferences; explicit request values win; resolved options persisted for the worker |
| Crawl memory | Implemented | `page_scanner.py`, `scan_repository.py` | Skips previously scanned internal pages on repeat domain scans; scanned/skipped URL lists persisted |
| Dedicated scan worker | Implemented | `backend/app/scan_worker.py` | `FOR UPDATE SKIP LOCKED` claiming, worker id, lock/heartbeat columns |
| Retry policy | Implemented | `scan_repository.py` | `worker_attempts` up to `max_worker_attempts` (default 3); no backoff |
| Stale-job recovery | Implemented | `scan_repository.py` (`recover_stale_running_scans`) | Heartbeat older than `SCAN_WORKER_STALE_AFTER_SECONDS` (default 300) requeued or failed; cancel-requested jobs become `cancelled`, never requeued |
| Live queue metadata | Implemented | `scan_repository.py`, `main.py` | Current page, queued/scanned/skipped URLs, retry count, last error, partial issue streaming |
| Queue page control | Implemented | `main.py` `POST /scans/{id}/queue/{remove,prioritize}` | Remove or move-to-front discovered pages while queued/running; persisted and honored by the worker |
| Streaming partial results | Implemented | `scan_repository.py` (`update_scan_progress`), `frontend/src/hooks/useDashboardScan.ts` | Issues are persisted after each page and polled into the dashboard before the scan completes |
| Scan cancellation | Implemented | `POST /scans/{id}/cancel`, `scan_repository.py`, `scan_worker.py`, dashboard UI | Queued scans become `cancelled` immediately; running scans set `cancel_requested_at` and stop between pages without retrying; partial results are kept; UI stops polling and locks queue controls |
| Worker replica scaling | Implemented | `docker-compose.yml` | `SCAN_WORKER_REPLICAS` + `deploy.replicas`; safe via `SKIP LOCKED` |

### 2.3 Accounts, authentication, and session scoping

| Feature | Status | Where | Notes |
|---|---|---|---|
| Email/password sign-up and login | Implemented | `main.py` `/auth/signup`, `/auth/login`, `auth_service.py` | PBKDF2-HMAC-SHA256, 260k iterations |
| JWT access tokens | Implemented | `auth_service.py` | HS256, 7-day TTL, `jti` claim |
| Server-side session revocation | Implemented | `models/auth.py`, `auth_repository.py` | SHA-256 of `jti` stored; logout revokes; auth requires a live session row |
| Google sign-in | Implemented | `main.py` `POST /auth/google`, `frontend/src/lib/auth-options.ts`, `components/auth/GoogleButton.tsx` | Env-gated; server-to-server token exchange guarded by `X-OAuth-Proxy-Secret`; returns 503 when unconfigured |
| Password reset (forgot/reset) | Implemented (no email delivery) | `main.py` `/auth/forgot-password`, `/auth/reset-password`, migration `f071` | Hashed reset tokens with TTL; reset link is logged locally when `PASSWORD_RESET_LOG_LINKS=true` |
| Auth.js credentials session | Implemented | `frontend/src/lib/auth-options.ts`, `lib/contexts/AuthContext.tsx` | Remember-me controls 12 h vs 7 days; bearer token forwarded to the backend API |
| Route protection | Implemented | `frontend/src/middleware.ts`, `DashboardShell.tsx` | Middleware guard + client-side fallback redirect to `/login` |
| Per-user data scoping | Implemented | repositories | Scans, issues, preferences, suggestions scoped by `user_id`; cross-user access returns 404 |
| Profile management (name/email/password change) | Planned | — | No endpoints or UI |

### 2.4 Reports, history, and comparison

| Feature | Status | Where | Notes |
|---|---|---|---|
| Saved-scan history API | Implemented | `main.py` `GET /scans` | Pagination, status/mode/text filters, `cancelled` status included |
| Saved-scan detail | Implemented | `main.py` `GET /scans/{id}` | Full issue list, locators, screenshots, `cancel_requested_at` |
| Scan history screen | Implemented | `frontend/src/app/(dashboard)/scan-history/page.tsx` | Server pagination, filters (incl. Cancelled), metrics, status pills |
| Comparison mode | Implemented | `components/scan-history/ScanHistoryCompareView.tsx` | Pick 2 scans; score/total/high deltas; new/resolved/persistent by rule+locator identity |
| Report screen | Implemented | `app/(dashboard)/reports/page.tsx` | Score ring, severity bars, WCAG principles, per-page grouping, skipped pages |
| Per-page issue grouping | Implemented | `components/reports/PagesTab.tsx` | Scanned/skipped page lists, element cards, locator panel |
| Report exports | Implemented (CSV + print) | `components/reports/ExportBar.tsx`, `export-utils.ts` | CSV download; "PDF" = browser print-to-PDF; no JSON export |
| Export all AI patch bundles | Implemented | `GET /scans/{id}/repair-suggestion-bundle`, `components/reports/AiSuggestionsTab.tsx`, `lib/download.ts` | Markdown or JSON bundle covering every issue group (generated fixes + "not yet generated" list), downloaded from the report AI tab with generated/missing counts |
| Mark single issue resolved | **Scaffold** | `components/issues/IssueDetailPanel.tsx` | Button rendered, disabled, no API |
| Single-scan delete | **Planned** | — | Only bulk `DELETE /scans` exists |

### 2.5 AI repair suggestions

| Feature | Status | Where | Notes |
|---|---|---|---|
| Grouping of similar issues | Implemented | `repositories/repair_suggestion_repository.py` | `group_key` from rule + severity + normalized message + WCAG tags + source; titles/affected pages/counts |
| Provider support | Implemented | `services/repair_suggestion_service.py` | OpenAI (Responses API, JSON schema) and DeepSeek (chat completions, JSON mode); model resolution per provider |
| Persisted suggestions | Implemented | `models/repair_suggestion.py` | One suggestion per `(user, scan, group_key)`; regenerate with `force` |
| Structured output | Implemented | `schemas/` + service | Explanation, impact, recommended fix, optional before/after code, confidence, limitations |
| Generation UI | Implemented | `components/reports/AiSuggestionsTab.tsx` | Generate/regenerate, provider–model label, before/after diff, limitations |
| Patch-bundle export | Implemented | `services/repair_bundle_service.py`, `components/reports/AiSuggestionsTab.tsx` | One downloadable document for all groups |
| Automatic generation on completion | **Scaffold** | `preferences.auto_generate_suggestions` | Persisted preference; no background generation path |
| Per-issue automatic code repair | **Planned** | — | Checklist open item |
| Conversational remediation assistant | **Planned** | — | Checklist/README open item |

### 2.6 Preferences and notifications

| Feature | Status | Where | Notes |
|---|---|---|---|
| Preferences API + UI | Implemented | `main.py` `/preferences`, `components/preferences/*` | Draft/save/discard flow, section nav, reset |
| Encrypted API keys | Implemented | `utils/encryption.py`, `preferences_repository.py` | Fernet at rest; only `has_api_key` returned; deterministic fallback key when `ENCRYPTION_KEY` unset |
| AI provider/model defaults | Implemented | `AiProviderSection.tsx`, `repair_suggestion_service.py` | OpenAI/DeepSeek model lists |
| Crawl defaults in scans | Implemented | `services/scan_options_resolver.py` | Mode, page limit, depth, delay, timeout, ignored patterns, scope/robots/crawl-memory flags now applied to scans |
| WCAG standard selection | Implemented | `WcagStandardSection.tsx`, `axe_scanner.py` | Version/level preference maps to axe tags; default `wcag21aa` |
| Notification preferences | Implemented | `models/preferences.py`, `NotificationsSection.tsx` | `notify_on_*`, score threshold (enabled + 0–100 value) and severity list persist through `PUT /preferences` |
| In-app notification delivery | Implemented | `lib/scan-notifications.ts`, `components/home/ScanNotifications.tsx` | Accessible dismissible banners after terminal scans: complete, failed, high severity, low score; cancelled always neutral |
| Email notifications | **Scaffold** | `preferences.email_*` | Fields exist; no email transport |
| Appearance (theme/density/contrast) | **Scaffold** | `AppearanceSection.tsx`, `globals.css` | Persisted but never applied at runtime |
| Danger zone (clear history / reset prefs) | Implemented | `DangerZoneSection.tsx`, `DELETE /scans`, `POST /preferences/reset` | Confirmation dialogs |

### 2.7 Frontend experience

| Screen | Status | Purpose |
|---|---|---|
| `/` | Implemented | Public marketing landing page (hero, features, how-it-works, accessibility band, CTA) |
| `/about` | Implemented | Public mission/story/principles page |
| `/login`, `/register` | Implemented | Credentials + Google sign-in, validation, password strength, remember-me |
| `/forgot-password`, `/reset-password` | Implemented | Password reset flow |
| `/signup` | **Scaffold** | Legacy duplicate signup screen outside route groups; off design system |
| `/dashboard` | Implemented | Scan launcher, live progress/queue, cancel control, notifications, metrics, severity overview, issue list |
| `/issues` | Implemented | Saved-scan issue browser with filters and detail panel |
| `/scan-history` | Implemented | Paginated history (incl. Cancelled) and comparison mode |
| `/reports` | Implemented | Score/severity/WCAG summary, per-page report, AI suggestions tab with patch-bundle export |
| `/preferences` | Implemented | Six settings sections with backend persistence |

### 2.8 Data, DevOps, and quality

| Feature | Status | Where | Notes |
|---|---|---|---|
| PostgreSQL schema | Implemented | `backend/app/models/*`, `backend/alembic/versions/*` | 7 tables: users, user_sessions, password_reset_tokens, scan_runs, scan_issues, app_preferences, repair_suggestions |
| Alembic migrations | Implemented | `backend/alembic/` | 17 revisions, single head `9848b576f075`; run automatically by `start.sh` |
| Production Docker stack | Implemented | `docker-compose.yml` | db, backend, scan-worker, frontend; healthchecks; worker replicas |
| Development Docker stack | Implemented | `docker-compose.dev.yml` | Hot reload via bind mounts |
| CI quality gate | Implemented | `.github/workflows/quality-gate.yml` | 4 jobs: frontend typecheck + Vitest, production build, Playwright E2E, backend compileall + pytest |
| Frontend production build gate in CI | Implemented | `.github/workflows/quality-gate.yml` (`frontend-build`) | `npm run build` gated on every push/PR |
| Browser E2E suite | Implemented | `frontend/e2e/*.spec.ts`, `frontend/playwright.config.ts` | 8 Playwright tests across 5 specs, backend mocked via `page.route()`, runs against a production build; no DB/backend needed. Port is configurable (`E2E_PORT`) so local runs cannot silently reuse a foreign server on port 3000 |
| Worker browser reuse | Implemented | `backend/app/scan_worker.py` (`WorkerBrowserManager`) | One Playwright/Chromium per worker process, reused across jobs (crash/disconnect recovery, recycle every `SCAN_BROWSER_MAX_JOBS`); `SCAN_BROWSER_REUSE_ENABLED=false` restores per-scan lifecycle |
| Scanner performance tuning | Implemented | `backend/app/services/page_scanner.py` | Render waits configurable (`SCAN_RENDER_IDLE_TIMEOUT_MS`, `SCAN_RENDER_SETTLE_MS`), screenshot cap (`SCAN_MAX_SCREENSHOTS`), multi-page time budget (`SCAN_MAX_SECONDS`), phase timings in responses + structured worker log |
| Vendored axe-core | Implemented | `backend/app/assets/axe.min.js` | Pinned 4.10.2 (MPL-2.0, SHA-256 recorded), loaded from disk with CDN fallback only; warmed at worker start |
| DB indexes (migration f075) | Implemented | `backend/alembic/versions/9848b576f075_*` | `(user_id, started_at)`, `(status, started_at)`, `(status, heartbeat_at)`, `(scan_run_id, position)` |
| Query/persistence optimisation | Implemented | `backend/app/repositories/scan_repository.py` | Crawl-memory lookup loads only URL columns (20,200 → 0 ORM rows); history list N+1 removed (45 → 3 SQL); incremental issue appends replace delete+reinsert (2,500 → 500 row writes) with retry cleanup |
| Lightweight polling | Implemented | `GET /scans/{id}?include_issues=false`, `frontend/src/hooks/useDashboardScan.ts` | Status/summary polls each 2 s; full issue fetch only when the issue count changes or the scan is terminal |
| Rate limiting + SSRF hardening | Implemented | `backend/app/services/rate_limit.py`, `backend/app/utils/url_utils.py` | Token buckets on scan/auth endpoints (429 + Retry-After, per-process caveat documented); `SCAN_ALLOW_PRIVATE_TARGETS=false` blocks private/loopback targets and re-validates post-redirect URLs |
| Metrics + observability | Implemented | `GET /metrics`, `backend/app/services/metrics.py`, worker `scan_timing` log | Prometheus text counters/histogram/gauges (scan status/duration/issues, queue depth, rate limits), per-scan JSON phase log, slow-scan warning (`SCAN_SLOW_LOG_SECONDS`) |
| DB connection pool config | Implemented | `backend/app/db.py` | `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT`, `DB_POOL_RECYCLE`, `DB_POOL_PRE_PING` for PostgreSQL |
| Coverage reporting/thresholds | **Planned** | — | No coverage tooling configured |
| Hosted deployment verification evidence | **Planned** | — | Render/Vercel setup documented only |
| Backend tests | Implemented | `backend/tests/` | 201 tests (14 files): API/pref/bundle/cancel smoke, auth, scanner, performance unit suites (browser reuse, render waits, screenshots, axe asset, timings, SSRF), repositories, worker |
| Frontend tests | Implemented | `frontend/src/**/*.test.*` | 42 tests (11 files): dashboard hook (streaming, lightweight polling, cancel), notifications, queue/progress panels, report pages/export, preferences, saved-scan mapping |

## 3. End-to-end flows

1. **Single-page (synchronous):** `POST /scan/page` → bearer auth → preference resolution → URL validation → Playwright render → custom checks + axe (WCAG-tagged) → dedup/merge → screenshots → score + persistence → live result with `scan_id`.
2. **Queued / worker:** `POST /scan/page` with worker mode → saved `queued` run (resolved options snapshot) → scan-worker claims it → progress persisted per page (partial issues) → dashboard polls `GET /scans/{id}` → terminal `complete` / `error` / `cancelled`.
3. **Cancellation:** `POST /scans/{id}/cancel` → queued: immediate `cancelled`; running: `cancel_requested_at` set, worker checks between pages → `cancelled` (no retry, partial issues kept) → dashboard stops polling and reports the cancelled state.
4. **Multi-page crawl:** BFS from the submitted URL, bounded by page limit/depth, robots/ignore/scope filters, crawl memory skips, queue metadata and partial results streamed to the UI, user can remove/prioritize queued pages or cancel.
5. **Reports & comparison:** saved scan → report mapping (score/severity/pages) → per-page locator guidance; history compare computes deltas and new/resolved/persistent sets; CSV/print export.
6. **AI suggestions & bundle:** report group listing → POST generate (decrypt user key, provider call, persist once per group) → display; `GET /scans/{id}/repair-suggestion-bundle` renders one downloadable markdown/JSON document for every group, including groups that still need generation.

## 4. Gap register

| Gap | Type | Impact |
|---|---|---|
| Theme, density, high-contrast stored but unused | Scaffold | Preferences UI promises behavior that does not happen |
| Email notification fields and reset email delivery | Scaffold | No transport (password reset logs links locally) |
| Single-scan delete, mark-resolved, per-issue auto-fix | Planned | Data-management and remediation depth |
| Conversational remediation assistant | Planned | Explicit roadmap item |
| Coverage reporting/thresholds and lint gate | Planned | Quality tooling depth |
| Hosted deployment verification evidence | Planned | Deployment documented but not evidenced |
| Severity model collapses 4 levels to 3 | Design mismatch | Design tokens expose critical/serious/moderate/minor; storage does not |
| Private-target scanning allowed by default (`SCAN_ALLOW_PRIVATE_TARGETS=true`) | Security | Needed for local demo/benchmark fixtures; production must set `false`. Residual DNS-rebinding risk; network egress policy recommended |
| Hardcoded secret fallbacks (`AUTH_JWT_SECRET`, Fernet key) | Security | Unsafe defaults if env vars are missing (fail-fast is a documented follow-up) |
| Rate limiting is per-process | Scalability | Multi-instance deployments need a shared store (Redis) or edge/WAF limits |
| Intra-crawl parallelism and reduced network-idle observation | Performance follow-up | Remaining floor ≈508 ms/page idle wait + ~150 ms axe; parallelism deferred (CPU-contention risk on small workers) — see `scan-performance-analysis.md` §14 |
| `database/` and root `tests/` folders empty; `tsconfig.tsbuildinfo` tracked despite AGENTS.md guidance | Hygiene | Minor doc/repo consistency issues |

## 5. Repository state notes

- Branch reconciliation (2026-11-02): `master` was merged into `fullstack-dev`; the merged tree was byte-identical to `master` (`git diff master` empty) while preserving all commit history. Local `master` was fast-forwarded to the same tip `4e329f6`. Safety tag: `safety-pre-merge-20261102`. Nothing was pushed.
- The pre-merge `fullstack-dev` contained no content that `master` lacked: the credentials-auth work was re-implemented as a superset in `master`'s Google-sign-in commit.
- The 2026-11-02 feature batch (patch-bundle export, preference-driven scans, notification preferences + in-app delivery, scan cancellation, E2E/build CI gate) was committed as `a2bc609`.
- The 2026-11-03 performance batch (worker browser reuse, wait tuning, screenshot cap, vendored axe, timings/budget, SSRF, DB indexes and query/persistence fixes, lightweight polling, rate limiting, metrics, E2E port parameterisation) is implemented, verified, and committed as `9189dc1` together with the analysis, baseline and results documents.
- Frontend dependencies are installed (`npm ci`) plus `@playwright/test`; stale `.next` artifacts were removed before typechecking. The Playwright suite runs against `next build && next start` (not `next dev`) because dev-server HMR recompiles during a run made multi-test runs flaky; it also supports `E2E_PORT` to avoid local port collisions.
- E2E output folders and reports are gitignored.
- `master`'s docs were accurate against its code at merge time; the current checklist is `211 done / 4 open`, the implementation log carries the dated entries through 2026-11-03, and the migration head is `9848b576f075`.

## Appendix A — API endpoints (25)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | — | API alive |
| GET | `/health` | — | Health probe |
| GET | `/test/page-bad` | — | Deterministic broken demo page |
| GET | `/test/page-js-rendered` | — | JS-injected violations demo |
| POST | `/scan/page` | Bearer | Run single/multi-page scan (fields optional; preference fallback) |
| POST | `/auth/signup` | — | Create account + session |
| POST | `/auth/login` | — | Credentials login |
| GET | `/auth/me` | Bearer | Current user |
| POST | `/auth/logout` | Bearer | Revoke session |
| POST | `/auth/google` | Proxy secret | Exchange Google profile for backend session |
| POST | `/auth/forgot-password` | — | Issue reset token/link |
| POST | `/auth/reset-password` | — | Consume reset token |
| GET | `/scans` | Bearer | Paginated scan history (status/mode/text filters) |
| GET | `/scans/{scan_id}` | Bearer | Scan detail with issues; `include_issues=false` returns status/summary only (lightweight polling) |
| GET | `/scans/{scan_id}/repair-suggestion-groups` | Bearer | Issue groups + cached suggestions |
| POST | `/scans/{scan_id}/repair-suggestion-groups/{group_key}/generate` | Bearer | Generate/regenerate AI suggestion |
| GET | `/scans/{scan_id}/repair-suggestion-bundle` | Bearer | Export all suggestions (`format=markdown\|json`) |
| POST | `/scans/{scan_id}/cancel` | Bearer | Cancel queued scan or request running scan stop |
| POST | `/scans/{scan_id}/queue/remove` | Bearer | Exclude a queued URL |
| POST | `/scans/{scan_id}/queue/prioritize` | Bearer | Move a queued URL to the front |
| DELETE | `/scans` | Bearer | Delete all scans for the user |
| GET | `/metrics` | — | Prometheus text metrics (404 when `METRICS_ENABLED=false`) |
| GET | `/preferences` | Bearer | Read preferences |
| PUT | `/preferences` | Bearer | Partial update preferences |
| POST | `/preferences/reset` | Bearer | Reset to defaults |

## Appendix B — Frontend page routes

`/`, `/about`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/signup` (legacy), `/dashboard`, `/issues`, `/scan-history`, `/reports`, `/preferences`, plus `/api/auth/[...nextauth]`.

## Appendix C — Database tables (7)

`users`, `user_sessions`, `password_reset_tokens`, `scan_runs`, `scan_issues`, `app_preferences`, `repair_suggestions`.
Migration head: `9848b576f075` (17 revisions, linear). f075 adds performance indexes: `ix_scan_runs_user_id_started_at`, `ix_scan_runs_status_started_at`, `ix_scan_runs_status_heartbeat_at`, `ix_scan_issues_scan_run_id_position`. Recent columns: `app_preferences.notify_score_threshold_enabled`, `notify_score_threshold`, `notify_severities`, `scan_runs.cancel_requested_at`.

## Appendix D — Test inventory

- Backend (201 across 14 files): the 12 feature-era suites plus `test_scan_perf_unit.py` (44: browser reuse/recycle/disconnect, render-wait config, screenshot cap, vendored axe, timings/budget, SSRF matrix, fallback fix) and `test_perf_api_unit.py` (27: indexes, incremental persistence, include_issues, rate limiting, metrics). All use mocked/in-memory services — no database or network required.
- Frontend unit/component (42 across 11 files): dashboard hook/streaming/lightweight-polling/cancel (5), scan notifications (3), notification prefs (6), scan toolbar (4), progress panel (2), queue panel (2), AI suggestions/export (6), pages tab (2), download helper (2), notification policy (8), saved-scan mapping (2).
- Browser E2E (8 across 5 specs): landing, register, login validation, dashboard guard, mocked scan + issues, cancel confirm/cancel/dismiss flows. Run with `npm run test:e2e`; set `E2E_PORT` if the default port 3000 is already in use.
- Commands:
  - Backend: `cd backend; .\venv\Scripts\python.exe -m pytest -q tests`
  - Frontend: `cd frontend; npx tsc --noEmit; npm test`
  - Browser: `cd frontend; npm run test:e2e`
  - Build: `cd frontend; npm run build`
  - Performance harness: `backend\venv\Scripts\python.exe scripts\perf\bench_scan.py` and `...\bench_db.py`

## Update rule

When a feature changes status, update `feature-checklist.md` first (source of truth), then adjust this inventory's status row and note the date. Append verification evidence to `implementation-log.md`.
