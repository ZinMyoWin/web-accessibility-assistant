# Performance results: baseline vs optimized (measured)

**Status:** post-optimization measurement complete. Baseline (`a2bc609` tree, measured
2026-11-03 00:24 Asia/Bangkok) vs optimized working tree (measured 2026-11-03 00:48–00:55),
same machine, same harness, same fixtures/iteration counts. Application code was not modified
by this measurement.

**Evidence**
- Baseline: [`performance-baseline.md`](./performance-baseline.md),
  [`scripts/perf/baseline.json`](../../scripts/perf/baseline.json) (`SHA-256 2995041E…`),
  [`scripts/perf/db_baseline.json`](../../scripts/perf/db_baseline.json) (`818D4882…`),
  plus [`scripts/perf/baseline_addendum.json`](../../scripts/perf/baseline_addendum.json)
  (`F340F54C…`) — the pre-optimization worker-mode and render-failure baselines captured during
  standby before the scanner edits landed.
- Optimized: [`scripts/perf/optimized.json`](../../scripts/perf/optimized.json) (`BB08E9B4…`),
  [`scripts/perf/db_optimized.json`](../../scripts/perf/db_optimized.json) (`D5CB2498…`),
  supplemental [`scripts/perf/db_optimized_quietlogs.json`](../../scripts/perf/db_optimized_quietlogs.json)
  (`BA100DE7…`, slow-scan logging suppressed, used to attribute write-path deltas).
- Controlled recheck: [`scripts/perf/baseline_recheck.json`](../../scripts/perf/baseline_recheck.json)
  (`FAFB6A1F…`) — the current harness re-run against a clean worktree of baseline commit
  `a2bc609`, used to confirm the like-for-like per-call deltas when the harness had evolved
  between the original baseline and optimized runs.
- Analysis: [`scan-performance-analysis.md`](./scan-performance-analysis.md) (design/rationale).

**Environment:** Intel Core i7-10750H (6C/12T, 23.8 GB RAM), Windows 11 Pro build 10.0.26300,
Python 3.13.3, Playwright 1.58.0, Chromium 145.0.7632.6, SQLAlchemy 2.0.49, Pydantic 2.12.5,
repo `fullstack-dev` at commit `a2bc609` + uncommitted optimization changes. Machine quiet
during both runs; host calibration: baseline **+3.8 %** drift (contention flag false),
optimized **+7.0 %** drift (contention flag false).

---

## 1. Executive summary

| Lens | Change |
|---|---|
| **Production shape** (baseline per-job browser lifecycle → optimized worker-level reuse), single-page clean scan | **2783.3 → 850.5 ms (−69.4 %)** |
| Production shape, single-page issue-dense scan with screenshots | **4279.9 → 1584.7 ms (−63.0 %)** |
| Production shape, 5-page crawl (request delay 0) | **7254.4 → 4188.8 ms (−42.3 %)** |
| Production shape, 5-page crawl (request delay 250 ms) | **8577.3 → 5190.2 ms (−39.5 %)** |
| **Like-for-like `scan_page()` per call** (same lifecycle as baseline; confirmed by the controlled same-harness recheck in §4.1b), clean / issue-dense / crawl-delay-0 | **−30.4 % / −17.6 % / −16.5 %** (original baseline run: −32.3 % / −20.6 % / −16.9 %) |
| Render wait per page | **−276.9 ms (−30.9 %)** on a clean page; **−278 ms/page** on crawls |
| Screenshot pipeline (issue-dense single page) | **1516.9 → 824.4 ms (−45.6 %)**; unique captures 19 → **10** (cap), issues with an image 22 → 13 |
| Browser lifecycle per call | driver start + Chromium launch unchanged (~0.9–1.0 s); teardown is **state-dependent** (735–785 ms after light-work pages on baseline code vs 175–195 ms on the optimized timeline; ~700–770 ms for screenshot-heavy pages either way); **worker mode removes both from every scan** (browser_setup 948–1018 ms → 55–64 ms, no per-scan close; one-time session teardown ~1.0–1.5 s per worker session) |
| axe-core cold fetch | **294.0 → 0.87 ms** local asset (−99.7 %); first-scan cold penalty eliminated |
| First scan in a fresh process | **3129.9 → 1974.3 ms (−36.9 %)**; cold subprocess scan #1 4759.5 → 3580.4 ms (−24.8 %) |
| Crawl-memory lookup | **797.52 → 14.88 ms (−98.1 %)**; SQL 2 → 1; ORM rows loaded **20,200 → 0** |
| Progress publish (5-page crawl) | **127.19 → 55.66 ms (−56.2 %)**; issue-row writes **2500 → 500 (−80 %)**; insert amplification **3.0× → 1.0×**; DELETE statements 0 |
| Saved-scan history list (limit 50) | **92.42 → 8.17 ms (−91.2 %)**; SQL statements **45 → 3 (constant)** |
| Status-only polling read (`include_issues=false`) | new measured path: **0.37 ms**, 1 SQL, 1 ORM row |
| Functional equivalence | **PASS** — issue/rule/severity/source counts identical for all scenarios except the documented fallback-fix and screenshot-cap changes |

Expected, documented output changes: screenshot cap `SCAN_MAX_SCREENSHOTS=10` (a page may have
13 issues sharing 10 captured images instead of 19 captures/22 images) and the raw-HTML
fallback now runs axe-core correctly (6 → 22 issues on the issue-dense fixture). Neither is a
regression; see §3.

---

## 2. Method, harness adaptations, and reproducibility

Same harness, machine, fixtures, warm-ups and iteration counts as the baseline:
1 warm-up + 7 measured iterations for single-page scenarios, 1 warm-up + 5 measured for
multi-page scenarios; medians and p90 from the same percentile definition. Commands:

```powershell
# measured optimized runs (this document)
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py   --json-out scripts\perf\optimized.json
backend\venv\Scripts\python.exe scripts\perf\bench_db.py     --iterations 20 --json-out scripts\perf\db_optimized.json
$env:SCAN_SLOW_LOG_SECONDS="999999"
backend\venv\Scripts\python.exe scripts\perf\bench_db.py     --iterations 20 --json-out scripts\perf\db_optimized_quietlogs.json
Remove-Item Env:\SCAN_SLOW_LOG_SECONDS
```

**Harness adaptations (additive; documented per task-10 step 1).** `scripts/perf/bench_scan.py`
was extended during standby, before the optimized code existed, so baseline addendum numbers
could be captured on the pre-optimization tree:

1. **Worker-mode scenarios** (`worker_*`): one `BrowserSession` is reused across every measured
   scan (the production worker shape). Strategy is auto-detected and recorded:
   *native_session_injection* when `scan_page(..., browser_session=...)` exists (optimized run:
   all four worker scenarios used native injection), otherwise a documented emulated shared
   session for the baseline code (baseline addendum used emulation).
2. **`single_render_failure_fallback`** scenario: forces `_scan_rendered_page` to return `None`
   while the browser is available — the exact path affected by the fixed
   `_run_playwright_analysis` undefined-`options` defect. The original
   `single_raw_html_fallback` scenario (browser genuinely unavailable) is unchanged.
3. Phase-name note: `nested:networkidle_wait` now covers the optimized `load` + `networkidle`
   `wait_for_load_state` calls; `nested:fixed_settle_wait` is the configurable settle
   (250–600 ms → 100 ms).

`scripts/perf/bench_db.py` was adapted exactly as the backend owner requested: progress-publish
amplification is now **measured** from `after_cursor_execute` `cursor.rowcount` (INSERT/DELETE/
UPDATE rows) plus `Session.before_flush` ORM issue-instance counts, instead of hardcoded
1500/1000 arithmetic; per-publish row events and per-cycle statement verbs are reported; a
`get_saved_scan_status_only` (`include_issues=False`) operation was added; the crawl-memory
scenario is unchanged. Migration f075 indexes are **not created by `Base.metadata.create_all`**
in SQLite, so index speed-ups are outside this harness; statement/row counts are the portable
evidence and the limitation is stated in `db_optimized.json`.

Baseline artifacts were not modified: `baseline.json` (`2995041E…`), `db_baseline.json`
(`818D4882…`) and `baseline_addendum.json` (`F340F54C…`) hashes are recorded above.
The machine also ran no other heavy jobs during the measured windows.

---

## 3. Functional equivalence verification (PASS)

Compared per scenario: median issue count, median issue counts by rule id, severity counts,
source counts and `summary` counters (all identical across iterations within a scenario).
Optimized vs baseline (`baseline.json` for the seven baseline scenarios, `baseline_addendum.json`
for worker-mode/render-failure scenarios):

| Scenario | Issues | Rule counts | Severity | Sources | Screenshots (baseline → optimized) | Verdict |
|---|---|---|---|---|---|---|
| `single_clean` | 0 → 0 | MATCH | MATCH | MATCH | 0 → 0 | PASS |
| `single_issue_dense_screenshots` | 22 → 22 | MATCH | MATCH | MATCH | 22 → 13 issues with images; **19 → 10 unique captures** | PASS (cap) |
| `single_issue_dense_no_screenshots` | 22 → 22 | MATCH | MATCH | MATCH | 0 → 0 | PASS |
| `single_js_rendered_spa` | 8 → 8 | MATCH | MATCH | MATCH | 8 → 8 | PASS (injected SPA content still captured) |
| `multi_5_pages_delay_0` | 9 → 9 | MATCH | MATCH | MATCH | 0 → 0 | PASS |
| `multi_5_pages_delay_250` | 9 → 9 | MATCH | MATCH | MATCH | 0 → 0 | PASS |
| `single_raw_html_fallback` (browser unavailable) | 6 → 6 | MATCH | MATCH | MATCH | 0 → 0 | PASS |
| `worker_single_clean` | 0 → 0 | MATCH | MATCH | MATCH | 0 → 0 | PASS |
| `worker_single_issue_dense_screenshots` | 22 → 22 | MATCH | MATCH | MATCH | 22 → 13; 19 → 10 captures | PASS (cap) |
| `worker_multi_5_pages_delay_0` | 9 → 9 | MATCH | MATCH | MATCH | 0 → 0 | PASS |
| `worker_multi_5_pages_delay_250` | 9 → 9 | MATCH | MATCH | MATCH | 0 → 0 | PASS |
| `single_render_failure_fallback` | **6 → 22** | baseline custom-only → optimized equals the normal rendered rule set exactly | MATCH-on-optimized | baseline `{custom: 6}` → optimized `{axe-core: 16, both: 4, custom: 2}` | 6 → 13 (10 captures) | **PASS — documented defect fix** |

The render-failure fallback's optimized rule counts are byte-for-byte equal to the normal
rendered issue-dense scenario's rule counts (both 13 rules, `region` ×10, etc.), confirming the
fix produces the correct axe-core result set. Its runtime increases (+544 ms) because axe-core
now actually runs on the fallback path — that is the defect fix, not a regression.

---

## 4. Scanner: baseline vs optimized (measured, ms)

### 4.1 Scenario comparison

| Scenario | baseline median | optimized median | Δ ms | Δ % | baseline p90 | optimized p90 | issues | screenshots (issues with image / captures) |
|---|---|---|---|---|---|---|---|---|
| `single_clean` | 2783.3 | **1884.8** | −898.5 | −32.3 % | 2795.3 | 1897.5 | 0 → 0 | 0 / 0 |
| `single_issue_dense_screenshots` | 4279.9 | **3396.3** | −883.5 | −20.6 % | 4348.4 | 3466.6 | 22 → 22 | 22→13 / 19→10 |
| `single_issue_dense_no_screenshots` | 2827.7 | **2045.1** | −782.6 | −27.7 % | 2854.8 | 2082.9 | 22 → 22 | 0 / 0 |
| `single_js_rendered_spa` | 3543.6 | **3330.3** | −213.3 | −6.0 % | 3644.2 | 3502.8 | 8 → 8 | 8→8 / 8→8 |
| `multi_5_pages_delay_0` | 7254.4 | **6030.6** | −1223.8 | −16.9 % | 7280.1 | 6079.0 | 9 → 9 | – |
| `multi_5_pages_delay_250` | 8577.3 | **6849.3** | −1727.9 | −20.1 % | 8640.3 | 6864.0 | 9 → 9 | – |
| `single_raw_html_fallback` | 14.4 | **16.0** | +1.6 | +11.4 % (noise: 14–16 ms range, CV 65–77 %) | 16.0 | 19.2 | 6 → 6 | 0 / 0 |
| `single_render_failure_fallback` (defect fix) | 2798.7 | **3342.7** | +544.0 | +19.4 % | 2862.8 | 3842.0 | **6 → 22 (fix)** | 6→13 / 6→10 |
| `worker_single_clean` | 1120.3 | **850.5** | −269.8 | −24.1 % | 1232.4 | 927.9 | 0 → 0 | 0 / 0 |
| `worker_single_issue_dense_screenshots` | 2648.2 | **1584.7** | −1063.5 | −40.2 % | 2950.0 | 1649.3 | 22 → 22 | 22→13 / 19→10 |
| `worker_multi_5_pages_delay_0` | 5591.1 | **4188.8** | −1402.3 | −25.1 % | 5614.6 | 4235.1 | 9 → 9 | – |
| `worker_multi_5_pages_delay_250` | 6603.0 | **5190.2** | −1412.8 | −21.4 % | 6657.2 | 5250.0 | 9 → 9 | – |

Optimized-run CVs: 0.29–2.88 % on all time-meaningful scenarios except the forced-fallback
(7.37 %) and the negligible 16 ms raw-HTML fallback (65.31 %); `multi_5_pages_delay_250`
CV 0.29 %. Baseline CVs were 0.39–1.95 %. The optimized scan run took 316.4 s.

### 4.1b Controlled same-harness baseline recheck (comparison validity)

The baseline run predates the harness rewrite (worker-mode scenarios, fallback-failure scenario,
row-event counting). To rule out a harness-version artifact in the per-call deltas, the current
harness was re-run against a **clean git worktree of baseline commit `a2bc609`** (evidence:
[`baseline_recheck.json`](../../scripts/perf/baseline_recheck.json), `FAFB6A1F…`, 216.8 s,
same iteration counts, same machine, calibration drift +7 % as in the optimized run):

| Scenario | original baseline | recheck baseline (current harness) | optimized | recheck → optimized | Δ % |
|---|---|---|---|---|---|
| `single_clean` | 2783.3 | 2706.7 | 1884.8 | −821.9 | **−30.4 %** |
| `single_issue_dense_screenshots` | 4279.9 | 4123.6 | 3396.3 | −727.3 | **−17.6 %** |
| `single_issue_dense_no_screenshots` | 2827.7 | 2700.8 | 2045.1 | −655.7 | **−24.3 %** |
| `single_js_rendered_spa` | 3543.6 | 3413.6 | 3330.3 | −83.3 | **−2.4 %** |
| `multi_5_pages_delay_0` | 7254.4 | 7224.6 | 6030.6 | −1194.0 | **−16.5 %** |
| `multi_5_pages_delay_250` | 8577.3 | 8603.1 | 6849.3 | −1753.8 | **−20.4 %** |

The recheck reproduces the optimized-run direction and magnitude for every scenario
(within a few percentage points), so the per-call deltas are **not** a harness artifact.
It also exposed one nuance worth recording: after the render-wait change, the optimized
timeline closes a **light-work** browser ~4× faster (≈175–195 ms vs 735–785 ms measured
directly on the two trees with an identical local fixture; a run with
`SCAN_RENDER_SETTLE_MS=375`/`SCAN_RENDER_IDLE_TIMEOUT_MS=3000` restored ≈700–753 ms), while
screenshot-heavy pages cost ~700–770 ms to tear down on both trees. Browser teardown is
therefore state/timeline-dependent; it is measured here rather than "free", and it is
irrelevant to production because worker mode reuses the browser and never pays it per scan.

### 4.2 Two production views

1. **Like-for-like per-call path** (`scan_page()` without an injected session — the baseline
   production shape, still supported behind `SCAN_BROWSER_REUSE_ENABLED=false`): the per-call
   scenarios above. The browser is still started/stopped per job, so the wins are the render
   wait, screenshot cap, axe vendoring and the state-dependent teardown effect quantified in
   §4.1b.
2. **Production worker shape** (one `BrowserSession` reused across jobs): compare the
   optimized `worker_*` rows with the baseline **per-call** numbers (that is what production did
   before): clean **2783.3 → 850.5 (−69.4 %)**, issue-dense with screenshots
   **4279.9 → 1584.7 (−63.0 %)**, 5-page crawl delay 0 **7254.4 → 4188.8 (−42.3 %)**,
   delay 250 **8577.3 → 5190.2 (−39.5 %)**.

### 4.3 Phase-level comparison — per-call path (ms/scan)

| Phase | clean base → opt | issue-dense base → opt | multi delay0 base → opt | multi delay250 base → opt |
|---|---|---|---|---|
| `browser_setup` (incl. lazy start) | 971.2 → 897.9 (−73.3) | 948.0 → 1018.4 (+70.4) | 1171.4 → 1256.7 (+85.3) | 1180.0 → 1171.0 (−9.0) |
| ↳ `nested:browser_start` | 899.1 → 822.0 (−77.1) | 875.9 → 940.5 (+64.6) | 882.3 → 950.5 (+68.2) | 890.5 → 886.8 (−3.7) |
| `goto` | 14.9 → 14.5 | 15.3 → 17.3 | 66.4 → 84.3 | 76.1 → 67.1 |
| `render_wait` | 895.6 → **618.7 (−276.9)** | 898.1 → **618.9 (−279.2)** | 4477.1 → **3073.9 (−1403.2)** | 4458.0 → **3072.4 (−1385.6)** |
| ↳ `nested:networkidle_wait` | 511.7 → 509.4 | 509.0 → 509.8 | 2542.4 → 2532.6 | 2522.2 → 2531.9 |
| ↳ `nested:fixed_settle_wait` | 383.9 → **109.3 (−274.6)** | 389.2 → **109.1 (−280.1)** | 1934.7 → **541.2 (−1393.5)** | 1935.7 → **540.5 (−1395.2)** |
| `request_delay` (literal sleep) | – | – | – | 1001.5 → 1001.6 (policy unchanged) |
| `page_content` | 7.0 → 6.6 | 6.7 → 6.8 | 31.0 → 33.1 | 29.9 → 28.7 |
| `axe_core` | 164.7 → 153.2 | 182.0 → 184.8 | 743.6 → 790.5 | 752.7 → 732.9 |
| `screenshots_total` | 0 | **1516.9 → 824.4 (−692.5)** | – | – |
| ↳ `nested:screenshot_capture` (calls/scan) | 0 | 1514.6 → 822.8 (19 → 10 captures) | – | – |
| ↳ `nested:screenshot_store` | 0 | 2.2 → 1.5 | – | – |
| `context_close` | 10.9 → 11.3 | 7.5 → 8.1 | 38.5 → 42.7 | 39.7 → 40.4 |
| `browser_close` | 713.1 → **181.1** | 718.4 → 730.8 | 713.5 → 729.0 | 1029.6 → 708.8 |

Readings:

- **Render-wait tuning** is the uniform per-page win: the fixed settle drops from
  384–389 ms to ~109 ms/page (86 % of the old settle), i.e. **−275 ms/page**; over five crawled
  pages that is **−1.39 s** per crawl. `networkidle` itself is unchanged (~509 ms/page), which
  is why the SPA scenario only improves −6.0 % (its 150 ms injected content is still covered by
  networkidle, but the redundant settle was only ~275 ms of its 3.54 s). The SPA still reports
  all 8 issues — functional equivalence holds.
- **Screenshot cap** cuts unique captures 19 → 10 and the pipeline from **1516.9 → 824.4 ms
  (−45.6 %)**; 13 issues (down from 22) now carry an image because shared/capped selectors reuse
  or omit captures. Screenshot storage remains negligible (1.5 ms, inline data URLs).
- **Per-call browser lifecycle is not reduced by design** (`browser_start` ~0.85–0.95 s,
  `browser_close` ~0.7 s per job). Optimized `browser_close` medians for the two low-work
  scenarios (clean 181.1 ms, no-screenshots 194 ms) are lower than baseline (~713 ms) and lower
  than the isolated lifecycle micro-benchmark (560.7 ms); teardown varies with renderer state
  (181–748 ms across scenarios) and is reported as measured — the controlled recheck in §4.1b
  confirms this is a real timeline/state effect, not a harness artifact. This variability is
  irrelevant to the production shape because worker mode removes per-scan teardown entirely.
- `axe_core` per page is essentially unchanged (153–185 ms single, 733–791 ms per 5-page crawl);
  the gain from axe is the removed CDN fetch (§6), not the analysis itself.

### 4.4 Phase-level comparison — worker mode (baseline addendum emulated → optimized native)

| Phase (ms/scan) | worker clean | worker dense+screenshots | worker multi delay0 | worker multi delay250 |
|---|---|---|---|---|
| `browser_setup` | 54.6 → 64.0 | 57.6 → 54.5 | 270.4 → 267.7 | 263.6 → 261.6 |
| `goto` | 13.7 → 16.1 | 13.2 → 16.5 | 68.3 → 64.6 | 68.9 → 63.2 |
| `render_wait` | 889.1 → **612.9** | 893.5 → **610.7** | 4451.1 → **3070.0** | 4456.6 → **3074.9** |
| ↳ settle | 383.5 → 108.2 | 384.6 → 108.4 | 1932.7 → 540.6 | 1926.3 → 539.6 |
| `request_delay` | – | – | – | 1001.2 → 1001.3 |
| `axe_core` | 153.3 → 163.2 | 237.8 → 163.7 | 732.8 → 717.8 | 749.0 → 721.0 |
| `screenshots_total` | 0 | 1514.2 → **745.9** | – | – |
| `context_close` | 38.6 → 7.2 | 6.0 → 6.4 | 36.3 → 38.0 | 37.0 → 37.5 |
| per-scan browser start / close | **0 / 0** | **0 / 0** | **0 / 0** | **0 / 0** |
| one-time session teardown | 1019.0 → 1038.5 | 1047.9 → 1042.0 | 1483.8 → 1022.5 | 1022.9 → 1045.0 |

Worker-mode scans contain no per-scan `browser_start`/`browser_close` at all: `browser_setup` is
a context+page creation (55–64 ms single page, ~268 ms for five pages), and the single
`BrowserSession` is closed once per scenario (~1.0–1.5 s, amortised across every job the worker
process runs; with the 250-job recycle this is ~4–6 ms/job). Worker-mode optimized medians:
clean **850.5 ms**, dense+screenshots **1584.7 ms**, crawl delay 0 **4188.8 ms**, delay 250
**5190.2 ms**.

---

## 5. Cold process, first scan, and browser lifecycle micro-benchmark

| Measurement | Baseline | Optimized | Δ |
|---|---|---|---|
| First scan in the benchmark process (clean fixture, axe cache cold) | 3129.9 ms | **1974.3 ms** | −36.9 % |
| Cold subprocess scan #1 / #2 / #3 (issue-dense + screenshots) | 4759.5 / 4259.8 / 4249.5 ms | **3580.4 / 3189.2 / 3197.2 ms** | −24.8 % / −25.1 % / −24.8 % |
| Cold-process scan #1 phases: `render_wait` / `axe_script_fetch` / `axe_core` | 877.8 / 376.5 / 555.4 ms | **619.8 / 0.9 / 454.4 ms** | render −258; CDN eliminated |
| Cold-process `browser_start` | 1003.7 ms | 925.9 ms | −7.7 % |
| First-scan vs third-scan gap inside a fresh process | +510.0 ms | +383.2 ms | first-scan penalty reduced |
| Lifecycle micro: `sync_playwright().start()` | 899.9 ms | 835.8 ms | −7.1 % |
| Lifecycle micro: `chromium.launch()` | 96.6 ms | 79.3 ms | −17.9 % |
| Lifecycle micro: context+page+navigation | 109.6 ms | 87.3 ms | −20.3 % |
| Lifecycle micro: `browser.close()` | 563.5 ms | 560.7 ms | −0.5 % |
| Lifecycle micro: `playwright.stop()` | 18.5 ms | 16.2 ms | −12.4 % |
| Lifecycle micro: setup / teardown / total | 1127.5 / 595.9 / 1716.0 ms | **1001.5 / 584.1 / 1587.3 ms** | −11.2 % / −2.0 % / −7.5 % |

The isolated lifecycle micro-benchmark (fresh browser per repetition, no scanner) shows the
per-process browser cost itself is largely unchanged; the optimization's win is **not launching
it per job** (worker mode) plus waiting/screenshot/axe-asset reductions. Some of the −7.5 %
micro-benchmark delta is host drift (calibration moved +7.0 % slower over the optimized run, so
the true improvement is likely smaller).

---

## 6. axe-core cache: vendored asset removes the cold penalty

| Measurement | Baseline (CDN) | Optimized (vendored asset) |
|---|---|---|
| axe-core source | cdnjs 4.10.2 download at first scan per process | `backend/app/assets/axe.min.js` (553,283 bytes, local) |
| Cold `_get_axe_script()` fetch (module cache reset) | **294.0 ms** | **0.87 ms** |
| Warm fetch | 0.002 ms | 0.001 ms |
| Cold-cache scan median (issue-dense + screenshots) | 4725.2 ms | 3238.3 ms |
| Warm-cache scan median | 4451.1 ms | 3258.9 ms |
| Measured cold-cache penalty | **+274.1 ms** | **−20.6 ms** (i.e. none; within noise) |

The first scan per process no longer depends on cdnjs; the cold penalty is eliminated and the
worker also warms the cache at startup (`warm_axe_cache()`), so user-visible first scans do not
pay the asset load either. `nested:axe_script_fetch` is 0.0 ms in all warm scenarios.

---

## 7. Database path: baseline vs optimized (in-memory SQLite)

> Same caveat as the baseline: SQLite in memory is not PostgreSQL. Migration f075 composite
> indexes are **not** created by `Base.metadata.create_all` in this harness, so their effect is
> not measured here; the portable evidence is SQL statement counts, ORM rows loaded and measured
> DML row events. Absolute times remain optimistic lower bounds for PostgreSQL.

### 7.1 Repository operation comparison (20 measured iterations after 1 warm-up)

| Operation | baseline ms | optimized ms | Δ % | SQL stmts base → opt | ORM rows loaded base → opt | optimized DML rows ins/del/upd |
|---|---|---|---|---|---|---|
| `list_saved_scans_limit_10` | 30.70 | **5.50** | −82.1 % | 12 → **3** | 10 → 10 | 0/0/0 |
| `list_saved_scans_limit_50` | 92.42 | **8.17** | −91.2 % | 45 → **3** | 50 → 50 | 0/0/0 |
| `list_saved_scans_status_filter` | 1.35 | 1.39 | +2.3 % | 2 → 2 | 10 → 10 | 0/0/0 |
| `list_saved_scans_q_ilike` | 1.11 | 1.17 | +5.9 % | 2 → 2 | 1 → 1 | 0/0/0 |
| `get_saved_scan_100_issues` (full detail) | 4.73 | 5.08 | +7.4 % | 2 → 2 | 101 → 101 | 0/0/0 |
| `get_saved_scan_status_only` (`include_issues=false`) | – | **0.37** | new | – → 1 | – → 1 | 0/0/0 |
| `get_previously_scanned_page_urls_for_domain` (crawl memory) | 797.52 | **14.88** | **−98.1 %** | 2 → **1** | **20,200 → 0** | 0/0/0 |
| `get_scan_queue_state` | 0.58 | 0.57 | −1.0 % | 2 → 2 | 1 → 1 | 0/0/0 |
| `is_scan_cancel_requested` | 0.17 | 0.18 | +5.7 % | 1 → 1 | 0 → 0 | 0/0/0 |
| `claim_next_queued_scan` | 1.01 | 1.03 | +2.5 % | 3 → 3 | 1 → 1 | 0/1/0 |
| `recover_stale_running_scans` (20 stale) | 1.70 | 1.74 | +2.5 % | 2 → 2 | 20 → 20 | 0/0/20 |
| `complete_running_scan_100_issues` | 9.72 | 12.08 | **+24.2 %** | 5 → 5 | 1 → 1 | 100/0/1 |
| `save_completed_scan_100_issues` | 7.51 | 8.59 | **+14.3 %** | 3 → 3 | 0 → 0 | 101/0/0 |

- **Crawl memory** is the headline DB win: the request-blocking, O(history) eager-load is gone.
  Same operation, same returned set semantics: **1 SELECT, 0 ORM rows** (it streams URL columns
  from the cursor), **797.5 → 14.9 ms (−98.1 %)**. In PostgreSQL this also removes the
  transfer/materialization of every issue row.
- **History list N+1 removed:** 45 → 3 statements at limit 50 (constant: COUNT + page SELECT +
  one batched column-only issue-page-URL query) and 92.4 → 8.2 ms (−91.2 %); limit 10 is
  30.7 → 5.5 ms (−82.1 %, 12 → 3 statements). Filtered lists are unchanged (they never needed
  the fallback).
- **Detail read unchanged by design** (needs its 100 issues: 2 SELECTs / 101 ORM rows,
  +0.35 ms = noise); the new status-only polling read is **0.37 ms / 1 SQL / 1 ORM row**,
  matching the backend owner's API measurement and making the 2 s dashboard poll O(1) in rows.
- **Write paths:** completion (`complete_running_scan`) and background save now also record
  metrics and (for scans slower than `SCAN_SLOW_LOG_SECONDS=10`) emit one structured slow-scan
  log line. At default settings the medians rise **+24.2 %** (9.72 → 12.08 ms) and **+14.3 %**
  (7.51 → 8.59 ms); with slow-scan logging suppressed they are 11.37 ms (+16.9 %) and 7.39 ms
  (−1.6 %), and a second default-settings run gave 10.71 ms (+10.2 %) and 7.87 ms (+4.8 %).
  Interpretation: roughly half of the increase is the optional slow-scan logging on our
  artificially slow (30 s) synthetic scans, the rest is observability-hook overhead plus
  sub-10 ms measurement noise. Absolute cost is tiny, but this is the one write-path
  **regression candidate** and is called out in §9.

### 7.2 Progress publish (5-page crawl, 100 issues/page): measured write amplification

The harness now counts real INSERT/DELETE events (SQLAlchemy `cursor.rowcount` +
`Session.before_flush` ORM counts), not hardcoded arithmetic:

| Metric | Baseline (delete + reinsert) | Optimized (append-only) |
|---|---|---|
| Issue-row INSERTs per 5-page crawl | 1,500 | **500** |
| Issue-row DELETEs per 5-page crawl | 1,000 | **0** |
| Total issue-row write operations | 2,500 | **500 (−80 %)** |
| Final persisted issue rows (verified) | 500 | **500** |
| Insert amplification vs final rows | 3.0× | **1.0×** |
| Row-write operations per final issue | 5.0× | **1.0×** |
| SQL statements per cycle (select/insert/delete) | 26 (n/a / n/a / n/a) | **25 = 15 SELECT + 5 INSERT + 0 DELETE** |
| Cumulative cycle time (median / p90) | 127.19 / 135.86 ms | **55.66 / 58.62 ms (−56.2 %)** |
| Per-publish medians | 10.87 → 17.86 → 24.22 → 30.86 → 37.42 ms | **10.88 → 10.92 → 11.28 → 11.33 → 10.99 ms (flat)** |
| ORM issue rows inserted deleted | 1,500 / 1,000 | 500 / 0 |

The delete+reinsert amplification is gone: each publish now performs a small count/max-position
SELECT and appends only the new tail, so cost is flat (~11 ms) instead of growing linearly to
37.4 ms, and total row churn for the crawl drops 5×. `complete_running_scan` keeps the single
authoritative replace, as designed.

---

## 8. What produced which gain (measured attribution)

| Change | Measured contribution |
|---|---|
| **Worker-level browser reuse** | Removes 0.95–1.26 s of `browser_setup` (incl. ~0.9 s driver/browser start) and ~0.7–1.0 s of `browser_close` from every scan job: worker-mode `browser_setup` falls to 55–268 ms (context/page only) with no per-scan close. Production-shape headline: clean −1.93 s (−69.4 %), issue-dense −2.70 s (−63.0 %), 5-page crawl −3.07 s to −3.39 s (−42.3 % / −39.5 %). One-time session teardown 1.0–1.5 s is amortised (e.g. 250-job recycle ⇒ ~4–6 ms/job). |
| **Render-wait tuning** (`SCAN_RENDER_SETTLE_MS` 250–600 → 100, `SCAN_RENDER_IDLE_TIMEOUT_MS` 3000 → 1500) | Fixed settle 384–389 → 109 ms/page: −275 ms/page; −1.39 s per 5-page crawl (`multi_5_pages_delay_0` render_wait 4477 → 3074 ms). `networkidle` (~509 ms/page) unchanged. This is the win that applies even on the per-call path (`single_clean` −32.3 %). |
| **Screenshot cap** (`SCAN_MAX_SCREENSHOTS=10`) | Unique captures 19 → 10; pipeline 1516.9 → 824.4 ms (−692.5 ms, −45.6 %); screenshot delta in the A/B scenario 1452.2 → 1351.2 ms. Functional cost: 13 vs 22 issues carry an image (documented cap). |
| **Vendored axe-core + warm cache** | Cold fetch 294.0 → 0.87 ms; cold-cache penalty +274.1 → none; first scan in a fresh process 3129.9 → 1974.3 ms (−36.9 %, includes render/screenshot gains too). No CDN dependency at scan time. |
| **Crawl-memory query rewrite** | 797.5 → 14.9 ms (−98.1 %), 20,200 → 0 ORM rows, 2 → 1 statement per multi-page request. |
| **Incremental issue persistence** | 2,500 → 500 issue-row writes (−80 %), 3.0× → 1.0× insert amplification, publish cycle 127.2 → 55.7 ms (−56.2 %), per-publish cost flat instead of linear. |
| **History N+1 removal** | limit 50: 45 → 3 statements, 92.4 → 8.2 ms (−91.2 %); limit 10: 12 → 3, 30.7 → 5.5 ms (−82.1 %). |
| **Lightweight polling** (`include_issues=false`) | New measured path 0.37 ms / 1 SQL / 1 ORM row vs full detail 5.08 ms / 2 SQL / 101 ORM rows; removes O(issues) payload growth from the dashboard's 2 s poll. |
| **Still linear / unchanged** | `request_delay` sleep (1001.5 → 1001.6 ms; policy not code), `networkidle` floor (~509 ms/page), `goto`/`content`/`parse` (<100 ms/scan), axe analysis per page (~150–790 ms), per-call browser lifecycle when reuse is disabled. |

---

## 9. Regressions, risks, and caveats

1. **Fallback path deliberately slower and now correct** (`single_render_failure_fallback`
   +544 ms, 6 → 22 issues). axe-core now actually runs on the raw-HTML fallback (586.7 ms axe
   phase); this is the defect fix requested, not a regression. The browser-unavailable fallback
   is unchanged (6 issues, ~15 ms).
2. **Completion/save write paths +10–24 % in SQLite** (absolute +1–2.4 ms per scan): caused by
   the new observability hooks (metrics recording + optional slow-scan log line). Verify on
   PostgreSQL only if write latency becomes a concern; not a throughput risk at these margins.
3. **`single_raw_html_fallback` +1.6 ms** (14.4 → 16.0 ms) is noise: both are ~15 ms operations
   with 65–77 % CV in a 1.3–19 ms range.
4. **SPA only −6.0 %** because its networkidle floor and injected-content wait dominate; the
   redundant settle was a small part of that scenario. Also not a regression (8/8 issues still
   detected).
5. **Per-call path still pays browser lifecycle** (~1.6–1.8 s/scan). That is intentional for
   the kill switch (`SCAN_BROWSER_REUSE_ENABLED=false`); production should keep reuse enabled to
   get the headline numbers in §1/§4.2.
6. **Measurement caveats.** Host calibration drifted +7.0 % during the optimized run (baseline
   +3.8 %); scanner CVs were 0.29–2.88 % on meaningful scenarios so the deltas above are far
   outside noise, but absolute values carry a few percent of run-to-run/machine variance. The
   optimized scenario-level `browser_close` medians were bimodal (181–748 ms depending on
   renderer state); the isolated lifecycle micro-benchmark (560.7 ms) bounds that cost. Fixtures
   are local HTTP, so target-network latency is absent; Cloudinary is unset (data-URL screenshot
   storage). SQLite is optimistic vs PostgreSQL; migration-index effect is unmeasured (§7).
7. **Functional equivalence is exact** for all latency scenarios: issue counts, per-rule counts,
   severities and sources matched the baseline; only the documented screenshot cap and fallback
   fix differ.

---

## 10. Numbers for `scan-performance-analysis.md` §8 (paste-ready)

**Measured 2026-11-03 on the same machine/harness as the baseline (Playwright 1.58.0, Chromium
145.0.7632.6, i7-10750H/23.8 GB). Deterministic fixtures, 1 warm-up + 7 measured iterations
(single-page) / 5 (multi-page), medians.**

| Workload | Baseline | Optimized | Improvement |
|---|---|---|---|
| Single-page clean, production shape (worker browser reuse) | 2783.3 ms | **850.5 ms** | **−1932.8 ms (−69.4 %)** |
| Single-page issue-dense (22 issues) with screenshots, production shape | 4279.9 ms | **1584.7 ms** | **−2695.2 ms (−63.0 %)** |
| 5-page crawl, delay 0, production shape | 7254.4 ms | **4188.8 ms** | **−3065.6 ms (−42.3 %)** |
| 5-page crawl, delay 250 ms, production shape | 8577.3 ms | **5190.2 ms** | **−3387.1 ms (−39.5 %)** |
| Single-page clean, per-call `scan_page` (lifecycle kill switch) | 2783.3 ms | 1884.8 ms | −898.5 ms (−32.3 %) |
| Single-page issue-dense + screenshots, per-call | 4279.9 ms | 3396.3 ms | −883.5 ms (−20.6 %) |
| 5-page crawl delay 0 / delay 250, per-call | 7254.4 / 8577.3 ms | 6030.6 / 6849.3 ms | −16.9 % / −20.1 % |
| Render wait per page | 895.6 ms | 618.7 ms | −276.9 ms/page; fixed settle 384 → 109 ms/page |
| Screenshot pipeline (19 → 10 unique captures) | 1516.9 ms | 824.4 ms | −45.6 % (13 vs 22 issues carry an image) |
| First scan in a fresh process | 3129.9 ms | 1974.3 ms | −36.9 % |
| axe-core cold fetch (first scan per process) | 294.0 ms | 0.87 ms | −99.7 % (vendored asset + warm cache) |
| Browser lifecycle per scan | ~1.6–1.8 s (launch+close) | removed in worker mode (one-time session teardown 1.0–1.5 s, amortised) | — |
| Crawl-memory lookup (200 scans × 100 issues) | 797.5 ms, 2 SQL, 20,200 ORM rows | **14.9 ms, 1 SQL, 0 ORM rows** | **−98.1 %** |
| Progress publish, 5 pages × 100 issues | 127.2 ms, 2,500 row writes (1,500 INSERT + 1,000 DELETE), 3.0× insert amplification | **55.7 ms, 500 row writes (500 INSERT + 0 DELETE), 1.0×** | **−56.2 % time, −80 % row churn** |
| History list limit 50 | 92.4 ms, 45 SQL statements | **8.2 ms, 3 SQL statements** | **−91.2 %** |
| Status-only polling read (`include_issues=false`) | (not measured previously; full detail 4.7 ms/101 rows) | **0.37 ms, 1 SQL, 1 ORM row** | O(1) row read |
| Functional equivalence | — | — | PASS; only documented screenshot-cap and fallback-fix output changes |

Optimized medians and raw samples: [`scripts/perf/optimized.json`](../../scripts/perf/optimized.json);
DB evidence: [`scripts/perf/db_optimized.json`](../../scripts/perf/db_optimized.json) (and
`db_optimized_quietlogs.json` for the logging attribution). Baseline evidence:
[`scripts/perf/baseline.json`](../../scripts/perf/baseline.json),
[`scripts/perf/db_baseline.json`](../../scripts/perf/db_baseline.json),
[`scripts/perf/baseline_addendum.json`](../../scripts/perf/baseline_addendum.json).

---

## 11. Reproduction (exact commands)

```powershell
# Baseline (already recorded on tree a2bc609; do not re-run on the optimized tree)
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py
backend\venv\Scripts\python.exe scripts\perf\bench_db.py

# Optimized (this document)
backend\venv\Scripts\python.exe scripts\perf\bench_scan.py --json-out scripts\perf\optimized.json
backend\venv\Scripts\python.exe scripts\perf\bench_db.py --iterations 20 --json-out scripts\perf\db_optimized.json

# Supplemental: attribute write-path deltas to slow-scan logging
$env:SCAN_SLOW_LOG_SECONDS="999999"
backend\venv\Scripts\python.exe scripts\perf\bench_db.py --iterations 20 --json-out scripts\perf\db_optimized_quietlogs.json
Remove-Item Env:\SCAN_SLOW_LOG_SECONDS
```

Scanner benchmark runtime: baseline 257.5 s, optimized 316.4 s (12 scenarios incl. worker-mode and
render-failure paths). DB benchmark: baseline 23.9 s, optimized 3.4 s (the crawl-memory and
list operations themselves became 1–2 orders of magnitude cheaper, so the whole suite is faster).

**Artefacts:** [`scripts/perf/optimized.json`](../../scripts/perf/optimized.json),
[`scripts/perf/db_optimized.json`](../../scripts/perf/db_optimized.json),
[`scripts/perf/db_optimized_quietlogs.json`](../../scripts/perf/db_optimized_quietlogs.json),
[`scripts/perf/baseline_addendum.json`](../../scripts/perf/baseline_addendum.json),
harness [`scripts/perf/bench_scan.py`](../../scripts/perf/bench_scan.py) and
[`scripts/perf/bench_db.py`](../../scripts/perf/bench_db.py).
