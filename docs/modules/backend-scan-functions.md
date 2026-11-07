# Scanner and worker function reference

This reference follows the project-owned functions in [page_scanner.py](../../backend/app/services/page_scanner.py), [axe_scanner.py](../../backend/app/services/axe_scanner.py) and [scan_worker.py](../../backend/app/scan_worker.py). Read [Backend scanning](backend-scanning.md) first for the API and database workflow. Names beginning with `_` are internal implementation details, not a stable external API. The descriptions are based on source inspection; they are not a substitute for a live-browser or concurrency test.

## Data passed between functions

`ScanOptions` is an immutable collection of scan mode, crawl limits, timeout/delay, filters, WCAG and browser-analysis choices. `PageScanResult` combines a final URL, parsed page data and issues. `CrawlQueueState` is a progress snapshot; `CrawlQueueControl` holds optional `publish`, `refresh` and `should_cancel` callbacks. These types are defined in [page_scanner.py](../../backend/app/services/page_scanner.py). `ScanError` carries a message and HTTP-style status; `ScanCancelled` signals cooperative cancellation. Neither type itself persists a result.

## Entry and orchestration

### `scan_page(url, options=None, queue_control=None, *, browser_session=None)`

**What and callers:** The scanner entry point, called by the scan API's synchronous/background paths and by the worker. It returns a `ScanPageResponse` containing pages, summary and issues.

**How:** Validate the initial URL, select default single-page options if omitted, set a context-local timer and use the supplied browser session or create one. Dispatch to `_scan_single_page` or `_scan_multiple_pages` based on `options.mode`, close only a session it owns, reset the timer context, attach timings and return the result. Validation or downstream exceptions propagate; cleanup is in `finally`. Supplying a browser makes the caller responsible for closing it. URL checking has the redirect/subrequest limitation described in [the scan guide](backend-scanning.md#target-safety-limitation).

### `_scan_single_page` and `_scan_multiple_pages`

Both receive a URL, `ScanOptions`, optional queue callbacks and browser session, and return a `ScanPageResponse`. Single mode checks cancellation, calls `_scan_one_page` with browser analysis and screenshots enabled, summarizes that page, and returns its final URL and issues.

Multi mode publishes initial progress, checks cancellation and scans the root. It tracks scanned page results, normalized visited URLs, a queue of `(url, depth)` pairs and a per-origin robots cache. When depth allows, it discovers candidate links, applies user queue controls and publishes progress. It then loops until the queue is empty or the page limit is reached: check cancellation and time budget, refresh controls, pop a candidate, publish it as current, optionally delay and check robots, scan it, publish its result, and enqueue eligible descendants. It finally flattens issues across pages and computes a summary. `ScanError` on a later candidate causes that page to be skipped; an error on the root propagates. The time budget is checked between queued pages, not while a page is running, and the root is scanned before robots are checked. The `pages_skipped` count comes from the skipped URL set used for crawl memory, so it does not count every failed or robots-disallowed candidate.

### Queue and cancellation helpers

* `_publish_queue_state(control, current_page_url, queued_pages, scanned_pages, skipped_urls)` converts internal page/depth tuples and accumulated issues into a `CrawlQueueState` and calls `publish` if provided. It performs no database operation by itself; the callback supplied by the worker or background job does that.
* `_apply_queue_control(queued_pages, control)` calls `refresh` if present, removes normalized excluded URLs and sorts remaining candidates by the requested order. Entries absent from the requested order retain their relative order through Python's stable sort. Without a callback it returns the original queue.
* `_cancel_requested(control)` invokes the optional callback and returns a boolean; `_raise_if_cancelled` turns true into `ScanCancelled`. The scanner uses checkpoints, so this cannot necessarily interrupt a page navigation already in progress.
* `_validate_final_url(final_url)` wraps a `ValueError` from URL validation as `ScanError`. It is invoked after navigation/fetch has already reached the final URL; it is not a pre-request redirect guard.

## Fetch and browser analysis

### `_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots, browser_session=None)`

Called by both page paths. It returns `PageScanResult`. When browser analysis is requested it first calls `_scan_rendered_page`; a non-null result is returned after recording the page count. Otherwise it fetches raw HTML, validates the resulting URL, parses it, builds custom issues and optionally calls `_run_playwright_analysis` on static HTML. It assigns the final page URL and a default source to issues before returning. HTTP errors become `ScanError` with the upstream status, URL errors become 502 and timeouts 504; other exceptions are not all normalized here.

### `_scan_rendered_page` and `_run_playwright_analysis`

`_scan_rendered_page` creates a page from a supplied or owned `BrowserSession`, navigates, rejects an HTTP response status of 400 or greater, waits for rendering, obtains HTML and final URL, parses/custom-checks it and attempts axe analysis. It optionally adds screenshots, closes the page's browser context and returns `PageScanResult`. A `ScanError` propagates; other failures are logged and return `None` so `_scan_one_page` can try raw HTML. An axe-specific failure is logged and leaves custom issues available. An owned session is closed in `finally`.

`_run_playwright_analysis(url, html, custom_issues, ...)` is the fallback after raw fetch. It loads `_prepare_html_for_screenshot` output via Playwright `set_content`, waits briefly, runs axe and merges results; it optionally attaches screenshots. If import, browser setup, or analysis fails, it returns the custom issues marked with a source. It closes its context and any session it owns. The prepared HTML has script tags removed and a base URL inserted, but may still load images and styles. This is a fallback, not equivalent to executing the original page's scripts.

`_fetch_page_html(url, timeout_seconds)` makes an HTTP request with a scanner user agent, reads the response body, decodes using its declared charset or UTF-8 with replacement, and returns `(html, final_url)`. Its caller converts common network errors. The read is not explicitly size-bounded in this function, and normal redirect handling can request the destination before later validation.

### `BrowserSession`

`new_page()` obtains the lazy browser via `_ensure_browser`, then returns a fresh `(context, page)` or `None` if Playwright is unavailable. A context/page creation exception closes the session and is re-raised. `_ensure_browser` starts headless Chromium on first use; import or launch failure marks this session unavailable and returns `None`. `close()` attempts to close the browser and Playwright, suppresses cleanup exceptions and clears references. `is_connected()` checks the actual browser; `is_usable()` also treats a not-yet-launched session as usable, but returns false once marked unavailable. These methods are called by page-analysis helpers and the worker's browser manager.

`_new_browser_context(browser)` supplies a fixed viewport, locale, light color scheme and user agent. `_wait_for_rendered_content(page, timeout)` makes bounded `load` and `networkidle` waits, ignoring failures, then applies the configured settle delay. `_wait_for_static_content(page)` similarly tolerates a load timeout and waits briefly. These waits improve capture consistency but cannot guarantee that all delayed content has loaded.

## Parsing and custom issue generation

`_parse_page_html(html)` feeds the standard-library `AccessibilityHTMLParser` and returns `ParsedPageData`. The parser's `handle_starttag` records source position and descriptors, captures the document language, images, links, headings and IDs, and tracks a simple element stack. `handle_data` accumulates title, current link and heading text; `handle_endtag` finalizes links/headings and pops the stack; `finalize` joins title text. This is a lightweight parser, not a full browser DOM, so malformed or unusual nesting can affect the generated path and text associations.

`_build_issues(page_data)` returns a list of `ScanIssue` objects without making network or database requests. It reports missing/empty title and HTML language, images lacking an `alt` attribute, a small fixed set of vague nonempty link labels, duplicated IDs and heading levels that jump by more than one. It attaches available line, column, source hint, DOM path and preview. An empty `alt` is allowed by this particular custom check; these checks are not a complete accessibility audit.

The parser calls `_build_tag_descriptor(tag, attrs, occurrence)` to prefer an ID, then up to two classes, otherwise an `nth-of-type` descriptor. `_build_dom_path(stack, descriptor)` omits noise tags, starts at body if present and retains at most eight components. `_build_source_hint` selects and shortens useful attributes; `_descriptor_tag`, `_shorten_value` and `_build_image_preview` support those outputs. The descriptors are hints generated from parsed markup, not guaranteed unique or valid selectors for every page.

`_build_summary(issues)` counts all issues and those with high/medium/low severity. `_assign_issue_page_url(issues, page_url)` mutates each issue with the final URL and fills a missing source as `custom`; `_mark_custom_issues` similarly fills the source. `_timeout_seconds` converts milliseconds to seconds with a one-second floor.

## Crawl URL selection

`_build_next_page_queue(page_data, base_url, next_depth, root_host, visited_urls, skipped_urls, options)` examines parsed links and returns queued `(URL, depth)` pairs plus the number newly added to the skipped set. `_normalize_discovered_url` resolves relative links, removes fragments, rejects non-HTTP links, skipped extensions and URLs failing target validation, then normalizes them. The queue builder rejects visited URLs, ignored patterns and, if configured, a different host. Previously scanned same-host URLs are recorded in the skipped set instead of queued.

`_normalize_url` trims the fragment and trailing slash, and lowercases scheme and network location. `_matches_ignored_pattern` uses glob matching when a pattern contains wildcard syntax; otherwise it tests for a substring in the complete URL or path. `_is_same_host` compares lowercased hostnames, and `_has_skipped_crawl_extension` checks a fixed list of file suffixes against the path.

`_is_allowed_by_robots(url, robots_cache)` fetches and parses `/robots.txt` once per origin and asks whether `*` may fetch the URL. It uses a three-second fetch timeout, caches failure as `None` and returns true on failure. It does not itself enforce a private-network restriction on every redirect. Changing these helpers affects what gets scanned and should be tested with redirects, relative links and crawl-memory cases.

## Screenshots and storage

`_attach_issue_screenshots(page, issues)` mutates issues by assigning screenshot URLs. It selects an element selector from the issue where possible, otherwise uses a viewport key; captures are deduplicated per key and limited by `max_screenshots_per_page`. `_capture_screenshot_bytes` attempts a padded element clip and falls back to a bounded viewport JPEG; failure returns `None`. `_build_context_clip` calculates the padding/viewport bounds, and `_build_issue_selector` derives a selector from the DOM path or an ID issue.

`_store_screenshots_concurrently(captures)` returns a mapping from capture key to stored URL or `None`, using up to four threads for multiple captures. `_store_screenshot` uses a Cloudinary upload when configured, otherwise `_to_data_url`; if upload fails, inline fallback is enabled only by the corresponding configuration. `_upload_screenshot_to_cloudinary` catches upload failures, logs and returns `None`; successful URLs may be persisted with the issue. These side effects can transmit page screenshots to an external service. The helper `_prepare_html_for_screenshot` removes matching script tags and inserts a base element and styles; it should not be treated as a general HTML security sanitizer.

## Axe loading, mapping and merge

All functions in this section are in [axe_scanner.py](../../backend/app/services/axe_scanner.py).

* `_local_axe_script_paths()` returns an optional configured path followed by the vendored asset. `_read_local_axe_script()` chooses the first readable nonblank file. `_download_axe_script()` logs and fetches the CDN copy when no local script is available. `_get_axe_script()` caches the selected script in process memory. `warm_axe_cache()` catches load errors, logs and returns false; the worker can continue.
* `_parse_wcag_standard(value)` normalizes recognized versions/levels or returns `None`. `build_axe_tag_values(standard, include_best_practices)` creates the axe tag list, using the default for an unknown value. `run_axe_core(page, ...)` injects the script, runs axe for those tags and returns `_map_axe_results` output; browser/evaluation errors are handled by its caller.
* `_map_axe_results(raw_results)` turns each violation node into an issue, maps axe impact to project severity, truncates long HTML snippets and extracts a selector and criteria. `_build_recommendation` combines messages from impacted checks with the help URL, or provides a generic fallback. `_extract_wcag_criteria` and `_format_wcag_tag` turn recognized tags into display labels and remove duplicates.
* `merge_issues(custom_issues, axe_issues)` mutates custom issue source/criteria for mapped overlapping rule IDs, keeps custom issues, and appends axe issues outside the overlap mapping. **Current edge case:** it drops mapped axe issues even if no matching custom issue exists. For example, axe can report an invalid nonempty HTML language while the custom rule only reports a missing/empty language. A test and a deliberate matching policy are needed before changing this behavior.

## Worker functions

All names below are in [scan_worker.py](../../backend/app/scan_worker.py). The durable row operations they call are in [scan_repository.py](../../backend/app/repositories/scan_repository.py).

### `run_worker_loop(*, run_once=False)`

Loads poll interval, stale threshold and worker ID, creates a reusable browser manager, tries to warm the axe cache and repeatedly opens a database session. Each iteration recovers stale jobs, claims the oldest available queued job using the repository, and runs it. If none is available, it sleeps before the next iteration; `run_once=True` exits after one claim attempt or job. The session closes each iteration and the browser manager closes on loop exit. This function has no outer retry around a database exception, so process supervision matters.

### `_run_claimed_scan(db, scan_run, *, browser_manager=None)`

Acquires a reusable session when a manager is provided, checks cancellation, reconstructs saved options, calls `scan_page` with database-backed queue callbacks and logs timing. It checks cancellation again before completing the row. `ScanCancelled` marks the row cancelled; `ValueError` and `ScanError` pass a message to `_fail_scan`; other exceptions roll back, log a traceback, mark a browser error and attempt failure handling. Its `finally` informs the manager the job finished. Browser acquisition occurs before the `try`, so an exception from acquisition is outside that handler.

`_fail_scan(db, id, message)` calls `retry_or_fail_running_scan` with the current time, then logs whether the row was queued again or failed. `_build_queue_control(db, id)` returns callbacks: `publish` updates progress and commits through the repository, `refresh` reads current queue/exclusions, and `should_cancel` reads the cancellation flag. The API's background mode has a similar adapter in [main.py](../../backend/app/main.py). These callbacks identify a scan by ID rather than proving the caller owns the current attempt; stale-worker fencing remains unresolved.

`_scan_options_from_payload(payload)` converts the persisted JSON-compatible dictionary to `ScanOptions`, filters string lists with `_string_list`, defaults absent values and enables browser analysis for multi-page worker jobs. It uses truthiness for several numeric defaults: a valid `request_delay_ms` of `0` becomes `250` on reconstruction, even though the API schema and resolver accept zero. This differs from the direct/background path and needs a regression test before a behavior fix.

### Browser reuse and configuration helpers

`WorkerBrowserManager.acquire()` returns `None` when reuse is disabled, otherwise resets an exhausted/unhealthy session or lazily creates one. `job_finished(browser_error=...)` increments its count and resets after an unexpected browser error or the configured job limit. `reset()` clears the manager state and attempts to close the old session, logging close failure; `close()` delegates to it. `_session_is_healthy` checks `is_usable` or `is_connected`, treating an exception as unhealthy and a session without either method as healthy.

`browser_reuse_enabled()` defaults to enabled unless an explicit false-like value is configured; `get_browser_max_jobs()` defaults to 250 and clamps valid integers to at least one. `_get_poll_interval_seconds()` defaults to 0.5 seconds with a 0.25 minimum; `_get_stale_after_seconds()` defaults to 300 seconds with a 30-second minimum. Invalid numeric values fall back to defaults. `_get_worker_id()` uses the configured ID or hostname and process ID. `_log_scan_timings` logs a JSON line containing scan ID, requested URL, mode, pages, elapsed milliseconds and phase data; URL logging should be considered when URLs contain sensitive query parameters.

## Timing and setting helpers

In [page_scanner.py](../../backend/app/services/page_scanner.py), `_get_env_int` and `_get_env_float` parse configuration with a minimum and fallback. `render_idle_timeout_ms`, `render_settle_ms`, `max_screenshots_per_page` and `max_scan_seconds` specialize those settings. A zero time budget disables the multi-page budget check.

`PhaseTimer.add` accumulates nonnegative milliseconds and counts calls, `count` adds a count, `measure` measures a block even when it raises, and `snapshot` produces rounded timings plus count entries. `_measure_phase` uses the current context's timer if one exists; `_count_scanned_page` increments its page count. `_attach_timings` attaches a snapshot if the response model exposes the field, returning false if unavailable or assignment fails. Its current implementation records durations in milliseconds.

## Verification and limits

Useful starting points are [scanner tests](../../backend/tests/test_page_scanner_unit.py), [worker tests](../../backend/tests/test_scan_worker_unit.py), [scan performance tests](../../backend/tests/test_scan_perf_unit.py), [option tests](../../backend/tests/test_scan_options_resolver_unit.py), and [cancellation tests](../../backend/tests/test_scan_cancel_unit.py). Review both direct and worker paths when changing options, and use a real PostgreSQL concurrency test for ownership and recovery claims.

The major functions above were read, including grouped simple helpers; this is not exhaustive verification of all call sites, every parser edge case, browser behavior, screenshot storage provider, migration, repository function, configuration parser edge case, or test assertion. Functions outside the three reference files were not reviewed in function-by-function depth for this page. They include `validate_public_http_url`, `_assert_public_host` and `_resolve_host_addresses` in the [target-validation utility](../../backend/app/utils/url_utils.py); `resolve_scan_settings` and its `_pick_*` helpers in the [options resolver](../../backend/app/services/scan_options_resolver.py); and `list_saved_scans`, `get_saved_scan`, `remove_queued_scan_page`, `prioritize_queued_scan_page`, `_fallback_scanned_page_urls` and `_issue_page_urls_by_scan_run` in the [scan repository](../../backend/app/repositories/scan_repository.py). No live scan, browser, network target, external provider, or multi-worker deployment was exercised while writing this reference.
