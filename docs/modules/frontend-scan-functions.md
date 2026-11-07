# Frontend scan functions and data mapping

This reference explains the functions in [saved-scans.ts](../../frontend/src/lib/saved-scans.ts) and [useDashboardScan.ts](../../frontend/src/hooks/useDashboardScan.ts). Read [Frontend pages and workflows](frontend-workflows.md) first for the user journey. These files connect UI events to backend requests and convert saved responses into screen data; they do not themselves implement backend persistence or scanning.

## Data shapes and trust boundary

`SavedScanListItem` contains the ID, URLs, status, mode, page and queue counts/lists, timestamps, summary, score, and error metadata. `SavedScanDetail` adds an `issues` array. A `SavedScanIssue` has rule, severity, element, message, recommendation, optional locator/source/page information, WCAG criteria, and screenshot data. The source file also defines report and repair-suggestion structures. These are TypeScript types: the normal saved-scan helpers cast JSON to those types and do not validate the response at runtime.

All normal saved-scan HTTP functions take a backend bearer token. A successful request returns parsed JSON; a network or JSON parsing failure rejects. Non-success responses use `getApiErrorMessage`, which attempts to return `detail` from JSON and otherwise returns `Request failed.` It does not independently verify the shape of `detail`. None of these helpers writes to the database directly; server-side effects occur through their HTTP requests.

## Saved scan request functions

The [history page](<../../frontend/src/app/(dashboard)/scan-history/page.tsx>), [issues page](<../../frontend/src/app/(dashboard)/issues/page.tsx>), [report page](<../../frontend/src/app/(dashboard)/reports/page.tsx>), dashboard hook, and [AI suggestions tab](../../frontend/src/components/reports/AiSuggestionsTab.tsx) are the principal callers.

| Function | Inputs and result | Steps, effects, and edge cases |
| --- | --- | --- |
| `fetchSavedScans` | Token and optional `{limit, offset, status, mode, q}`; resolves to a list response containing `items`, total, limit, and offset. | Builds `GET /scans` with supplied parameters, bearer header and `cache: no-store`. Zero limits/offsets are included because it checks for null, while empty string filters are omitted. Non-success and parsing failures reject. Callers choose pagination and filtering. |
| `fetchSavedScan` | Scan ID, token, optional `{includeIssues}`; resolves to detail. | Performs a no-store authenticated `GET /scans/{id}`. Explicit `false` adds `include_issues=false`; other values omit the parameter. The lightweight form is used by the polling hook, while pages and terminal polls normally request issues. |
| `fetchRepairSuggestionGroups` | Scan ID and token; resolves to grouped findings and any saved suggestions. | No-store authenticated `GET /scans/{id}/repair-suggestion-groups`; AI tab loads groups. Rejects on unsuccessful response or parsing failure. |
| `generateRepairSuggestionGroup` | Scan ID, group key, token, optional `{force}`; resolves to a suggestion. | Posts JSON `{force: false}` by default to `/scans/{id}/repair-suggestion-groups/{groupKey}/generate`. The AI tab sets `force` when regenerating a group with an existing suggestion. Generation may have backend side effects; the helper itself does not interpret them. |
| `fetchRepairSuggestionBundle` | Scan ID, token, optional format (currently `markdown`); resolves to a bundle containing content, filename and counts. | Performs authenticated no-store `GET /scans/{id}/repair-suggestion-bundle?format=...`; AI tab then downloads the returned text. This helper does not itself download a file. |
| `removeScanQueuePage`, `prioritizeScanQueuePage` | Scan ID, page URL, token; resolve to updated detail. | Both delegate to private `updateScanQueue`, which posts `{url: pageUrl}` to `/scans/{id}/queue/remove` or `/queue/prioritize`. The dashboard updates its active scan on success and shows an error on failure. |
| `cancelSavedScan` | Scan ID and token; resolves to updated detail. | Posts to `/scans/{id}/cancel`. HTTP 409 throws `ScanAlreadyFinishedError` with a specific message; other non-success statuses use the common error parser. The hook catches these and displays the message. |

## Dashboard hook: state and callbacks

`useDashboardScan()` takes no arguments. The [dashboard page](<../../frontend/src/app/(dashboard)/dashboard/page.tsx>) consumes its returned URL setter, result/error/progress state, active scan, queue action state, notifications, and the callbacks below. The hook obtains the token from auth context. The latest scan and cancellation request are also stored in refs so the asynchronous polling loop can access them without waiting for a rerender.

### `handleScan(mode, preferences)`

This asynchronous callback is triggered by the dashboard toolbar. It returns without starting when already scanning or the URL is blank; it sets a login error if no token is available. Otherwise it clears previous result, error, active scan, notices and cancellation refs, marks the operation active, and calls `beginProgress`.

It posts the URL, mode and selected crawl settings to `/scan/page`. The sent page limit is `min(default_page_limit, 5)`; the hook does not perform its own comprehensive URL validation. On a non-success status, it tries to parse JSON `detail` and throws a fallback message if `detail` is absent. Invalid error JSON itself reaches the outer catch as a parsing error. A queued/running response must include a scan ID; the hook passes that ID, token, an update callback and cancellation predicate to `pollScanUntilComplete`.

The update callback saves the latest detail and active scan, updates progress text, and replaces displayed results only when the detail contains issue rows. This preserves previously shown partial issues when lightweight polls return an empty list. On completion `handleScan` stores the result, marks progress complete and publishes notifications. For a `ScanCancelledError`, it marks cancellation and preserves available scan/partial state. Other errors set error and failed progress state, then derive terminal notices from the latest detail and fallback. The `finally` block stops the progress interval and clears scanning/cancelling flags.

### Polling and cancellation

`pollScanUntilComplete(scanId, onScanUpdate, token, shouldStop)` is a private async function called by `handleScan`. It returns a mapped `ScanResponse` on completion, or throws an error. It waits two seconds before each poll, for at most 180 attempts; actual elapsed time also includes network requests. It checks `shouldStop` before and after each wait. Each iteration loads detail with `includeIssues: false`; it loads full detail when the issue count differs from the last full fetch or status is complete/error. A cancelled lightweight response causes a full detail fetch and `ScanCancelledError` carrying that detail. Error status invokes the update callback and throws the server message or `Scan failed.` After the attempt limit it throws a message directing the user to Scan History; the timeout does not cancel the server scan.

`cancelScan()` requires a token, an active queued/running scan, and no cancellation already in flight. It calls `cancelSavedScan`, then sets the stop ref, stops estimated progress, stores a locally cancelled scan, and displays a cancellation notice. If the backend returns a running scan after accepting cancellation, the hook still displays it as cancelled immediately; the server may need to finish current work. A failure clears the stop ref and displays the error, allowing the existing poll loop to continue. The hook's `canCancel` is true only while scanning with an active queued/running scan, so cancellation is unavailable before that active detail is known.

`ScanCancelledError` carries optional full scan detail; it is an internal control-flow signal caught by `handleScan`, not the same class as the HTTP 409 `ScanAlreadyFinishedError`. A cancellation may retain displayed partial results; it does not guarantee every last backend finding has been fetched.

### Other hook functions

| Function or callback | What it does, effects and limits |
| --- | --- |
| `beginProgress(mode)` / `stopProgress()` | Start/clear the 600 ms interval for estimated progress and status messages. Increments are random and cap at 92%; they do not measure actual scan completion. Unmount cleanup clears this interval, but does not abort an in-flight fetch or polling wait. |
| `getLatestScan()` | Returns the latest detail ref or `null`; used for notification and cancellation fallback. It makes no request. |
| `publishTerminalNotifications(scan, fallback, preferences)` | Calls `evaluateScanNotifications` and replaces notice state, preferring available scan status/summary/score/page count and fallback values where the code specifies them. Notification rules live in [scan-notifications.ts](../../frontend/src/lib/scan-notifications.ts). |
| `dismissNotification(kind)` | Removes notices matching a kind from local state. No backend mutation. |
| `removeQueuedPage(pageUrl)` / `prioritizeQueuedPage(pageUrl)` | Require an active scan, token, and no other queue action in flight. Set the URL as busy, call the corresponding API helper, update active scan on success, set error on failure, and clear busy state in `finally`. |
| `isPendingScan(scan)` | Returns true only for `queued` or `running`. |
| `mapSavedScanToScanResponse(scan)` | Returns the dashboard response shape: ID, status, final-or-requested URL, completed-or-started timestamp, mode, counts, queue data, summary and copied issues/screenshots. It has no network or state effect. |
| `shortenUrl(pageUrl)` | Uses hostname and pathname, capped at 80 characters; invalid URLs fall back to the first 80 characters of the original. It is for progress text. |
| `wait(ms)` | Returns a promise resolved by a timer. It does not abort a pending request or timer. |

## Mapping saved findings into screens

### `mapSavedScanToIssueList(scan)`

This pure function returns one display row per saved issue, in the original order. It uses the issue page URL if present, otherwise the scan final URL or requested URL. Its displayed selector prefers `dom_path`, then `source_hint`, then the element. IDs combine scan ID and one-based array position; they are display identifiers and can change if issue ordering changes. The row includes source location, screenshot, WCAG, message, fix and a generated finder hint. [IssuesPage](<../../frontend/src/app/(dashboard)/issues/page.tsx>) filters and selects these rows.

Example: a high-severity `image-alt` issue with a page URL, DOM path and screenshot becomes a row whose severity remains `high`, category is `Images`, selector is that DOM path, and screenshot is retained. The finder hint specifically suggests searching for an image filename/source or nearby image; it is a hint, not proof of a source-file location.

### `mapSavedScanToReportData(scan)`

This pure function is called by the report page. It chooses the final URL or requested URL and uses a saved score if present; otherwise it invokes `calculateAccessibilityScore`. The fallback is `round(100 - (high × 12 + medium × 4 + low) / max(pages_scanned, 1))`, clamped to 0–100, except error/cancelled scans return `null` from the fallback. Because the caller prefers a non-null saved score first, a saved score can still be used even for an error/cancelled record.

The mapper translates high → critical, medium → serious, low → minor, with moderate set to zero. It groups issues by their page URL, falling back to the scan URL, merges issue-page URLs with scanned-page URLs, removes duplicates, and appends distinct skipped pages not already considered scanned. Each scanned page becomes `pass` or `issues` based on its mapped findings; skipped pages get no issue elements. It calculates category and WCAG-principle groups, formats date/duration, and returns empty `aiSuggestions`; the AI tab loads its own groups separately. Status text maps errors and cancellation specially, then uses issue count for action needed/pass. The WCAG label is hardcoded to `WCAG 2.1 AA`.

### Private mapping helpers

These helpers have no direct network or database effects and are called by the mappers unless stated otherwise:

- `uniqueUrls(urls)` drops empty and duplicate URLs while preserving first occurrence.
- `deriveIssueCategory(issue)` tests rule/element text in order for Images, Forms, Links, Contrast, Landmarks, then Structure. It is a heuristic, not a full WCAG classification.
- `getIssueWcagReference(criteria)` returns the first criterion containing a numbered pattern such as `1.1.1`, otherwise `Not specified`; `getIssueWcagLevel(criteria)` searches for AAA, AA, then ` A`, otherwise returns `Not specified`.
- `buildFinderHint(issue, pageUrl)` gives rule-specific link/image guidance, otherwise prefers DOM path, then source line/column, then a text/source/element search. It only assembles display text.
- `toReportSeverity` maps high/medium/low to critical/serious/minor. `formatReportDate` uses `en-GB` locale and the runtime's time zone; `formatDuration` returns `-` for null or minutes/seconds text otherwise.
- `buildWcagPrinciples(issues)` assigns each issue to the first matching principle number 1, 2, 3 or 4, in that priority; missing/unmatched criteria count as Robust. `buildCategories(issues)` groups the heuristic categories, counts mapped severities and sorts by total descending. Neither produces an authoritative compliance determination.
- `getSavedScanTotalIssues(scan)` returns the summary total. `getSavedScanDomain(scan)` returns the parsed URL hostname or a simple string fallback for an invalid URL. History and its metrics use them.

## Verification and remaining coverage

[Saved-scan tests](../../frontend/src/lib/saved-scans.test.ts) currently exercise page grouping/skipped pages and screenshot preservation. [Hook tests](../../frontend/src/hooks/useDashboardScan.test.tsx) exercise selected polling and cancellation paths; [AI tab tests](../../frontend/src/components/reports/AiSuggestionsTab.test.tsx) cover selected generation/export interactions. Before altering request contracts, score/issue mapping, polling, or cancellation, check all callers and add a targeted regression test for the actual changed edge case.

This document reviews the named files and major callers, not every page callback, backend response schema, scanner/worker transaction, concurrency race, accessibility state, or live service interaction. These two files' network error and mapping branches have not all been independently executed for this documentation. Do not treat a computed score or automated issue count as proof of WCAG compliance.
