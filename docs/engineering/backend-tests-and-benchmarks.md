# Backend tests and performance scripts

This guide helps a developer choose an appropriate backend check and understand what its result means. The test and script descriptions below come from inspecting source, fixtures and representative assertions. They are not a report of a test or benchmark run in this documentation session. For behavior and known limitations, see [backend scanning](../modules/backend-scanning.md), [scan repository functions](../modules/backend-scan-repository-functions.md), and [backend foundations](../modules/backend-foundations-functions.md).

## What the tests do and how to use them

The repository uses pytest for backend tests. From `backend/`, the project guide gives `.\venv\Scripts\python.exe -m pytest -q`; to investigate a specific behavior, append a test file path or a pytest node such as `tests/test_scan_repository_unit.py::test_saved_scan_queries_are_scoped_to_user`. Review the test and setup before running it, especially when adding a new integration test: a test name alone does not establish which services or data it touches.

Many existing tests are unit tests with a fake browser, fake network/provider response, monkeypatched functions or a synthetic SQLite database. Others use FastAPI `TestClient` to invoke routes in the same test process. These are valuable for behavior and regression checks, but an in-process client is not a deployed HTTP server, and mocks do not verify a real Google login, AI provider, browser, PostgreSQL deployment or network isolation. Check each fixture and assertion before drawing a broader conclusion.

### Test file map

| File | What it exercises and useful boundaries |
| --- | --- |
| [test_api_smoke.py](../../backend/tests/test_api_smoke.py) | FastAPI route behavior for health, auth, scans, queue controls and repairs, plus scanner flows with fakes. Several tests override the database dependency and monkeypatch auth/repository/scanner calls, so they are not full persistence or external-provider tests. |
| [test_auth_unit.py](../../backend/tests/test_auth_unit.py) | Password and token helpers, session lookup/revocation and reset-token behavior using real repository functions and synthetic SQLite rows. |
| [test_bundle_and_cancel_api.py](../../backend/tests/test_bundle_and_cancel_api.py) | Repair bundle formats, ownership/auth checks and queued/running/terminal cancellation responses through `TestClient` with SQLite; the fixture replaces token lookup with a test user. |
| [test_mcp_api.py](../../backend/tests/test_mcp_api.py) | Signed assertions, linking/unlinking, authorization, bounded scan/issue data and rate limits, including concurrent test sessions. Uses temporary file-backed SQLite and test identities; it is not a live OAuth or MCP client connection. |
| [test_page_scanner_unit.py](../../backend/tests/test_page_scanner_unit.py) | Custom HTML checks, discovered URLs, queue filtering, screenshot storage and multi-page behavior using test doubles where needed. |
| [test_perf_api_unit.py](../../backend/tests/test_perf_api_unit.py) | Migration graph and selected index operations on SQLite, query shapes and issue writes, lightweight polling, connection pool options, rate limits and metrics. It does not establish PostgreSQL query plans or locking behavior. |
| [test_preferences_unit.py](../../backend/tests/test_preferences_unit.py) | Preference defaults, partial update/reset, notification validation and route behavior. Inspect its dependency overrides when changing persistence or auth. |
| [test_repair_bundle_unit.py](../../backend/tests/test_repair_bundle_unit.py) | Markdown/JSON bundle content, missing groups, format normalization and rejection. |
| [test_repair_suggestion_repository_unit.py](../../backend/tests/test_repair_suggestion_repository_unit.py) | Issue grouping and saved suggestion scope using synthetic records. |
| [test_repair_suggestion_service_unit.py](../../backend/tests/test_repair_suggestion_service_unit.py) | Provider/model selection, prompt constraints and a mocked DeepSeek request/response; this does not validate a real provider's output or availability. |
| [test_scan_cancel_unit.py](../../backend/tests/test_scan_cancel_unit.py) | Cancellation flags, partial issue retention, stale recovery, worker/background handling and scanner checkpoints with repository sessions or mocks. |
| [test_scan_options_resolver_unit.py](../../backend/tests/test_scan_options_resolver_unit.py) | Preference/request precedence, page cap, WCAG tags, serialized options and selected worker reconstruction fields. |
| [test_scan_perf_unit.py](../../backend/tests/test_scan_perf_unit.py) | Browser reuse, waits, screenshot cap, axe loading, timing, fallback paths and target URL checks with extensive fakes/monkeypatches. |
| [test_scan_repository_unit.py](../../backend/tests/test_scan_repository_unit.py) | Scores, queue changes, partial/final issue persistence, recovery and user scoping on SQLite. |
| [test_scan_worker_unit.py](../../backend/tests/test_scan_worker_unit.py) | Default poll interval and forwarding of partial progress through worker queue callbacks. Additional worker cases occur in scan performance and cancellation tests. |

### Common fixtures and their limits

`_session()` helpers in the auth and scan repository tests create new in-memory SQLite engines and selected tables. This exercises real SQLAlchemy repository operations, but is not a migration upgrade against an existing PostgreSQL database. The bundle/cancellation API fixture uses `StaticPool` and `check_same_thread=False` so its in-memory database is visible to FastAPI's test thread, and overrides token lookup. The MCP `api` fixture instead creates a temporary SQLite file, constructs test users/sessions and signed assertions, overrides the FastAPI database dependency, then clears overrides and disposes its engine.

`test_perf_api_unit.py` has a helper that can use shared in-memory SQLite and creates tables from model metadata. Its migration test checks the current f076 head and f075 ancestry, and separately exercises f075 index operations on SQLite. This is not equivalent to upgrading a production database from every older revision. Several API tests use `monkeypatch` to replace services or database access; follow those replacements to know what is actually tested.

## Benchmark scripts: important side effects

The scripts under [scripts/perf](../../scripts/perf/) are separate from pytest. They write JSON reports and can overwrite the specified output file. They collect machine/timing metadata. Their existing JSON files are historical snapshots, not current verification; compare their generation date, source version, settings and methodology before using them to claim an improvement.

### `bench_scan.py`: browser and scanner timing

[bench_scan.py](../../scripts/perf/bench_scan.py) starts a local HTTP fixture server on an ephemeral loopback port, imports the scanner directly and can launch real Playwright/Chromium. It does **not** run the FastAPI request, authenticate a user or write to the application database. It measures clean, issue-dense, JavaScript-rendered, multi-page and fallback scenarios, plus scenarios that reuse one browser session like a worker. Fixture network latency is local and cannot represent real sites.

Important functions:

* `start_fixture_server()` starts the threaded local server and waits for `/clean`; `_FixtureHandler.do_GET` serves fixed HTML, image and robots responses. The caller shuts the server down. If private scan targets are disabled, the loopback URL may be rejected by the application validator.
* `_load_app()` imports the scanner and reports import time. `_install_instrumentation()` temporarily wraps scanner, browser and axe functions to record phase durations, returning an `ExitStack` that restores patches. `PhaseRecorder`, `_PageProxy` and `_ContextProxy` collect timings and call counts. Nested phase values overlap their parent and must not be added to parent totals.
* `_measure_call` and `_measure_once` run scans and record duration, page/issue counts, sources and screenshots. `_run_scenario` performs a warm-up then samples; `_run_worker_mode_iterations` reuses a browser session across scans and times its final close separately. These worker-shaped samples do not run the worker's database claim, progress or retry loop.
* `_run_cold_child` starts a fresh Python subprocess for cold scans; `_cold_inner_main` runs its measurements and returns a marked JSON line. `_measure_axe_cache_cold_vs_warm` resets the process axe cache to compare cold/warm scans. A local axe asset is preferred by the application, but its fallback can fetch from a CDN if the asset is unavailable.
* `_parse_arguments`, `_scenarios_to_run` and `main` select work, calculate summaries and write the JSON report. `--only` selects comma-separated scenario IDs, `--quick` reduces sampling, `--skip-cold` omits the subprocess and `--skip-axe-cache` skips cache/lifecycle sections. `--json-out` chooses an output path; the default is `scripts/perf/baseline.json` and is overwritten.

**Configuration and interpretation caveats:** The scanner may use Cloudinary for screenshots if configured, so running this script can upload fixture screenshots externally; axe loading may also reach a CDN. The generated report records whether Cloudinary is configured, but one hardcoded methodology sentence says it is unset even when that may not be true. Also, in non-quick mode the scenario loop uses each `Scenario.iterations` value rather than the provided `--iterations` value; `--quick` uses the parsed value in that loop. Read the actual samples and code rather than trusting those labels. Other settings, browser availability and machine load can change results.

### `bench_db.py`: repository query and write shape

[bench_db.py](../../scripts/perf/bench_db.py) explicitly creates an **in-memory SQLite** engine and seeds synthetic data, including 200 completed user-A scans with 100 issues each, 20 queued and 20 stale running scans, plus a second user's scans. It calls real scan repository functions against this temporary database. It does not read an application database connection URL to choose its engine. Writes, deletes and commits in the harness affect this synthetic in-memory database; it writes a JSON report to `scripts/perf/db_baseline.json` by default, overwriting it, or to the path supplied by `--json-out`.

`DbCounter` attaches SQLAlchemy event listeners to count SQL statements, affected rows and loaded ORM objects. `_seed_database` and `_bulk_insert` create fixture rows; `_timed_operation` runs a warm-up and repeated operations, with setup where needed. `_measure_progress_publishes` resets synthetic progress state and measures successive cumulative issue writes. `main` measures history listing/filtering, detail and polling, crawl-memory lookup, queue/cancel reads, claim, stale recovery, completion, synchronous save and progress updates; `_scoping_checks` checks selected user isolation behavior. `--iterations` defaults to 20 and values below 20 are rejected.

SQLite in memory has no PostgreSQL network latency or equivalent row-lock semantics; it does not model concurrent workers, production connection pools, real issue-size distributions or PostgreSQL planner behavior. The f075 composite indexes are created by a migration rather than model metadata and are not present in this harness's `create_all` database. Statement/row counts are useful evidence for this synthetic workload; absolute timing and production index speedups cannot be inferred from them alone.

### `check_fallback_path.py`: historical diagnostic with stale conclusions

[check_fallback_path.py](../../scripts/perf/check_fallback_path.py) imports the scan harness, runs a normal local fixture scan and a scan with rendered analysis forced to fail, then makes a direct fallback call using fake browser objects and an axe-call spy. `_sources` summarizes issue sources; `main` prints and **overwrites** `scripts/perf/fallback_path_check.json`. It may launch a real browser, and the same scanner storage/CDN caveats apply.

Its `CODE_REFERENCE` and conclusion are hardcoded to an older undefined-`options` defect. The current [`_run_playwright_analysis`](../../backend/app/services/page_scanner.py) takes WCAG settings as parameters and attempts axe analysis. Therefore the script's prose and JSON conclusion can be stale regardless of its observed call counts; do not treat that text as a current test result. The more focused [fallback unit tests](../../backend/tests/test_scan_perf_unit.py) should also be read in context, including their mocks.

## Known testing gaps and safe interpretation

* Redirect tests use fakes and assert rejection after a final URL is reported; they do not demonstrate that a private destination was never contacted. Browser subrequests and DNS rebinding need separate security-focused verification.
* Worker reconstruction's valid `request_delay_ms=0` becomes 250 in the current code. An existing smoke test supplies zero but does not assert the resulting delay. A focused regression test is needed before a fix.
* The axe merge discards mapped axe issues even if no equivalent custom issue exists; add a meaningful test for an axe-only mapped finding before changing that policy.
* SQLite tests do not prove safe PostgreSQL worker claiming, stale-job recovery, attempt ownership or cancellation races. Reset-token validation and consumption also need transaction/concurrency tests. A non-production PostgreSQL setup is needed to assess those cases.
* Tests of preferences, mocked providers and API responses do not establish real email delivery, a successful live AI request, working Google OAuth or live MCP account linking.

## Inspection and verification limits

This guide reviews all backend test files at the level of file purpose and selected fixtures/assertions, not every assertion or parametrized case. It reviews the benchmark entry points, scenario setup, principal measurement helpers and output paths. Detailed instrumentation wrappers, `_measure_browser_lifecycle_micro`, all statistical-formatting helpers, every synthetic seed row and every report-formatting branch were not reviewed individually. No benchmark, application test, database, browser, external service or network target was run or contacted while preparing this page.
