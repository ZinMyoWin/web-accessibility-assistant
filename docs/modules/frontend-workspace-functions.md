# Workspace page and component functions

This guide describes the principal functions and callbacks behind the dashboard, issues, scan history, and reports screens. A React component normally returns UI rather than a value to an ordinary caller; its callbacks change local state, navigate, or call shared API helpers. For the scan hook and saved-scan API/mapping functions, see [Frontend scan functions](frontend-scan-functions.md). For a page-level tour, see [Frontend pages and workflows](frontend-workflows.md).

## Dashboard

### `DashboardPage()`

The [dashboard page](<../../frontend/src/app/(dashboard)/dashboard/page.tsx>) takes no props. It calls `useDashboardScan()` and `usePreferences()`, stores the selected severity and scan mode, and passes data/actions to its child panels. An effect updates scan mode when `preferences.default_scan_mode` changes. It filters `result.issues` by the selected severity and uses `getTopRuleCounts(result)` for the overview. Counts fall back to `EMPTY_SUMMARY` before a result exists. The page displays hook errors and forwards current preferences and mode to `handleScan`; it does not call the scan endpoint itself.

### Dashboard controls and helpers

| Component or function | Inputs and behavior | Side effects and failure cases |
| --- | --- | --- |
| [ScanToolbar](../../frontend/src/components/home/ScanToolbar.tsx) | Receives URL, mode, scanning/cancel flags and callbacks. URL changes and mode selection call the parent setters; Enter or Scan calls `onScan`. | A local confirmation state gates cancellation; Yes invokes `onCancel`, Keep scanning dismisses it. The button is disabled for blank URL or active scan, and hook-level checks remain necessary because Enter also invokes the callback. |
| [QueuePanel](../../frontend/src/components/home/QueuePanel.tsx) | Receives active scan, busy URL and remove/prioritize callbacks. It displays queue and excluded URLs for relevant scan state. | Buttons call parent actions; the hook performs network requests and reports errors. |
| [IssueRow](../../frontend/src/components/home/IssueRow.tsx) | Receives one issue. Clicking toggles an accessible disclosure showing details, screenshot and recommendation. | A failed image sets local `imageFailed` and displays a fallback; links open separately. `getBestLocator` supplies a suggested way to find the element. |
| [getTopRuleCounts](../../frontend/src/components/home/utils.ts) | Takes a scan response or null; returns up to six `[ruleId, count]` pairs sorted by frequency. | Returns an empty array for null. Counts use only the issues present in the response, which may be partial during a running scan. No network request. |
| `getBestLocator` / `formatRuleId` | `getBestLocator(issue)` returns a rule-specific or DOM-path hint, or null; `formatRuleId(id)` converts hyphens to spaces and capitalizes words. | These display helpers do not prove a source location or change data. [Source](../../frontend/src/components/home/utils.ts). |
| [ProgressPanel](../../frontend/src/components/home/ProgressPanel.tsx), [MetricsGrid](../../frontend/src/components/home/MetricsGrid.tsx), [OverviewPanels](../../frontend/src/components/home/OverviewPanels.tsx), [IssuesSection](../../frontend/src/components/home/IssuesSection.tsx), [ScanNotifications](../../frontend/src/components/home/ScanNotifications.tsx) | Render the passed progress, counts, overview, issue filters, and notifications; filter/dismiss controls call supplied callbacks. | Their input is view state; they do not make scan API calls themselves. |

The scan hook controls request, polling, cancellation, and notification failures; see its [function reference](frontend-scan-functions.md#dashboard-hook-state-and-callbacks). Its progress percentage before completion is an estimate.

## Issues page

`IssuesPage()` wraps `IssuesPageContent()` in Suspense because the content reads the query string. [Source](<../../frontend/src/app/(dashboard)/issues/page.tsx>).

1. The first effect's `loadSavedScans()` calls `fetchSavedScans(token, {limit: 50, offset: 0})`. It selects the `scanId` query value only if it appears in those 50 summaries, otherwise selects the first item or null. It sets error/empty states on failure. Its cleanup marks the request result stale so it will not update state; it does not abort the HTTP request.
2. A second effect's `loadSavedScan()` requests full detail for the active ID, or clears detail when ID/token is absent. It uses the same stale-result flag and sets loading/error state. Choosing a different scan sets the active ID and pushes the new `?scanId=` URL. The report button navigates to `/reports?scanId=...`.
3. Memoized calculations map detail through `mapSavedScanToIssueList`, derive categories and page options, then filter by page, severity, category and case-insensitive search of title/category/selector/WCAG. Sort is severity order, page-frequency length, or category. Current mapper rows each contain one page, so their `pages.length` is normally one; frequency sort does not aggregate matching rows across pages.
4. Effects reset an invalid page filter and keep the selected issue within the visible set. Counts summarize the **filtered** issues. Changing scan resets the page filter, while other filters remain. The detail panel receives the selected row or null.

Private `formatScanTimestamp` and `formatScanOption` format a summary for the dropdown; `uniqueUrls` removes empty and duplicate page URLs; `formatPageOption` uses host for the root URL or path/query for other valid URLs and falls back to the original string for invalid URLs. These functions have no backend effects.

[IssueFilterBar](../../frontend/src/components/issues/IssueFilterBar.tsx) sends filter changes to the page; [IssueCountBar](../../frontend/src/components/issues/IssueCountBar.tsx) displays the derived totals. [IssueList](../../frontend/src/components/issues/IssueList.tsx) calls `onSelect(issue.id)` when a row is clicked; on viewports up to 1023px it also opens a detail dialog and restores focus to the clicked button on close. [IssueDetailPanel](../../frontend/src/components/issues/IssueDetailPanel.tsx) renders the selected row's impact, optional screenshot, WCAG fields, fix and locator; its affected-page link opens a new tab.

**Current limit:** a valid history link to a scan outside the first 50 can silently show the first loaded scan. The selection code and its callers should be tested with an older ID before changing it.

## Scan history and comparison

### `ScanHistoryPage()` and its callbacks

[ScanHistoryPage](<../../frontend/src/app/(dashboard)/scan-history/page.tsx>) maintains search, server filters, sort, page, selection and compare state. A deferred search value reduces immediate updates; an effect resets the page to one when search/status/mode changes. `loadScans()` requests ten summaries using current offset, status, mode and trimmed search. It ignores late results using an effect cleanup flag, sets list and total on success, and clears list/selection plus sets an error on failure.

`filteredScans` copies and sorts the returned page by start time or total issues. The backend request does not include sort, so the sort applies to the current page only. `totalPages` is at least one. `handleCompareToggle(id)` adds/removes an ID with a maximum of two; `cancelCompare()` exits both compare states and clears selections; previous/next callbacks clamp the page number. `handleViewReport(id)` navigates to the report. `handleSelect(id)` sets selection and navigates to issues, although the current [ScanHistoryRow](../../frontend/src/components/scan-history/ScanHistoryRow.tsx) uses a direct issues link rather than calling its passed `onSelect` prop. Row checkboxes call `onCompareToggle`, and the report button calls `onViewReport`.

[CompareBanner](../../frontend/src/components/scan-history/CompareBanner.tsx) enables Compare only when exactly two IDs are selected. [ScanHistoryMetrics](../../frontend/src/components/scan-history/ScanHistoryMetrics.tsx) computes count, distinct domains, rounded average issues for completed scans, pages scanned and a last-seven-days count from the **current supplied page**, not the complete history. Its date test checks whether a start time is at least seven days ago; it does not impose an upper bound of now.

### `ScanHistoryCompareView({compareIds, onBack})`

This [component](../../frontend/src/components/scan-history/ScanHistoryCompareView.tsx) checks for exactly two IDs and a token, fetches both full details concurrently with `Promise.all`, sorts them by `started_at`, and displays loading or error with a back action. It calculates score, issue-total and high-severity differences, then classifies findings as new, resolved or persistent by comparing maps.

Private `getIssueKey(issue)` combines rule ID, the first available trimmed DOM path/source hint/element, and trimmed text preview. The map overwrites duplicate keys, and the key omits page URL: identical findings on different pages can collapse or be treated as persistent when their page changed. Comparison fetches lack the stale-result guard used in the page's list load. `DiffCard` renders unavailable for a missing score and colors non-zero differences according to the metric; `IssueCard` is a compact view of the issue. The component makes no mutation request.

## Reports and export

### `ReportsPageContent()`

The [reports page](<../../frontend/src/app/(dashboard)/reports/page.tsx>) reads optional `scanId` and auth token. Its `loadReport()` uses the requested ID, or fetches one latest summary if absent, then fetches the full scan and applies `mapSavedScanToReportData`. No scan produces a visible empty message; errors clear report and active ID and show an alert. An effect cleanup flag prevents a stale load from updating state, though the network request continues. `showToast(message)` sets a 2.8-second message and replaces any previous timer. The component supplies report metadata and breakdowns to summary components, page rows to `PagesTab`, and active ID to the AI tab.

### `PagesTab({pagesData})`

[PagesTab](../../frontend/src/components/reports/PagesTab.tsx) stores a selected URL initialized from the first row. A memoized lookup uses the matching row or falls back to the first; clicking a page updates the URL. It counts rows marked skipped versus other rows and displays an empty state for no rows. `SelectedPageIssues` shows the selected page's skipped/no-issues/detail state; `PageStatusBadge` and `SevCount` format that data. No API call occurs on page selection.

### `AiSuggestionsTab({scanId, totalCriticalSerious})`

The [AI tab](../../frontend/src/components/reports/AiSuggestionsTab.tsx) obtains the token and keeps groups, loading/error, generating and export states. An effect loads groups when scan ID/token is available and suppresses a stale load result on cleanup; absent inputs clear groups. `handleGenerate(groupKey, force = false)` returns early without scan/token or while another generation is in flight. Otherwise it calls `generateRepairSuggestionGroup`, replaces the matching group suggestion, reports errors and clears the busy key. The card passes `force: true` for regeneration when a suggestion already exists. Generation is a backend operation, unlike simply viewing groups.

`handleExportBundle()` requires scan ID, token, nonempty groups and no export already running. It fetches a Markdown bundle, calls `downloadTextFile` using the returned filename/content and fallbacks, then shows generated/missing counts; failures appear in export error state. Generate/export operations do not have the effect's stale-result guard if the scan changes while they are in flight. [AiSuggestionsTab tests](../../frontend/src/components/reports/AiSuggestionsTab.test.tsx) cover selected loading, generation and export behaviors.

### Export functions

[ExportBar](../../frontend/src/components/reports/ExportBar.tsx) invokes functions from [export-utils.ts](../../frontend/src/components/reports/export-utils.ts):

- `escapeCSV(value)` quotes values containing comma, quote or newline and doubles embedded quotes. `buildCSV(report)` assembles report metadata, breakdowns, page findings, categories and the report's AI suggestion array. This is CSV syntax escaping; it does not neutralize spreadsheet formula prefixes in untrusted cell values.
- `downloadCSV(report)` builds a CSV Blob, creates and clicks a temporary download link, then removes it and revokes the object URL. ExportBar shows a success toast after calling it; it does not await confirmation that the browser saved a file.
- `printReport()` calls `window.print()`. `exportPDF(report)` temporarily changes the document title, calls the same print dialog, and restores the title after one second. Saving a PDF depends on the user's browser print destination.

[ReportHeader](../../frontend/src/components/reports/ReportHeader.tsx), [SummaryGrid](../../frontend/src/components/reports/SummaryGrid.tsx) and [ScoreRing](../../frontend/src/components/reports/ScoreRing.tsx) render passed report values. [CategoriesTab](../../frontend/src/components/reports/CategoriesTab.tsx) renders expandable category summaries, but the inspected report page currently mounts page and AI tabs only.

## Coverage and maintenance

This reference covers the page logic and major children inspected above. It is not a complete explanation of every markup branch, style, icon, keyboard behavior, helper, or callback in every child component. Backend validation, browser-specific print/download behavior, all request races, live data, and end-to-end accessibility have not been independently exercised here. Before changing behavior, follow the owning page into [saved-scan functions](frontend-scan-functions.md), review existing unit/browser tests, and add a focused regression test for the changed behavior.
