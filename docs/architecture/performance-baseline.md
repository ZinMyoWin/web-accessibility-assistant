# Performance baseline: AccessAudit scanner (pre-optimization)

**Status:** measured baseline, established before any optimization work. No application code
was modified to produce it; all instrumentation is runtime monkeypatching from
`scripts/perf/` (see [Methodology](#2-methodology)).

**Machine:** Intel Core i7-10750H (6C/12T @ 2.6 GHz), 23.8 GB RAM, Windows 11 Pro
(build 10.0.26300), 12 logical CPUs.
**Measured:** 2026-11-02T17:24:23Z (2026-11-03 00:24 Asia/Bangkok), repo `fullstack-dev`
at commit `a2bc60993fb1ac8056a4c2de8ef6e319224e7b94`.
**Interpreter:** `backend\venv\Scripts\python.exe`, Python 3.13.3 (MSC v.1943, 64-bit),
Playwright 1.58.0, Chromium 145.0.7632.6, SQLAlchemy 2.0.49, Pydantic 2.12.5.
**Raw data:** [`scripts/perf/baseline.json`](../../scripts/perf/baseline.json) (scanner),
[`scripts/perf/db_baseline.json`](../../scripts/perf/db_baseline.json) (database path),
supplementary [`delay_teardown_check.json`](../../scripts/perf/delay_teardown_check.json) and
[`fallback_path_check.json`](../../scripts/perf/fallback_path_check.json).
Every number below is derived from those files; nothing is estimated.

---

## 1. Executive summary: ranked bottlenecks

Ranked by measured contribution to production-representative paths. Percentages are shares of
the scenario's measured wall-clock time; "single-page" scenarios are the production
`_scan_single_page` path (browser render + axe-core + screenshots), "multi-page" scenarios are
the production scan-worker multi-page path (browser render + axe-core per page, no screenshots,
`run_browser_analysis_for_multi=True`).

| # | Bottleneck | Measured evidence (median/aggregate) | Where it costs |
|---|---|---|---|
| 1 | **Per-job Playwright driver + Chromium lifecycle** | Setup 948.0–997.2 ms (`nested:browser_start` 875.9–919.7 ms) **plus** teardown 709.0–718.4 ms ⇒ **1.67–1.72 s per scan**, i.e. **60.6 % of a clean single-page scan** (2783.3 ms), **38.8 % of an issue-dense single-page scan** (4279.9 ms); multi-page amortises it to 1171.4 + 713.5 = **1.88 s/scan (26.0 % of 7254.4 ms)**. Independent micro-split: `sync_playwright().start()` 899.9 ms + `chromium.launch()` 96.6 ms, `browser.close()` 563.5 ms + `playwright.stop()` 18.5 ms. | Every scan job (each `scan_page()` creates and closes a fresh `BrowserSession`). |
| 2 | **Render waits (`_wait_for_rendered_content`)** | **895.6 ms per page**: `networkidle` 511.7 ms + fixed settle 383.9 ms (clean page); multi-page 508.5 + 386.9 = **895.4 ms/page ⇒ 4477.1 ms for 5 pages, 61.7 % of the delay-0 crawl**, 32.2 % of the clean single-page scan. JS-rendered page: `networkidle` 664.2 ms (SPA injection at 150 ms). | Every rendered page (single and multi). |
| 3 | **Screenshot pipeline (single-page only)** | **+1452.2 ms** median delta when `_attach_issue_screenshots` is disabled on the issue-dense page (4279.9 → 2827.7 ms) ⇒ **35.3 % of the single-page production scan**. 19 unique captures/scan at **79.7 ms/capture**; storing them as inline data URLs costs only 2.2 ms. | Every single-page scan (production `capture_screenshots=True`). |
| 4 | **Artificial inter-page crawl delay** | **+1322.8 ms per 5-page crawl** (7254.4 → 8577.3 ms, 18.2 %): 1001.5 ms is the literal `sleep(request_delay_ms/1000)` × 4 calls; a further ~310–320 ms appears in `browser_close` after idle gaps. Reversed-order rerun: **+1248.3 ms** total (sleep 1001.5 ms + ~307 ms teardown). | Every multi-page crawl with the production default `request_delay_ms=250`. |
| 5 | **Database-path costs around the scanner** | Crawl-memory lookup **797.5 ms** median per multi-page request (SQLite: 2 SELECTs but **20,200 ORM rows** loaded, i.e. all 200 complete scans × 100 issues); `update_scan_progress` publishes **127.2 ms cumulative per 5-page crawl** and **2500 issue-row writes to persist 500 final rows** (5.0× row churn, 3.0× insert amplification, 10.9 → 37.4 ms per publish, 26 SQL statements/cycle); saved-scan history list **92.4 ms / 45 SQL statements for limit=50** vs 1.35 ms / 2 statements when filtered (N+1 lazy-load of issues). | Once per multi-page scan (crawl memory), once per crawled page (progress publish), once per history page load. |
| — | Runner-up: axe-core analysis | 148.7 ms/page in multi-page, 164.7–182.0 ms/scan single-page (4.2–10.2 %). axe-core CDN fetch 294.0 ms on the first scan of a process only (script 553,283 bytes; 274–376 ms cold-cache penalty measured). | Every rendered page (cheap relative to the items above; only a first-process cost once). |

**One-line conclusion:** on this machine a single-page scan costs ≈ 2.8 s when clean and
≈ 4.3 s when issue-dense; ≈ 60 % / 39 % of that is browser start+stop per job, ≈ 32 % / 21 %
is deliberate waiting, and ≈ 35 % of the issue-dense scan is screenshot capture. A 5-page
crawl costs ≈ 7.25 s without the configured delay and ≈ 8.58 s with it, and 61.7 % of the
delay-free crawl is render waiting. The database path adds ≈ 0.8 s of crawl-memory loading per
multi-page scan request and ≈ 0.13 s of write churn per 5-page crawl in SQLite (optimistic
lower bounds for PostgreSQL).

---

## 2. Methodology

### 2.1 What is measured

- **Scanner-level harness** (`scripts/perf/bench_scan.py`): calls
  `app.services.page_scanner.scan_page(url, options)` directly with explicit `ScanOptions`.
  No FastAPI, no database, no auth. A **scenario iteration is one full scan job**, including
  creating and closing its `BrowserSession` — exactly the production per-job lifecycle.
- **Deterministic local fixtures** are served by `http.server.ThreadingHTTPServer` on
  `127.0.0.1` with an ephemeral port (plain HTTP, no external requests, `Cache-Control:
  no-store`, 1×1 PNGs for image subresources, `/robots.txt` allow-all):

| Fixture | Purpose | Observed issues |
|---|---|---|
| `/clean` | Clean small page (h1, main landmark, alt text, title, lang) | 0 |
| `/issue-dense` | HTML-equivalent of backend `GET /test/page-bad`: missing title/lang, `<img>` without alt, "click here", duplicate ids, skipped heading level, low contrast, empty button, unlabelled input/select, `<marquee>`, headerless table | 22 (6 custom + 20 axe/both before dedupe; `region` best-practice fires 10×) |
| `/spa` | HTML-equivalent of `GET /test/page-js-rendered`: violations injected via `setTimeout(..., 150)` | 8 |
| `/multi/` + `/multi/page-2..5` | 5-page linked site, each page with fixed known violations (missing alt images, vague link, duplicate ids, skipped heading, empty button); root links to 4 pages, `crawl_depth=2` | 9 total (5× image-alt, link-name, duplicate-id, heading-order, button-name) |

- **Measured iterations:** one explicit warm-up per scenario (not counted), then 7 measured
  iterations for single-page scenarios and 5 measured iterations for multi-page scenarios
  (each multi iteration already scans 5 pages). The fresh-process cold section runs 3 scans in a
  separate Python process. Statistics: **median, min, max, p90, mean, sample stdev, CV%**;
  percentile is linear interpolation between closest ranks (numpy/Excel `PERCENTILE.INC`).
- **Work is recorded alongside time:** every iteration logs issue count, pages scanned, issue
  counts by rule/severity/source and screenshot count, so timings can be read as ms/page and
  ms/issue.

### 2.2 Phase instrumentation without editing app code

Module attributes are wrapped with `time.perf_counter()` accumulators and restored afterwards
(`_install_instrumentation()` in `bench_scan.py`):

- `BrowserSession.new_page`/`_ensure_browser`/`close`, `_new_browser_context` → browser lifecycle
- a transparent page proxy around `goto`, `content`, `wait_for_load_state`, `wait_for_timeout`
- `_wait_for_rendered_content`, `_fetch_page_html`, `_parse_page_html`, `_build_issues`,
  `_prepare_html_for_screenshot`, `_attach_issue_screenshots`, `_capture_screenshot_bytes`,
  `_store_screenshots_concurrently`
- `axe_scanner.run_axe_core`, `axe_scanner.merge_issues`, `axe_scanner._get_axe_script`
  (note: `page_scanner` imports `run_axe_core` *inside* the scan function, so patching the
  `axe_scanner` module attribute is effective)
- `page_scanner.sleep` → records the artificial crawl delay

**Top-level phases are non-overlapping**; nested phase names are prefixed `nested:` and must
not be added to the top-level sums. The measured top-level phases reconcile with wall-clock
time to within **0.00–0.73 % unattributed** on every scanner scenario (see
`aggregates.phase_share` in `baseline.json`; all `attribution_warning` flags are `false`).

### 2.3 Environment controls & noise

- **Host calibration** (fixed 200k-iteration pure-Python workload, median of 5) before and
  after the 257.5 s scanner run: 18.42 ms → 19.12 ms, **drift ratio 1.038 (+3.8 %), contention
  flag false**. The machine also runs the interactive desktop/Chrome session; no other batch
  jobs were observed running during the measured window, and scenario CVs stayed below 2 %.
- **Scanner medians are highly stable:** CV 0.39–1.95 % on every time-meaningful scenario
  (single-page 0.71–1.95 %, multi-page 0.39–0.56 %). Treat differences below ~5 % on
  single/multi-page medians as noise. The only high-CV row is `single_raw_html_fallback`
  (76.6 % CV) but it is a ~14 ms operation whose min (1.3 ms) is a single connection-reuse
  outlier; its p90 (16.0 ms) is the useful bound.
- **Noise in the DB section:** CV 3.8–19.7 % (in-memory SQLite ops are mostly sub-10 ms; the
  large crawl-memory read has CV 10.1 %, p90 921.4 ms). Treat ±10–20 % on individual DB
  medians as noise; the portable evidence is the **statement count and ORM row counts**, which
  are exact.
- **Cold caveat:** the "cold" subprocess ran *after* earlier smoke runs of this harness had
  already started Chromium on this machine (OS disk cache warm). It therefore captures
  per-process effects (Playwright import/driver start, CDN fetch) but **not** a disk-cold
  first-ever Chromium launch; the Lead's earlier ~9.5 s first-ever observation is consistent
  with a disk-cold start. See §3.4.
- `CLOUDINARY_URL` is unset for these runs, so screenshots are stored as inline base64 data
  URLs (deterministic CPU cost). Production with Cloudinary configured would pay network
  upload latency per screenshot instead — see §6.

### 2.4 Reproduce

All commands are run from the repository root (paths quoted for PowerShell):

```powershell
# Scanner baseline (writes scripts/perf/baseline.json, ~4.3 min on this machine)
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py

# Database baseline (writes scripts/perf/db_baseline.json, ~24 s)
backend\venv\Scripts\python.exe scripts\perf\bench_db.py

# Fast smoke (1 iteration/scenario, no cold subprocess, no axe-cache section)
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py --quick --skip-cold --skip-axe-cache

# Single scenario / more iterations
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py --only multi_5_pages_delay_0 --iterations 7
backend\venv\Scripts\python.exe scripts\perf\bench_db.py --iterations 30

# Supplementary evidence runs
backend\venv\Scripts\python.exe scripts\perf\check_fallback_path.py          # writes fallback_path_check.json
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py --only multi_5_pages_delay_250,multi_5_pages_delay_0 `
    --iterations 5 --skip-cold --skip-axe-cache --json-out scripts\perf\delay_teardown_check.json
```

The benchmark scripts do **not** import the FastAPI app at module import time and do not need
`DATABASE_URL`; they only put `backend/` on `sys.path` and import the scanner modules.

---

## 3. Scanner-level results

### 3.1 Scenario medians (ms, after one warm-up; raw samples in `baseline.json`)

| Scenario | n | median | min | p90 | mean | stdev | CV% | issues | pages | ms/page | ms/issue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `single_clean` | 7 | **2783.3** | 2744.1 | 2795.3 | 2777.7 | 19.8 | 0.71 | 0 | 1 | 2783.3 | n/a |
| `single_issue_dense_screenshots` | 7 | **4279.9** | 4218.1 | 4348.4 | 4293.5 | 52.3 | 1.22 | 22 | 1 | 4279.9 | 194.5 |
| `single_issue_dense_no_screenshots` | 7 | **2827.7** | 2755.7 | 2854.8 | 2815.5 | 42.6 | 1.51 | 22 | 1 | 2827.7 | 128.5 |
| `single_js_rendered_spa` | 7 | **3543.6** | 3489.2 | 3644.2 | 3567.0 | 69.5 | 1.95 | 8 | 1 | 3543.6 | 442.9 |
| `multi_5_pages_delay_0` | 5 | **7254.4** | 7226.1 | 7280.1 | 7252.0 | 28.2 | 0.39 | 9 | 5 | 1450.9 | 806.1 |
| `multi_5_pages_delay_250` | 5 | **8577.3** | 8538.4 | 8640.3 | 8589.1 | 47.9 | 0.56 | 9 | 5 | 1715.5 | 953.0 |
| `single_raw_html_fallback` | 7 | **14.4** | 1.3 | 16.0 | 9.5 | 7.3 | 76.6 | 6 | 1 | 14.4 | 2.4 |

Interpretation:

- The clean page (no issues ⇒ no screenshots) still costs **2.78 s**; that is essentially
  browser lifecycle + render wait + axe run, not analysis of violations.
- Issue density costs little for the checks themselves (`ms/issue` is dominated by fixed
  overheads) but screenshots add **+1.45 s**.
- The JS-rendered page costs **+0.76 s** over the clean page, mostly extra `networkidle` wait
  (664.2 vs 511.7 ms) caused by the injection/subresource timing, not extra analysis.
- The raw-HTML fallback is ~297× cheaper (**14.4 ms**) because it never launches a browser —
  it only fetches and parses HTML and runs custom checks. It also returns only 6 custom issues
  vs 22 rendered issues (correctness caveat in §5.1).

### 3.2 Phase share (top-level phases; % of summed measured wall-clock)

Per-scan milliseconds are in parentheses. `nested:*` rows are included for diagnosis and are
already contained in their parent phase; do not add them again.

| Phase | `single_clean` | `single_issue_dense_screenshots` | `multi_5_pages_delay_0` | `multi_5_pages_delay_250` | `single_raw_html_fallback` |
|---|---|---|---|---|---|
| `browser_setup` (new_page incl. lazy start) | **35.0 %** (971.2) | **22.1 %** (948.0) | **16.1 %** (1171.4; 5 calls) | 13.7 % (1180.0; 5 calls) | 0.0 % |
| ↳ `nested:browser_start` (start+launch) | 32.4 % (899.1) | 20.4 % (875.9) | 12.2 % (882.3) | 10.4 % (890.5) | – |
| `goto` | 0.5 % (14.9) | 0.4 % (15.3) | 0.9 % (66.4; 5) | 0.9 % (76.1; 5) | – |
| `render_wait` | **32.2 %** (895.6) | **20.9 %** (898.1) | **61.7 %** (4477.1; 5) | 51.9 % (4458.0; 5) | – |
| ↳ `nested:networkidle_wait` | 18.4 % (511.7) | 11.8 % (509.0) | 35.1 % (2542.4) | 29.4 % (2522.2) | – |
| ↳ `nested:fixed_settle_wait` | 13.8 % (383.9) | 9.1 % (389.2) | 26.7 % (1934.7) | 22.5 % (1935.7) | – |
| `request_delay` (artificial sleep) | – | – | – | **11.7 %** (1001.5; 4 calls) | – |
| `page_content` | 0.2 % (7.0) | 0.2 % (6.7) | 0.4 % (31.0) | 0.3 % (29.9) | – |
| `parse_html` + `build_issues` | 0.0 % (0.2) | 0.0 % (0.5) | 0.0 % (1.3) | 0.0 % (1.4) | 4.1 % (0.4) |
| `axe_core` | 5.9 % (164.7) | 4.2 % (182.0) | 10.2 % (743.6; 5) | 8.8 % (752.7; 5) | – |
| ↳ `nested:axe_script_fetch` (CDN, cold only) | 0.0 % (0) | 0.0 % (0) | 0.0 % (0) | 0.0 % (0) | – |
| `merge_issues` | 0.0 % (0) | 0.0 % (0) | 0.0 % (0.1) | 0.0 % (0) | – |
| `screenshots_total` | 0.0 % (0) | **35.3 %** (1516.9) | – | – | – |
| ↳ `nested:screenshot_capture` (19 calls) | 0.0 % | 35.3 % (1514.6) | – | – | – |
| ↳ `nested:screenshot_store` | 0.0 % | 0.1 % (2.2) | – | – | – |
| `fetch_html` | – | – | – | – | **95.2 %** (9.0; mean-based, see note) |
| `context_close` | 0.4 % (10.9) | 0.2 % (7.5) | 0.5 % (38.5; 5) | 0.5 % (39.7; 5) | – |
| `browser_close` | **25.7 %** (713.1) | **16.7 %** (718.4) | **9.8 %** (713.5) | 12.0 % (1029.6) | 0.0 % |

Shading notes: percentages are sums across measured iterations (mean-based); the fallback row
is dominated by one 40 ms outlier — its median scan is 14.4 ms and `fetch_html` is ~95 % of the
summed time, but use the p90 (16.0 ms) for planning. `parse_html`/`build_issues` are negligible
in rendered paths because `page.content()` already serialized the DOM.

Key readings:

- **Single-page production path (issue-dense):** browser lifecycle 38.8 %, screenshots 35.3 %,
  render waits 20.9 %, axe 4.2 %.
- **Single-page clean path:** browser lifecycle 60.6 %, render waits 32.2 %, axe 5.9 %.
- **Multi-page worker path:** render waits 61.7 % of the delay-free crawl; browser lifecycle
  26.0 %; axe 10.2 %; with the default delay the fixed sleep adds another 11.7 % (and slows
  teardown — see §4.3).

### 3.3 Derived comparisons

| Comparison | Measured delta |
|---|---|
| Screenshot capture+store cost (issue-dense single, screenshots on vs patched no-op) | **+1452.2 ms** (4279.9 → 2827.7) |
| Screenshot capture unit cost (data-URL mode) | 19 captures × **79.7 ms**; store = 2.2 ms total |
| `request_delay_ms=250` cost (multi, 250 vs 0) | **+1322.8 ms** (8577.3 → 7254.4) |
| ↳ literal sleep (`request_delay` phase) | 1001.5 ms (4 × 250 ms) |
| ↳ residual effect on teardown (`browser_close`) | ~310–320 ms slower after delayed crawl, confirmed in reversed-order rerun (+1248.3 ms total) |
| Render wait per page (clean single vs multi) | 895.6 ms vs 895.4 ms — identical per page |
| axe-core per page (multi) / per scan (single) | 148.7 ms / 164.7–182.0 ms |
| Raw HTML fallback vs rendered single-page | 14.4 ms vs 4279.9 ms (≈297×) |

### 3.4 Cold vs warm process (critical evidence for per-job setup overhead)

Fresh Python subprocess (`--cold` mode; scan #1, #2, #3, issue-dense page with screenshots):

| | scan #1 | scan #2 | scan #3 |
|---|---|---|---|
| Wall-clock | **4759.5 ms** | 4259.8 ms | 4249.5 ms |
| `nested:browser_start` | 1003.7 ms | 871.6 ms | 881.2 ms |
| `nested:axe_script_fetch` | **376.5 ms** | 0.0 ms | 0.0 ms |
| `axe_core` total | 555.4 ms | 171.2 ms | 165.9 ms |
| `browser_close` | 702.4 ms | 713.8 ms | 712.8 ms |

- Cold process import (`app.services.page_scanner` + `axe_scanner`) = **156.7 ms**.
- The first scan in a fresh process pays **+~480 ms** over the next scans: **~376 ms axe-core
  CDN download** (553,283-byte script) plus extra Playwright driver startup/import. Everything
  else (browser start, render wait, screenshots, teardown) is already at steady state.
- The benchmark process's very first scan (clean page, axe cache still cold) took **3129.9 ms**
  with `axe_script_fetch` 290.1 ms; scenario `single_clean` medians (2783.3 ms) are the warm
  reference.
- **Caveat:** OS disk cache was warm from earlier runs, so this does not reproduce a first-ever
  disk-cold Chromium launch (Lead observed ~9.5 s once). The per-process penalty measured here
  is ~0.3–0.5 s; a disk-cold worker start can be much larger.

### 3.5 Browser lifecycle micro-split (independent of the scanner wrappers)

One browser per repetition, same lifecycle as a scan job (start → launch → context/page +
`goto(/clean)` → context close → browser close → stop), 5 repetitions:

| Step | median | min–max |
|---|---|---|
| `sync_playwright().start()` | **899.9 ms** | 880.8–966.9 |
| `chromium.launch()` | 96.6 ms | 91.9–107.3 |
| new context + page + `goto` | 109.6 ms | 96.2–131.3 |
| context.close() | 10.6 ms | 7.9–11.9 |
| `browser.close()` | **563.5 ms** | 558.5–572.3 |
| `playwright.stop()` | 18.5 ms | 17.9–21.8 |
| **setup (start+launch+nav)** | **1127.5 ms** | 1073.8–1199.5 |
| **teardown (ctx+browser close+stop)** | **595.9 ms** | 586.3–603.1 |
| **full lifecycle** | **1716.0 ms** | 1660.2–1802.6 |

This independently confirms the scenario phase numbers (scenario `browser_setup` +
`browser_close` = 1684.3–1716.2 ms for single-page scenarios) and shows that driver/browser
start+stop — not page analysis — is the dominant fixed cost per job. `playwright.start()` alone
is ~900 ms of it.

### 3.6 axe-core cache behaviour

| Measurement | Result |
|---|---|
| axe-core CDN URL | `https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js` |
| Script size | 553,283 bytes |
| Cold `_get_axe_script()` fetch (module cache reset) | **294.0 ms** |
| Warm fetch (cache hit) | 0.002 ms |
| Interleaved 3 cold-cache scans vs 3 warm-cache scans (issue-dense, screenshots) | median **4725.2 ms** vs **4451.1 ms** ⇒ **+274.1 ms** cold-cache penalty; cold-cache `axe_script_fetch` mean 275.2 ms |
| First scan per process penalty (cold subprocess) | +~480 ms (§3.4) |

The penalty occurs **once per process**, not once per scan. The warm reference in this section
is 171 ms slower than the main `single_issue_dense_screenshots` median (4280 ms); that is within
the 3.8 % end-of-run calibration drift, so treat the cold penalty as ~0.27–0.38 s.

---

## 4. Multi-page crawl specifics

### 4.1 Where a 5-page crawl spends its time

| Phase (multi, delay 0) | Total per scan | Per page | Share |
|---|---|---|---|
| browser setup (1 lazy start + 5 contexts/pages) | 1171.4 ms | 234.3 ms (first page 882.3 ms `browser_start`) | 16.1 % |
| render wait (5 pages) | 4477.1 ms | **895.4 ms** | **61.7 %** |
| axe-core (5 pages) | 743.6 ms | **148.7 ms** | 10.2 % |
| browser close / playwright stop | 713.5 ms | 142.7 ms | 9.8 % |
| goto (5 pages) | 66.4 ms | 13.3 ms | 0.9 % |
| context close (5 pages) | 38.5 ms | 7.7 ms | 0.5 % |
| page.content (5 pages) | 31.0 ms | 6.2 ms | 0.4 % |
| everything else | ~13 ms | – | 0.2 % |
| **total (delay 0)** | **7254.4 ms** | **1450.9 ms** | 100 % |

- The browser is correctly **shared across all 5 pages** (one `browser_start` per scan, 5
  `new_page` calls), so the per-job browser cost is amortised — but teardown (~713 ms) is still
  paid once per job and render waits scale with page count.
- Adding the default `request_delay_ms=250` adds the 1001.5 ms sleep plus a measured
  ~310–320 ms teardown penalty after idle gaps: total 1.32 s, 15.4 % of the delayed crawl.

### 4.2 Teardown penalty of the artificial delay (order-controlled check)

The delay effect was re-measured with reversed scenario order (`delay_250` first, then
`delay_0`) to rule out ordering/thermal artefacts (5 iterations each,
`delay_teardown_check.json`):

| Scenario | median total | `request_delay` samples | `browser_close` samples |
|---|---|---|---|
| `multi_5_pages_delay_250` (run first) | 8501.8 ms | 1001.4–1002.0 ms | 1013.5, 1014.5, 1019.4, 1040.3, 1032.1 ms |
| `multi_5_pages_delay_0` (run second) | 7253.5 ms | 0 | 718.3, 700.2, 693.5, 717.9, 735.6 ms |

The ~310 ms slower `browser_close` after a delayed crawl is reproducible in both orders and is
not explained by the sleep itself. It is reported as an observed effect; the mechanism
(Chromium renderer/GPU process idle behaviour around teardown) was not investigated further.
Consequence: `request_delay_ms=250` costs ≈ 1.25–1.32 s per 5-page crawl, not just 1.0 s.

---

## 5. Database-path results (in-memory SQLite)

> **Limitation, stated up front:** this is SQLite in memory, not the production PostgreSQL.
> There is no network round-trip, no WAL/fsync, no planner statistics, no row locks
> (`FOR UPDATE SKIP LOCKED` is ignored by SQLite). **Absolute times are optimistic lower
> bounds**; the portable evidence is the shape: **SQL statements issued, ORM rows loaded,
> rows written**. PostgreSQL will make the round-trip-heavy and row-heavy shapes worse
> (crawl-memory lookup, N+1 history list, per-publish delete+reinsert).

Seed (mirrors the backend unit-test pattern: `Base.metadata.create_all(engine)`, in-memory
SQLite): user A with **200 complete scans × (5 pages, 100 issues)** + **20 queued** + 20 stale
running + preferences; user B with 20 complete scans × 100 issues (scoping check);
263 scan runs and 22,000 issue rows total; seed time 0.54 s. Scoping checks passed: user A list
total 200, user B 20, cross-user detail lookup `None`, detail issue counts 100/100.

### 5.1 Repository operation timings (20 measured iterations after 1 warm-up)

| Operation | kind | median | min | p90 | stdev | CV% | SQL stmts/op | executemany/op | ORM rows loaded/op |
|---|---|---|---|---|---|---|---|---|---|
| `list_saved_scans_limit_10` | read | **30.70 ms** | 24.41 | 38.08 | 4.93 | 15.5 | **12** | 0 | 10 |
| `list_saved_scans_limit_50` | read | **92.42 ms** | 74.86 | 128.06 | 19.58 | 19.7 | **45** | 0 | 50 |
| `list_saved_scans_status_filter` | read | 1.35 ms | 1.20 | 1.53 | 0.14 | 10.6 | 2 | 0 | 10 |
| `list_saved_scans_q_ilike` | read | 1.11 ms | 1.03 | 1.26 | 0.17 | 15.0 | 2 | 0 | 1 |
| `get_saved_scan_100_issues` | read | 4.73 ms | 4.43 | 5.49 | 0.64 | 12.8 | 2 | 0 | 101 |
| `get_previously_scanned_page_urls_for_domain` | read | **797.52 ms** | 689.10 | 921.39 | 82.32 | 10.1 | 2 | 0 | **20,200** |
| `get_scan_queue_state` | read | 0.58 ms | 0.56 | 0.64 | 0.03 | 5.9 | 2 | 0 | 1 |
| `is_scan_cancel_requested` | read | 0.17 ms | 0.17 | 0.21 | 0.01 | 8.3 | 1 | 0 | 0 |
| `claim_next_queued_scan` | write | 1.01 ms | 0.99 | 1.32 | 0.18 | 16.6 | 3 | 0 | 1 |
| `recover_stale_running_scans` (20 stale rows) | write | 1.70 ms | 1.64 | 1.79 | 0.07 | 3.8 | 2 | 1 | 20 |
| `complete_running_scan_100_issues` | write | **9.72 ms** | 9.30 | 10.45 | 0.45 | 4.5 | 5 | 1 | 1 |
| `save_completed_scan_100_issues` | write | **7.51 ms** | 7.12 | 8.09 | 0.36 | 4.8 | 3 | 1 | 0 |

Query-shape observations (exact counts from `db_baseline.json`):

- **Saved-scan history list has an N+1 lazy-load.** Unfiltered list pages include queued/running
  rows whose `scanned_page_urls` is empty; `to_saved_scan_list_item` then calls
  `_fallback_scanned_page_urls`, which lazy-loads `scan_run.issues` per row ⇒ **45 SQL statements
  for limit=50** (and 12 for limit=10) versus **2 statements** for the filtered queries.
- **Crawl-memory lookup is row-heavy, not statement-heavy.** 2 SELECTs but **20,200 ORM rows**
  materialized (every complete scan of the user + every issue row) and then filtered by
  hostname in Python — **797.5 ms** per call in SQLite, before the scan even starts. In
  PostgreSQL this eager load would also transfer all those rows.
- **Detail view is fine:** 2 SELECTs, 101 ORM rows (selectinload 100 issues).
- Worker per-page overhead is small: `get_scan_queue_state` 0.58 ms + `is_scan_cancel_requested`
  0.17 ms per page, plus the progress publish below.

### 5.2 Progress-publish write amplification (5-page crawl, 100 issues/page)

Simulating the worker's `CrawlQueueControl.publish` after each page: `update_scan_progress`
called 5 times with cumulative issue lists 100 → 200 → 300 → 400 → 500.

| Publish | Cumulative issues | median |
|---|---|---|
| 1 | 100 | 10.87 ms |
| 2 | 200 | 17.86 ms |
| 3 | 300 | 24.22 ms |
| 4 | 400 | 30.86 ms |
| 5 | 500 | 37.42 ms |
| **cumulative cycle** | | **127.19 ms median** (p90 135.86 ms) |

- Per iteration: **1500 issue-row INSERTs + 1000 issue-row DELETEs = 2500 row-write operations
  to persist 500 final rows** ⇒ **5.0× row writes per final issue** and **3.0× insert
  amplification**. Verified final row count for the scan: 500. 26 SQL statements per cycle.
- Every publish deletes *all* previously persisted issue rows for the scan and re-inserts the
  full cumulative list (`_replace_scan_issue_records`), so per-publish cost grows linearly with
  the number of issues found so far.
- Context: a 5-page crawl also does ~0.75 ms/page of queue-state/cancel polling, and one
  `get_previously_scanned_page_urls_for_domain` call (~0.8 s here) per multi-page request.

### 5.3 Interpretation for PostgreSQL

The measured shapes that will not get cheaper on PostgreSQL and will likely get worse:

1. **Crawl memory:** one request-blocking call loads every complete scan + every issue row for
   the user (O(scans × issues)); with 200/20,000 here, on PostgreSQL the eager load and Python
   filtering cost would add network transfer and server CPU on top of the SQLite figure.
2. **Progress publish:** 5 writes per crawl with delete+reinsert churn growing to 37 ms per
   publish in SQLite (500 rows); PostgreSQL adds round trips (even batched) and index
   maintenance/dead tuples.
3. **History list:** 45 statements for a 50-row page (vs 2 when the fallback lazy-load is not
   triggered); in PostgreSQL that is 45 round trips on a user-facing page.

The absolute numbers should not be copied into a PostgreSQL performance claim; the
statement/row counts and linear growth shapes are the portable baseline.

---

## 6. Limitations and caveats

1. **Local fixtures, localhost HTTP.** Target-network latency/TLS is zero, so `goto`/`networkidle`
   are faster than any real site; real pages can push `networkidle` to its 3 s cap. Absolute
   scanner numbers are a lower bound for real-world scans, but the *deliberate* costs (fixed
   settle, screenshot capture, per-job browser lifecycle, request delay) are machine-local and
   carry over.
2. **Single machine, single run.** All numbers come from one Intel i7-10750H Windows 11 laptop
   with the interactive desktop/Chrome session running. Host calibration drifted **+3.8 %**
   across the 257.5 s run (contention flag false); scanner scenario CVs were 0.39–1.95 %.
   Re-runs on other hardware will shift absolute values; compare phase shares and deltas.
3. **Headless Chromium only**, Playwright 1.58.0 / Chromium 145.0.7632.6.
4. **Screenshots use inline data URLs**, not Cloudinary (`CLOUDINARY_URL` unset). Production
   with Cloudinary pays network upload per screenshot (concurrently, ≤4 workers) instead of the
   measured 2.2 ms local base64 conversion; capture (79.7 ms/screenshot) is unchanged.
5. **SQLite is not PostgreSQL** (see §5). In-memory SQLite runs in the same process; no
   network, no fsync, no locks. Use statement/row counts for cross-database claims.
6. **Cold measurement is process-cold, not disk-cold** (§3.4); a first-ever Chromium launch on
   a freshly booted machine can be several seconds (Lead saw ~9.5 s once).
7. **axe-core CDN fetch is network-dependent** (294.0 ms here). In production the first scan per
   worker process pays it; subsequent scans do not. If the CDN is slow/unreachable, the first
   scan degrades (or falls back to custom checks if axe import fails).
8. **No concurrency/load testing.** One scan at a time; multiple workers, parallel scans and
   database contention are out of scope. The multi-page worker's per-page DB writes are measured
   in isolation, not under concurrent workers.
9. **Fixtures are deliberate test pages**, not real websites: issue density, DOM size and
   subresource count are small and deterministic. Screenshot capture cost scales with the number
   of unique issue selectors (19 here), so real pages with more violations will cost more.
10. **No application code was modified.** The only writes are under `scripts/perf/` and this
    document. The fallback-path defect in §7 was verified read-only and left for its owner.

---

## 7. Additional observation: raw-HTML fallback silently skips axe-core

While instrumenting phases, a latent defect was observed in the fallback browser path (verified
with `scripts/perf/check_fallback_path.py`, results in `fallback_path_check.json`; **app code was
not modified**):

`backend/app/services/page_scanner.py:837-896` — `_run_playwright_analysis()` has no `options`
parameter, yet line 874 passes `options.wcag_standard` / `options.include_best_practices`. The
resulting `NameError` is swallowed by the surrounding `except Exception`, so whenever
`_scan_rendered_page()` returns `None` while the browser itself is available, the fallback
returns **custom-checks-only** issues and never merges axe-core results.

Measured evidence from the check: same issue-dense URL, normal rendered scan → **22 issues**
(20 axe/both-sourced); forced fallback with browser available → **6 issues**, sources `[custom]`
only; direct call to `_run_playwright_analysis` with a page available → **0 axe-core calls**,
no exception propagated. This does not affect the main benchmark scenarios (they exercise the
rendered path, and `single_raw_html_fallback` deliberately disables the browser), but it means
the "fallback" result set is not equivalent to a rendered scan and the fallback timing (14.4 ms)
is only comparable to the custom-check portion of a rendered scan.

---

## 8. How to use this baseline for optimization

1. **Measure the same way:** use the same commands and fixtures; the harness rejects
   `--iterations < 5`; medians are reported with p90/stdev/CV so noise is visible.
2. **Compare phase deltas, not just totals.** Expected wins, from this baseline:
   - Remove/reduce the fixed settle and networkidle policy → up to ~895 ms/page (or ~4.5 s per
     5-page crawl) before changing correctness.
   - Stop paying Playwright start/stop per job (e.g. persistent browser per worker process) →
     up to ~1.6–1.7 s per single-page scan, though correctness/concurrency must be re-validated.
   - Screenshot pipeline changes (parallel capture, lazy screenshots, viewport-only) → up to
     ~1.45 s on an issue-dense single-page scan.
   - `request_delay_ms=250` → 0 for internal crawling → ~1.25–1.32 s per 5-page crawl (policy
     decision, not a code fix).
   - Crawl-memory lookup bounds/pagination and publish de-duplication → ~0.8 s per multi-page
     request and ~127 ms per 5-page crawl *in SQLite*, likely more in PostgreSQL; also fix the
     list N+1 (45 → 2 statements for a 50-row history page).
3. **Do not change fixtures or instrumented phases between baseline and post-optimization runs**
   without recording a new baseline, or the comparison is invalid.
4. **Re-run the cold process section** (`bench_scan.py` includes it by default) to verify that
   any browser reuse actually removes the per-process cold penalty, not just the warm median.

---

## 9. Artefacts

| File | Contents |
|---|---|
| [`scripts/perf/bench_scan.py`](../../scripts/perf/bench_scan.py) | Scanner benchmark harness: fixture server, 7 scenarios + cold subprocess + axe-cache + lifecycle micro-split, phase instrumentation, JSON + markdown output |
| [`scripts/perf/bench_db.py`](../../scripts/perf/bench_db.py) | Database-path benchmark: in-memory SQLite seed, 12 operation measurements, progress-publish amplification, SQL/ORM counting, JSON + markdown output |
| [`scripts/perf/baseline.json`](../../scripts/perf/baseline.json) | Raw scanner results (`schema_version 1`): machine/env, methodology, calibration, cold process, axe cache, lifecycle micro-split, per-scenario warm-up + iterations + aggregates + phases |
| [`scripts/perf/db_baseline.json`](../../scripts/perf/db_baseline.json) | Raw DB results: seed description, per-operation samples/statistics/SQL counts, query-shape observations, write amplification, scoping checks, limitations |
| [`scripts/perf/check_fallback_path.py`](../../scripts/perf/check_fallback_path.py) | Read-only verification of the fallback-path defect (§7) |
| [`scripts/perf/fallback_path_check.json`](../../scripts/perf/fallback_path_check.json) | Fallback defect evidence (normal 22 vs fallback 6 issues, 0 axe calls) |
| [`scripts/perf/delay_teardown_check.json`](../../scripts/perf/delay_teardown_check.json) | Order-controlled duplicate of the delay scenarios, used for the teardown-penalty check (§4.2) |
