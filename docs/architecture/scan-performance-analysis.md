# Scan Performance Analysis and Optimization

**Role:** system design + performance engineering review
**Status:** complete — analysis, implementation, and measured before/after comparison
**Baseline evidence:** [`performance-baseline.md`](./performance-baseline.md) + [`scripts/perf/baseline.json`](../../scripts/perf/baseline.json) + [`db_baseline.json`](../../scripts/perf/db_baseline.json)
**Optimized evidence:** [`performance-results.md`](./performance-results.md) + `scripts/perf/optimized.json` + `db_optimized.json` (+ controlled same-harness baseline recheck `baseline_recheck.json`)
**Measured on:** Intel Core i7-10750H (6 cores / 12 threads), 23.8 GB RAM, Windows 11, Python 3.13.3, Playwright 1.58.0, Chromium 145. Android/desktop clients are out of scope.

---

## 1. Executive summary

AccessAudit's scan latency was dominated by fixed overheads, not by accessibility analysis itself. On deterministic local fixtures, a clean single-page scan took **2,783 ms** while the actual page work (navigation, DOM parse, checks, axe-core) accounted for a few hundred milliseconds. The rest was architecture:

| Rank | Bottleneck | Measured baseline | Share of relevant scenario |
|---|---|---|---|
| 1 | **Per-scan Playwright driver + Chromium lifecycle** | **1,684 ms/scan** (setup 948–1,171 ms + teardown 709–1,030 ms) | 60.6 % of a clean single-page scan; 26 % of a 5-page crawl |
| 2 | **Render waits** (`networkidle` 508 ms + fixed settle 387 ms) | **895 ms/page** | 61.7 % of a delay-free 5-page crawl |
| 3 | **Screenshot capture** (19 unique captures × 79.7 ms) | **1,517 ms/scan** | 35.3 % of an issue-dense single-page scan |
| 4 | **Crawl-memory query** eager-loads every issue of every completed scan | **815 ms**, **20,200 ORM rows** per multi-page request | blocks each multi-page enqueue |
| 5 | **Progress write amplification** (delete + reinsert all issues per publish) | **2,500 row writes for 500 final rows** (5.0×), 130 ms/crawl | grows with issue count |
| 6 | **History list N+1** (`_fallback_scanned_page_urls` lazy-loads issues) | **45 SQL statements / 100.6 ms** at `limit=50` vs 2 / 1.35 ms filtered | 30–70× API latency |
| 7 | **Polling payload growth** (frontend polls full scan incl. all issues every 2 s) | payload ∝ issue count × 30 polls per scan | network + JSON serialization |
| 8 | **axe-core CDN fetch at scan time** (553 KB, 294 ms) once per process | 274–376 ms cold penalty on the first scan | cold start / worker restart |
| 9 | **Configurable per-page crawl delay** | 1,001 ms of literal sleep per 5-page crawl at the 250 ms default | 11.7 % of the default crawl |

The strategy was deliberately **not** "rewrite it async" or "add Redis/Celery". The system already has correct queue semantics (`FOR UPDATE SKIP LOCKED`), retries, stale recovery, cancellation, and partial-result streaming. The largest wins came from **keeping expensive resources alive**, **removing self-imposed waits**, **capping unbounded work**, and **fixing accidental O(history) queries** — changes that are small, reversible, and preserve observable behaviour.

**Measured outcome (production shape, baseline per-job lifecycle → worker-level browser reuse; full tables in §8 and [`performance-results.md`](./performance-results.md)):** single-page clean **2,783 → 850 ms (−69 %)**; single-page issue-dense with screenshots **4,280 → 1,585 ms (−63 %)**; 5-page crawl **7,254 → 4,189 ms (−42 %)** (delay 0) and **8,577 → 5,190 ms (−40 %)** (250 ms default delay). Render wait **−277 ms/page**, screenshot pipeline **−45.6 %**, crawl-memory lookup **797.5 → 14.9 ms (−98 %)** / **20,200 → 0 ORM rows**, progress-publish row writes **2,500 → 500 (−80 %)**, history list **92.4 → 8.2 ms (−91 %)**. Functional equivalence verified (issue/rule/severity/source counts identical) except the two intended changes: screenshot cap and the fixed raw-HTML fallback now running axe-core. Like-for-like per-call deltas were independently confirmed with a same-harness recheck of the baseline commit.

## 2. Scope, workloads, and method

### 2.1 Workload model

Two production-relevant workloads:

1. **Single-page scan** (`mode=single`) — the dashboard's default quick scan. In production (`SCAN_EXECUTION_MODE=worker`) it is enqueued and executed by the scan-worker; locally it can run synchronously inside the API request.
2. **Multi-page crawl** (`mode=multi`) — bounded BFS crawl (dashboard cap 5 pages), always worker-backed in production. Per-page: Playwright render → custom HTMLParser checks → axe-core → merge; screenshots only on single-page scans.

All scenarios run through the production multi-page path (`run_browser_analysis_for_multi=True`), matching `docker-compose` worker settings.

### 2.2 Fixtures and reproducibility

`scripts/perf/bench_scan.py` serves deterministic pages from a local HTTP server and calls `scan_page()` directly (no FastAPI, no DB, no auth):

- clean page, issue-dense page (22 issues: 7 high / 14 medium / 1 low, 16 axe + 4 both + 2 custom), JS-rendered SPA, 5-page linked set, raw-HTML fallback, cold-process runs, lifecycle micro-benchmark.
- 1 warm-up + ≥5 measured iterations (7 single, 5 multi); median/p90/stdev/CV reported; phase attribution reconciles to 0.00–0.73 % unattributed.
- `scripts/perf/bench_db.py` seeds 200 complete scans × 100 issues + 20 queued + 2 users in in-memory SQLite and counts SQL statements, ORM rows, and row writes per operation. SQLite is optimistic vs PostgreSQL; **statement/row counts are the portable evidence**, timings are directional.
- Host calibration before/after the run: +3.8 % drift, contention flag false; scanner CV 0.39–1.95 % on meaningful scenarios (<5 % differences are noise).

### 2.3 What this analysis does and does not cover

**Covers:** scan pipeline CPU/IO, worker lifecycle, DB read/write patterns, API payloads, queue/worker concurrency, security-adjacent costs (SSRF validation, rate limiting), observability.

**Does not cover:** external-site network variance (site server latency dominates real scans and cannot be optimized away), Cloudinary upload latency when configured (network-bound; uploads already run concurrently), Render/Vercel instance sizing (modelled in §11, not exercised), browser rendering variance across sites.

## 3. Current architecture (as-is)

```
Next.js dashboard ──POST /scan/page──► FastAPI ──► scan_runs row (status=queued, options snapshot)
      │                                   │
      │ (2 s polling GET /scans/{id})     └── background mode (dev): BackgroundTasks runs crawl in-process
      ▼
FastAPI ◄──── scan_worker (separate process) ──claims job──► Playwright Chromium ──► custom checks + axe-core
      │                                   │                     │
      └── GET /scans/{id} ◄── PostgreSQL ◄┘                     └── screenshots (single-page only)
```

Relevant properties:

- **Queue:** PostgreSQL table `scan_runs`; claiming uses `SELECT … FOR UPDATE SKIP LOCKED` (safe multi-worker), retry counter (max 3), stale recovery by heartbeat (300 s default), cancellation flag, partial issue streaming.
- **Worker loop:** claim → run → persist partial issues per page → complete; poll interval 0.5 s; one job at a time per worker process; horizontal scaling via Compose `deploy.replicas`.
- **Scanner:** one `BrowserSession` (Playwright driver + Chromium) per `scan_page()` call, created lazily and **closed at the end of the call** — including when the worker immediately claims the next job.
- **Render policy:** `domcontentloaded` navigation → `networkidle` (cap 3 s) → fixed settle 250–600 ms → `page.content()` → parse → axe.
- **Screenshots:** one per unique selector, sequential capture (~80 ms each), concurrent storage.
- **Persistence:** partial publishes **delete and reinsert all issues accumulated so far**; completion repeats a final replace.
- **API reads:** history list and crawl-memory lookup eager-load issues.
- **Axe:** downloaded from cdnjs at first scan in each process, cached in memory.

## 4. Baseline results

### 4.1 Scanner scenarios (median ms, n=7 single / n=5 multi)

| Scenario | median | p90 | stdev | CV % | issues | ms/page |
|---|---|---|---|---|---|---|
| single_clean | **2,783.3** | 2,795.3 | 19.8 | 0.71 | 0 | 2,783.3 |
| single_issue_dense (screenshots) | **4,279.9** | 4,348.4 | 52.3 | 1.22 | 22 | 4,279.9 |
| single_issue_dense (no screenshots) | **2,827.7** | 2,854.8 | 42.6 | 1.51 | 22 | 2,827.7 |
| single_js_rendered_spa | **3,543.6** | 3,644.2 | 69.5 | 1.95 | 8 | 3,543.6 |
| multi_5_pages (delay 0) | **7,254.4** | 7,280.1 | 28.2 | 0.39 | 9 | 1,450.9 |
| multi_5_pages (delay 250 ms) | **8,577.3** | 8,640.3 | 47.9 | 0.56 | 9 | 1,715.5 |
| raw-HTML fallback | **14.4** | 16.0 | 7.3 | 76.6 | 6 | 14.4 |

### 4.2 Phase attribution (ms per scenario, top-level)

| Phase | clean | dense+screenshots | multi (delay 0) | multi (delay 250) |
|---|---|---|---|---|
| browser_setup (driver start + launch) | 971.2 | 948.0 | 1,171.4 | 1,180.0 |
| goto (domcontentloaded) | 14.9 | 15.3 | 66.4 | 76.1 |
| render_wait (networkidle + settle) | 895.6 | 898.1 | **4,477.1** | 4,458.0 |
| axe_core | 164.7 | 182.0 | 743.6 | 752.7 |
| screenshots | 0 | **1,516.9** | 0 | 0 |
| request_delay (literal sleep) | – | – | – | 1,001.5 |
| browser_close | 713.1 | 718.4 | 713.5 | 1,029.6 |
| context close + page content + parse + merge | 18.5 | 15.3 | 72.1 | 71.8 |

### 4.3 Lifecycle micro-benchmark

| Operation | median | notes |
|---|---|---|
| `sync_playwright().start()` (driver) | 899.9 ms | dominant fixed cost |
| `chromium.launch()` | 96.6 ms | |
| context + page + about:blank nav | 109.6 ms | |
| `browser.close()` (with a used page) | 563.5 ms | not free |
| `playwright.stop()` | 18.5 ms | |
| **Derived setup + teardown** | **1,716.0 ms** | matches scenario phases |

Cold process (first scan in a new process): 4,759.5 ms vs 4,249.5 ms by the third scan — the difference is ~275 ms of axe CDN fetch plus first-run driver warm-up.

### 4.4 Database operations (SQLite synthetic: 200 scans × 100 issues)

| Operation | median | SQL | ORM rows |
|---|---|---|---|
| `get_previously_scanned_page_urls_for_domain` | **815.3 ms** | 2 | **20,200** |
| `list_saved_scans(limit=50)` | **100.6 ms** | **45** | 50 |
| `list_saved_scans(limit=10)` | 24.9 ms | 12 | 10 |
| `list_saved_scans(status filter)` | 1.4 ms | 2 | 10 |
| `get_saved_scan` (100 issues) | 4.8 ms | 2 | 101 |
| 5-page progress publishing (100 issues/page) | **130.0 ms** | 26 | 5 |
| ↳ amplification | 1,500 INSERT + 1,000 DELETE for 500 final rows | – | 5.0× row writes/issue |
| `claim_next_queued_scan` / stale recovery | 1.1 / 1.75 ms | 3 / 2 | 1 / 20 |

## 5. Bottleneck analysis

### 5.1 Per-job browser lifecycle — 1.7 s/scan (the dominant fixed cost)

**Evidence:** 1,716 ms derived lifecycle (driver 900 + launch 97 + browser close 564 + driver stop 18.5 + context overhead); 60.6 % of a clean scan and 38.8 % of an issue-dense scan; 26 % of a 5-page crawl.

**Root cause:** `scan_page()` constructs a `BrowserSession` and always closes it in a `finally` block. The scan-worker then claims the next job and pays the same cost again. The Playwright sync driver start/stop dominates, and Chromium teardown with a used page costs ~564 ms.

**Why it was never an issue locally:** the browser is reused within a scan job (the July overhaul removed per-*page* launches). The remaining cost is per-*job*, which only matters when a worker runs many jobs — the production shape.

**Fix direction:** keep one `BrowserSession` alive for the worker process and pass it into `scan_page()`; bound the risk with health checks (recreate after crash/disconnect) and an env kill-switch.

### 5.2 Render waits — 895 ms/page

**Evidence:** networkidle 508–512 ms + fixed settle 384–389 ms = 895 ms/page; 4,477 ms (61.7 %) of a delay-free 5-page crawl; 1,050 ms for the SPA fixture.

**Root cause:** `networkidle` inherently requires ~500 ms of network silence, and the code then adds a fixed 250–600 ms sleep "to be safe". For normal pages the settle adds nothing (DOM checks run on `page.content()` after load); for the demo SPA the injected content arrives at 150 ms, already covered by the network-idle window.

**Correctness risk of cutting too far:** a page that renders content via a timer *after* the network goes idle could be under-scanned. Mitigation: keep networkidle (it subsumes the 500 ms quiet window), reduce the redundant settle, keep the knob configurable, and add a documented "thorough" profile for edge cases.

### 5.3 Screenshot capture — 1.5 s on issue-dense pages

**Evidence:** 19 unique captures × 79.7 ms = 1,516.9 ms (35.3 %); screenshot storage is only 2.2 ms without Cloudinary.

**Root cause:** per-issue screenshots are a product feature, but the count is unbounded — the same page can generate dozens of captures (the fixture generated 19 because axe reports `region` 10×). Each capture = scroll-into-view + bounding box + clipped screenshot on a live page.

**Trade-off:** screenshots are the most expensive "nice to have". Capping per page (e.g. 10) preserves the demo/report value for the most important issues while bounding worst-case latency; a future improvement is prioritising by severity and deduplicating identical regions.

### 5.4 Crawl-memory lookup — 815 ms and 20,200 rows per multi-page request

**Evidence:** the query itself issues only 2 SQL statements but eager-loads every issue of every completed scan of the user (`selectinload(ScanRun.issues)`), then filters hostnames in Python: 200 scans × 100 issues = 20,200 ORM rows, 815 ms, on every multi-page enqueue when crawl memory is enabled.

**Root cause:** a Python-side filter over a full history read; `scanned_page_urls` (a JSON column) already contains everything needed, so loading issues is unnecessary. This grows linearly with user history — a classic O(history) path in a request handler.

### 5.5 History list N+1 — 45 SQL / 100 ms at `limit=50`

**Evidence:** filtered lists use 2 statements and ~1.4 ms; unfiltered lists use 45 statements and 100.6 ms. `to_saved_scan_list_item` falls back to `_fallback_scanned_page_urls` for queued/running rows whose `scanned_page_urls` is empty; the fallback touches `scan_run.issues`, lazy-loading one SELECT per row.

**Impact:** the history screen and any dashboard call that lists scans gets slower as the user accumulates active/failed runs. Fix: make the fallback derive from already-loaded URL columns only (or preload once), never lazy-load per row.

### 5.6 Progress write amplification — 5 row-writes per final issue

**Evidence:** with 5 pages × 100 issues, publishing cumulative progress after each page performs 1,500 INSERTs + 1,000 DELETEs for 500 final rows (3× insert amplification, 5× total churn), 26 SQL per crawl, 130 ms cumulative (SQLite). Postgres will have higher per-row cost.

**Root cause:** `_replace_scan_issue_records` deletes and reinserts **all** issues on every publish. It is idempotent (good for retries) but O(n²).

**Fix direction:** append only the new tail on publish, clear partial rows when a retry re-claims the job, keep the final authoritative replace on completion.

### 5.7 Frontend polling payload — O(issues) × 30 polls

**Evidence (code):** `useDashboardScan` polls `GET /scans/{id}` every 2 s up to 180 attempts; the response includes every accumulated issue and full page-URL arrays. For a 5-page scan with hundreds of issues, each poll re-serialises the whole issue list (30 identical large responses per minute).

**Fix direction:** lightweight status poll (`include_issues=false`) returning summary/queue/status only; fetch the full issue list only when the summary count changes or the scan reaches a terminal state. Also collapses the network cost for mobile users.

### 5.8 axe-core CDN cold fetch + latent fallback defect

**Evidence:** 553,283-byte axe-core 4.10.2 download costs 294 ms once per process (274–376 ms penalty), and is a third-party runtime dependency with availability risk. Separately, perf-harness found that `_run_playwright_analysis` references an undefined `options` variable; the swallowed `NameError` makes the raw-HTML fallback silently return **custom-only** results (6 issues vs 22 with axe on the fixture). This is a correctness bug that also hides the true cost of the fallback path.

**Fix direction:** vendor axe-core with a pinned version/hash and load it from disk (CDN fallback only if missing), warm it at worker start; fix the fallback to actually run axe.

### 5.9 Per-page crawl delay — politeness vs latency

**Evidence:** 1,001 ms of literal `sleep` for a 5-page crawl at the 250 ms preference default (+ ~310 ms extra teardown after idle gaps), 11.7 % of the default crawl.

**Trade-off:** the delay exists to avoid hammering sites. It should stay configurable (and is a user preference), but the default and documentation should make the cost explicit; benchmarks report both delay 0 and delay 250.

### 5.10 Concurrency model

The worker runs **one job per process**; throughput scales by replicas (`deploy.replicas`, safe via `SKIP LOCKED`) rather than intra-process concurrency. This is the right default for CPU-bound Chromium work on small instances (1 vCPU on cheap tiers). Two follow-ups are considered in §14: bounded intra-crawl page parallelism and worker concurrency, both gated behind measurements.

## 6. Prioritisation: what to do, what not to do

Scoring: impact = measured share; effort = days; risk = regression/ops risk. Only changes with a clear measured bottleneck were implemented.

| Change | Impact | Effort | Risk | Decision |
|---|---|---|---|---|
| Worker-level browser reuse | −1.7 s/job (up to 60 % of short scans) | S | M (crash/memory handling) | **Implement** |
| Render-wait tuning (knobs, reduced settle) | −287 ms/page; −1.4 s on 5-page crawl | S | M (under-scan slow-rendering pages) | **Implement** (defaults conservative) |
| Screenshot cap | −700 ms issue-dense | S | L (fewer screenshots) | **Implement** (env-tunable) |
| Vendored axe + warm cache | −275 ms first scan/process; reliability | S | L | **Implement** |
| Crawl-memory query rewrite | −~800 ms/enqueue at 200-scan history | S | L | **Implement** |
| History N+1 fix | 100 ms → ~1-2 ms at limit 50 | S | L | **Implement** |
| Incremental issue persistence | 5× → ~1× row churn | M | M (retry correctness) | **Implement** + tests |
| Lightweight polling | O(issues) → O(1) polling payload | S | L | **Implement** |
| DB indexes | claim/recovery/history at scale | S | L | **Implement** (migration) |
| Connection pooling config | resilience on managed Postgres | S | L | **Implement** |
| SSRF hardening + rate limiting | security posture | M | M (compat via env) | **Implement** |
| Metrics + slow-scan logs | operability/SLOs | M | L | **Implement** |
| Intra-crawl page parallelism (2–3) | −25–35 % multi-page wall time | M | H (threads, memory, ordering) | **Deferred** — measured remaining floor is the 508 ms/page idle wait; with a 1-vCPU production target the wall-time gain risks CPU contention, and worker replicas are the cleaner scaling axis | 
| Async Playwright rewrite | overlaps waits further (~10–20 %) | L | H (full rewrite of scanner + tests) | **Reject for now** |
| Redis/Celery queue | higher fan-out/decoupling | M | M (new infra) | **Reject for now** — DB queue is correct, cheap, and observed queue depth is low; revisit at sustained >5 scans/s |
| Redis result cache | avoids duplicate work | M | M (staleness, per-user data) | **Reject** — crawl memory already dedupes; cache invalidation cost exceeds benefit |
| Horizontal API workers / gunicorn | API concurrency | S | L | **Document** — enqueue path is light; worker is the bottleneck; tune only after metrics show API saturation |
| CDN/edge caching | static frontend | S | L | Out of scope (Vercel already does this) |

Guiding rule: the scanner spends most of its time **waiting** (network idle, render) and **starting/stopping processes**, not scanning. Optimise the wait/startup envelope first; only then consider more parallelism.

## 7. Implemented optimizations

### 7.1 Scanner engine

1. **Worker-level browser reuse** — `scan_page(..., browser_session=...)` accepts an externally-owned session; `scan_worker` creates one `BrowserSession` for the process, passes it to every job, recreates it if the browser disconnects or a job raises a fatal browser error, and closes it on shutdown. `SCAN_BROWSER_REUSE_ENABLED=false` restores the old per-scan lifecycle. Trade-off: one long-lived Chromium (~150–300 MB RSS) per worker; mitigated by restart-on-crash and the kill-switch.
2. **Render-wait tuning** — `SCAN_RENDER_IDLE_TIMEOUT_MS` (default 1500) caps networkidle; `SCAN_RENDER_SETTLE_MS` (default 100) replaces the previous 250–600 ms fixed sleep; `load` state is awaited first. Trade-off: pages that mutate the DOM long after network idle could be under-scanned; the knob can be raised per deployment.
3. **Screenshot cap** — `SCAN_MAX_SCREENSHOTS` (default 10) bounds captures per page; issues past the cap keep full text locators but no screenshot. Trade-off: fewer images on very noisy pages.
4. **Vendored axe-core** — pinned 4.10.2 asset in `backend/app/assets/` (SHA-256 recorded), loaded from disk and cached; CDN only as fallback; `warm_axe_cache()` at worker start. Trade-off: repository +0.5 MB, manual version bumps.
5. **Phase timings + scan budget** — scanner returns per-phase timings (`browser_setup`, `goto`, `render_wait`, `page_content`, `parse`, `axe`, `merge`, `screenshots`, `session_teardown`); the worker logs one structured JSON line per scan; `SCAN_MAX_SECONDS` (default 240) bounds multi-page wall time. Trade-off: small response/field addition, log volume.
6. **Fallback-path fix** — the raw-HTML path now runs axe-core correctly (previous `NameError` was silently swallowed).
7. **SSRF hardening** — URL validation rejects non-http(s), embedded credentials, overlong URLs, and (when `SCAN_ALLOW_PRIVATE_TARGETS=false`, the recommended production setting) private/loopback/link-local/reserved/multicast targets including post-redirect final URLs. Trade-off: local demo pages need the flag on (default preserves current dev behaviour); DNS-rebinding is documented as a residual risk.

### 7.2 Database and API

1. **Indexes (migration f075)** — `(user_id, started_at)` for history/crawl memory, `(status, started_at)` for claiming, `(status, heartbeat_at)` for stale recovery, `(scan_run_id, position)` for ordered issue loads.
2. **Crawl-memory query** — loads only URL columns (no issue eager-load); identical set semantics; O(history) rows → O(scans).
3. **Incremental issue persistence** — publishes append only new issues; retry re-claims clear partial rows; completion keeps the authoritative replace. Row churn 5× → ~1×.
4. **History N+1 removal** — fallback uses already-loaded URL arrays; list statements 45 → constant.
5. **Lightweight polling** — `GET /scans/{id}?include_issues=false`; frontend polls status/summary and fetches issues only on change/terminal.
6. **Connection pool config** — env-driven `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT`, `DB_POOL_RECYCLE`, `DB_POOL_PRE_PING` for PostgreSQL; SQLite tests unaffected.
7. **Rate limiting** — per-user scan limits and per-IP auth limits (token bucket, `429` + `Retry-After`); per-process limitation documented.
8. **Metrics + slow-scan logging** — `/metrics` (Prometheus text), counters/histogram/gauges, and a structured slow-scan log line.

## 8. Results

All numbers below are measured on the same machine with the same deterministic fixtures; raw evidence and full tables live in [`performance-results.md`](./performance-results.md).

### 8.1 Production-shape headline (baseline per-job browser lifecycle → worker-level reuse)

| Workload | Baseline | Optimized | Change |
|---|---|---|---|
| Single-page, clean | 2,783 ms | **850.5 ms** | **−69.4 %** |
| Single-page, issue-dense with screenshots | 4,279.9 ms | **1,584.7 ms** | **−63.0 %** |
| 5-page crawl, delay 0 | 7,254.4 ms | **4,188.8 ms** | **−42.3 %** |
| 5-page crawl, delay 250 ms (default) | 8,577.3 ms | **5,190.2 ms** | **−39.5 %** |

Worker-mode scans contain no per-scan browser start or teardown; the single worker browser is
recycled every 250 jobs (one-time teardown ~1.0–1.5 s, i.e. ~4–6 ms/job amortised).

### 8.2 Per-component results

| Component | Baseline → optimized | Notes |
|---|---|---|
| Render wait | 895.6 → **618.7 ms/page** (−30.9 %) | networkidle unchanged (508 ms); fixed settle 384 → 109 ms |
| Screenshot pipeline | 1,516.9 → **824.4 ms** (−45.6 %) | 19 → 10 unique captures (cap); 22 → 13 issues with an image |
| axe-core cold fetch | 294.0 → **0.87 ms** (−99.7 %) | vendored asset + warmed at worker start; cold-cache penalty eliminated |
| First scan in fresh process | 3,129.9 → **1,974.3 ms** (−36.9 %) | cold subprocess scan #1: 4,759.5 → 3,580.4 ms |
| Crawl-memory lookup | 797.5 → **14.9 ms** (−98.1 %) | SQL 2 → 1; ORM rows **20,200 → 0** |
| Progress publish (5-page) | 127.2 → **55.7 ms** (−56.2 %) | row writes **2,500 → 500 (−80 %)**; insert amplification 3.0× → 1.0× |
| History list (limit 50) | 92.4 → **8.2 ms** (−91.2 %) | SQL statements **45 → 3** (constant) |
| Status-only poll | new **0.37 ms** (1 SQL, 1 row) | `include_issues=false`; frontend payload −58 % on fixture |

### 8.3 Per-call path and comparison validity

Like-for-like `scan_page()` per-call deltas (recheck of baseline commit with the same harness):
clean **−30.4 %**, issue-dense **−17.6 %**, crawl delay 0 **−16.5 %**. The per-call path is kept
for local/dev and can be restored in production with `SCAN_BROWSER_REUSE_ENABLED=false`; it still
benefits from waits, the screenshot cap and axe vendoring. Browser teardown is state-dependent
(≈175–195 ms after light-work pages on the optimized timeline vs ≈735–785 ms on baseline code;
≈700–770 ms for screenshot-heavy pages on both), which is quantified in the results document and
is irrelevant to worker mode because the browser is reused.

### 8.4 Functional equivalence and intended behaviour changes

Issue counts, rule IDs, severity and source distributions match the baseline for every scenario
except two **intended** changes: (1) the screenshot cap reduces captures per page (19 → 10 on the
issue-dense fixture) — screenshots are a bounded product feature, locators are unchanged; (2) the
raw-HTML fallback now runs axe-core correctly (6 → 22 issues on the issue-dense fixture), fixing a
latent swallowed-`NameError` defect. Everything else — including the JS-rendered SPA's injected
violations — is unchanged.

### 8.5 Interpretation

The measured deltas align with the bottleneck ranking: the largest wins come from **not paying
process lifecycle per job** (worker mode) and from **removing self-imposed waiting** and
**O(history) database work**; axe analysis itself (≈150–185 ms/page) is unchanged because it is
genuine work. The remaining floor per page is network-idle observation (~508 ms) plus axe
(~150–185 ms), which is why the next tier of gains would require concurrency (overlapping page
waits) rather than more micro-optimisation — see §14.

## 9. Security review

| Area | Current | Change / recommendation |
|---|---|---|
| SSRF | Scanner fetches any http(s) URL including `127.0.0.1`/private ranges | Private-target blocking behind `SCAN_ALLOW_PRIVATE_TARGETS=false`; reject credentials/overlong URLs; re-validate post-redirect final URL. Residual: DNS rebinding; mitigate with network egress policy in production |
| AuthN/AuthZ | Bearer JWT + DB session revocation; every scan/preference/suggestion query scoped by `user_id`; cross-user access returns 404 | Unchanged; rate limits added to auth endpoints |
| Abuse/DoS | Bounded crawl (5 pages), per-page timeout, new scan time budget; screenshots now capped | In-process rate limiting (`RATE_LIMIT_*`); per-process caveat; recommend edge/WAF limits when multi-instance |
| Secrets | JWT secret and Fernet key have development fallbacks | **Recommend fail-fast in production** (documented follow-up); keep secrets in env, rotate knowingly |
| Third-party supply chain | axe-core downloaded from CDN at runtime | Vendored + pinned + hashed asset; CDN only as fallback |
| Input validation | Pydantic request models; URL validation | Extended validation (§7.1.7); crawl limits unchanged |
| Data privacy | Screenshots may capture page content (potential PII) | Existing Cloudinary path stores URLs; document retention policy; inline data URLs bloat Postgres — prefer Cloudinary in production |
| Rate-limit scope | — | Per-process buckets; a shared store (Redis) is required for multi-instance deployments — documented as a scaling follow-up |

## 10. Reliability

- **Timeouts:** per-page `page_timeout_ms` (preference default 15 s) bounds navigation/render; `SCAN_MAX_SECONDS` bounds whole multi-page runs; HTTP fetch has explicit timeouts; axe script load has a timeout and a local fallback.
- **Retries:** worker attempts (max 3) on failure; stale-heartbeat recovery requeues or fails; cancel-requested jobs are never retried. Retry reclaims now clear partial issue rows, making incremental persistence idempotent. Recommendation: add small exponential backoff with jitter before the next attempt (currently immediate retry) — low risk, deferred to keep this change-set focused.
- **Idempotency:** final replace write means repeat/retried completions converge to the same state; partial appends are guarded by claim cleanup; queue mutations are URL-normalised and merge-preserving.
- **Isolation:** Chromium crash is contained (session recreated; job retried); a stuck job is handled by heartbeat + stale recovery; per-scan time budget prevents unbounded crawls.
- **Degradation:** axe failure falls back to custom checks (logged); Cloudinary failure falls back per configuration; rendering unavailability falls back to raw HTML (now with axe correctly applied).
- **DB resilience:** `pool_pre_ping` + `pool_recycle` avoid stale managed-Postgres connections; connection pool size must respect provider limits (see §11).

## 11. Resource efficiency and capacity model

| Resource | Baseline | Measured after optimisation |
|---|---|---|
| Worker CPU per single-page job | ~0.4–0.6 s Chromium CPU + ~1.7 s process overhead | overhead removed; CPU unchanged |
| Chromium RSS | one browser per job (transient) | one persistent browser per worker (~150–300 MB) + ephemeral contexts, recycled every 250 jobs |
| Single-page scan (worker) | 2,783 ms clean / 4,280 ms dense+screenshots | **850.5 / 1,584.7 ms** |
| Multi-page 5-page crawl | ~7.3 s wall (delay 0); 8.6 s at default delay | **4.19 s / 5.19 s** |
| DB reads per multi-page enqueue | 20,200 ORM rows / 815 ms at 200-scan history | **0 rows / 14.9 ms** (1 column-only SELECT) |
| DB writes per crawl | 2,500 row writes | **500 appends + one completion write** |
| API history call (limit 50) | 45 statements / 100 ms | **3 statements / 8.2 ms** |
| API status poll | full issue payload every poll | **0.37 ms**, 1 row (`include_issues=false`) |

**Throughput estimate (single Render worker, 1 vCPU):** with per-job overhead removed, a worker's effective capacity is bounded by page work (~0.85 s/single page incl. waits) → roughly 1 scan/s for tiny pages and ~0.3–0.5 scans/s for average sites; 5-page crawls ~0.24 crawls/s per worker (4.19 s). Scale by adding `scan-worker` replicas (safe via `SKIP LOCKED`) before increasing per-worker concurrency. Postgres connection math: `replicas × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` must stay below the provider's connection cap (Render/Neon plans often cap at 20–100) — document this in deployment guidance.

**Cost note:** the largest cost driver is idle/blocked worker time, which browser reuse and wait tuning reduce without extra infrastructure. Browser persistence trades ~200 MB RAM for ~1.9 s/job (setup+teardown), worth it wherever jobs/hour > ~10.

## 12. Observability plan

**Metrics (`GET /metrics`, Prometheus text):**
- `scan_requests_total{status}` — enqueue/complete/fail/cancel counters
- `scan_duration_seconds` histogram (p50/p95/p99 scan latency; SLO source of truth)
- `scan_issues_total{severity}` — work volume
- `scan_queue_depth` — queue gauge (uses the status index)
- `rate_limited_total{scope}`, `scan_worker_attempts_total`

**Structured logs:** one JSON line per scan with `scan_id`, `url`, `mode`, `pages`, `total_ms`, phase timings; slow-scan warning above `SCAN_SLOW_LOG_SECONDS` (10 s); worker claim/complete/cancel/retry events.

**Tracing (recommended, not implemented):** OpenTelemetry spans around enqueue → claim → browser session → per-page render/axe → persistence, exported to a collector; this is the natural next observability step once a hosted environment exists.

**SLOs and alerts:**
- p95 enqueue response < 300 ms; p95 queued→started < 3 s
- p95 single-page scan < 5 s; p95 5-page crawl < 12 s (external-site dependent — tune after real traffic)
- scan error rate < 2 %; stale recoveries < 1 % of jobs
- queue depth > 20 sustained 5 min → scale workers; oldest queued age > 60 s → alert
- no worker heartbeats > 2× `SCAN_WORKER_STALE_AFTER_SECONDS` → alert
- p95 duration regression > 30 % vs 7-day baseline → alert

## 13. Rollout and operations

- **Env knobs (all optional, safe defaults):** `SCAN_BROWSER_REUSE_ENABLED`, `SCAN_RENDER_IDLE_TIMEOUT_MS`, `SCAN_RENDER_SETTLE_MS`, `SCAN_MAX_SCREENSHOTS`, `SCAN_MAX_SECONDS`, `AXE_SCRIPT_PATH`, `SCAN_ALLOW_PRIVATE_TARGETS`, `DB_POOL_*`, `RATE_LIMIT_*`, `METRICS_ENABLED`, `SCAN_SLOW_LOG_SECONDS`.
- **Migration:** single linear head (new indexes); apply with `alembic upgrade head` — online `CREATE INDEX` (non-concurrent) on the current table sizes is fine; for large production tables, consider `CREATE INDEX CONCURRENTLY` (would need a manual migration step).
- **Rollout order:** deploy backend + migration → deploy worker (browser reuse) → deploy frontend polling change → verify metrics/SLOs → enable private-target blocking in production env.
- **Rollback:** each optimisation has an env switch or is a pure code revert; the screenshot cap and private-target flag are runtime-configurable without redeploy.

## 14. Remaining work (not implemented)

1. **Bounded intra-crawl page parallelism** (2–3 contexts with per-thread sessions): measured post-optimization, a 5-page crawl is 4.19 s (delay 0) of which ~2.24 s is the browser-side network-idle floor (5 × ~508 ms) plus ~0.75 s axe — parallelism could target the idle floor (−25–35 % wall time) at the cost of 2–3× Chromium memory, more complex queue publishing/cancellation, and CPU contention on 1-vCPU instances. Deliberately deferred: for the current production shape (small worker replicas), horizontal worker scaling is simpler and preserves ordering semantics; revisit with a loaded multi-worker benchmark.

2. **Reduced network-idle observation**: replacing the fixed 508 ms `networkidle` window with a custom in-flight-request/DOM-stability detector could cut ~300–400 ms/page, but has a real false-negative risk for late-rendering content. It would need a corpus of real sites to validate before shipping.
3. **Worker backoff + jitter** for retries.
4. **Redis-backed rate limiting** for multi-instance deployments.
5. **OpenTelemetry tracing** and a Grafana dashboard template.
6. **Fail-fast production secret checks** (JWT/Fernet fallbacks).
7. **Full-site crawl orchestration** beyond the 5-page dashboard cap (queue fan-out, worker autoscaling) — an architectural direction change, not an optimisation.
8. **Result caching / dedupe of concurrent identical scans** — only if metrics show duplicate-URL volume.

## 15. Reproduce

```powershell
# baseline (current committed tree a2bc609) — see performance-baseline.md for details
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py
backend\venv\Scripts\python.exe scripts\perf\bench_db.py

# after optimisations — see performance-results.md
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py
backend\venv\Scripts\python.exe scripts\perf\bench_db.py
```

Both harnesses write raw JSON (`baseline.json` / `optimized.json`, `db_baseline.json` / `db_optimized.json`) and print markdown tables; medians require ≥5 scanner / ≥20 DB measured iterations after warm-up.
