# Frontend tests: what they cover and how they run

The frontend has two main test layers: Vitest component/unit tests under `src`, and Playwright browser tests under `e2e`. They answer different questions. A passing mocked browser scenario shows how the frontend responds to the supplied fixture; it does not prove the real backend, database, scanner, OAuth provider, or AI provider works. This guide describes the inspected test code, not the result of a test run.

## Commands and an important setup detail

Run commands from the [frontend directory](../../frontend):

```powershell
npm test                                  # all configured Vitest tests, once
npm run test:watch                        # Vitest watch mode
npm test -- src/lib/saved-scans.test.ts   # one Vitest file
npx.cmd tsc --noEmit --incremental false  # TypeScript check
npm run build                             # production frontend build
npm run test:e2e                          # Playwright browser suite
npm run test:e2e:report                   # open the generated HTML report
```

**Before running Playwright:** [playwright.config.ts](../../frontend/playwright.config.ts) imports [e2e/helpers/env.ts](../../frontend/e2e/helpers/env.ts). That helper calls `readLocalEnv()` at module load and attempts to read `frontend/.env.local`, even when the necessary values are already in the process environment. This matters when a developer must not read local environment files: do not run the current Playwright configuration under that constraint without first resolving the helper's behavior or verifying that the file is absent. No environment file was read for this guide.

The Playwright helper can use process settings for the test server URL/port and session signing configuration. The test runner must use the same NextAuth secret as the frontend server when it mints a test session. Do not put actual secret values in test documentation, fixtures, or reports. Browser binaries and dependencies must also be available; installation and build behavior depend on the local environment.

## Vitest: scope and fixtures

[vitest.config.mts](../../frontend/vitest.config.mts) includes `src/**/*.{test,spec}.{ts,tsx}`, sets `jsdom` as the default environment, enables globals, and resolves `@` to `src`. [setup.ts](../../frontend/src/test/setup.ts) adds Testing Library DOM matchers. Some files explicitly select the Node environment, including MCP integration tests. `npm test` runs Vitest once; Playwright specs are excluded from that configuration.

| Test area | Example files | What the tests exercise |
| --- | --- | --- |
| Scan lifecycle | [useDashboardScan.test.tsx](../../frontend/src/hooks/useDashboardScan.test.tsx) | Uses fake timers, a stubbed initial fetch, mocked auth and saved-scan helpers to check lightweight/full polling, changing issue counts, failed scans, cancellation and a finished-scan cancellation error. These are controlled responses rather than a real worker. |
| Scan mapping and notifications | [saved-scans.test.ts](../../frontend/src/lib/saved-scans.test.ts), [scan-notifications.test.ts](../../frontend/src/lib/scan-notifications.test.ts) | Check examples of page grouping/skipped pages, screenshot preservation and notification decisions for terminal/ongoing statuses. |
| Workspace controls | [ScanToolbar](../../frontend/src/components/home/ScanToolbar.test.tsx), [QueuePanel](../../frontend/src/components/home/QueuePanel.test.tsx), [ProgressPanel](../../frontend/src/components/home/ProgressPanel.test.tsx), [IssueRow](../../frontend/src/components/home/IssueRow.test.tsx), [ScanNotifications](../../frontend/src/components/home/ScanNotifications.test.tsx) | Exercise controls, confirmation, callback invocation, progress semantics, issue disclosure and notification rendering. Callback mocks do not prove backend mutations. |
| Accessibility and navigation components | [AuthAccessibility](../../frontend/src/components/auth/AuthAccessibility.test.tsx), [DashboardShell](../../frontend/src/components/dashboard/DashboardShell.test.tsx), [IssueList](../../frontend/src/components/issues/IssueList.test.tsx), [ScanHistoryRow](../../frontend/src/components/scan-history/ScanHistoryRow.test.tsx) | Cover selected accessible names, password visibility, mobile navigation/issue focus handling and history actions. Router/auth or browser APIs are mocked where needed. |
| Reports, preferences, downloads | [AiSuggestionsTab](../../frontend/src/components/reports/AiSuggestionsTab.test.tsx), [PagesTab](../../frontend/src/components/reports/PagesTab.test.tsx), [AiProviderSection](../../frontend/src/components/preferences/AiProviderSection.test.tsx), [NotificationsSection](../../frontend/src/components/preferences/NotificationsSection.test.tsx), [download.test.ts](../../frontend/src/lib/download.test.ts) | Check selected group generation/export UI, page views, draft updates, threshold clamping, and text-download cleanup. AI tab API and download functions are mocked. |
| MCP | [auth](../../frontend/src/lib/mcp/auth.test.ts), [config](../../frontend/src/lib/mcp/config.test.ts), [http](../../frontend/src/lib/mcp/http.test.ts), [link](../../frontend/src/lib/mcp/link.test.ts), [proxy](../../frontend/src/lib/mcp/proxy.test.ts) | Cover selected token, scope, metadata, origin, linking, bounded response and SDK request behaviors. The HTTP tests use generated signing keys and a local HTTP key-set server while stubbing backend fetches; link tests mock session, auth and backend dependencies. They do not prove a real deployed provider or backend link. |

[makeSavedScanDetail](../../frontend/src/test/saved-scan-fixtures.ts) supplies a saved-scan object with findings across two scanned pages and a skipped page; partial overrides replace top-level fields. [makePreferences](../../frontend/src/test/make-preferences.ts) supplies a complete preferences object with overrides. Treat both as examples, not proof that current backend values or schemas match every fixture.

## Playwright: browser flows and boundaries

[Playwright configuration](../../frontend/playwright.config.ts) targets Chromium, collects a trace on failure and screenshots only on failure, and starts a production build/server using `npm run build` and `npm run start`. Outside CI it can reuse an existing server at the configured URL; make sure that server is the intended application. The config runs with one worker and one retry in CI, uses a longer build/server startup timeout, and writes the HTML report and results to configured output directories. Those are generated artifacts, not source documentation.

[session.ts](../../frontend/e2e/helpers/session.ts) creates a NextAuth session cookie with a test user and test bearer token. This allows the real frontend middleware/session UI path to run without a real credentials exchange. [fixtures.ts](../../frontend/e2e/helpers/fixtures.ts) provides deterministic preferences, scan responses, issues, and queued/running/cancelled examples. [backend.ts](../../frontend/e2e/helpers/backend.ts) registers `page.route` interceptors and captures selected requests:

- `mockPreferences` responds to the preferences GET; unmatched methods fall through.
- `mockCompletedScan` responds to a scan POST and records its authorization header and request body.
- `mockQueuedScanWithCancel` supplies queued scan, lightweight/full running poll responses and a cancelled response; it records poll and cancel requests. It models a worker's responses without starting a worker.

| Browser spec | What it checks | Main boundary |
| --- | --- | --- |
| [landing.spec.ts](../../frontend/e2e/landing.spec.ts) | Public landing content/registration entry and registration form rendering. | No live account creation. |
| [auth-login.spec.ts](../../frontend/e2e/auth-login.spec.ts), [auth-guard.spec.ts](../../frontend/e2e/auth-guard.spec.ts) | Login labels/links and client validation; anonymous dashboard redirect. | Does not prove a successful real credentials or Google login. |
| [dashboard.spec.ts](../../frontend/e2e/dashboard.spec.ts) | Authenticated shell, scan inputs, mocked completed response, rendered findings and captured request token/body. | Minted session and intercepted backend response. |
| [scan-cancel.spec.ts](../../frontend/e2e/scan-cancel.spec.ts) | Queued/running UI, confirmation, cancellation response and dismissing confirmation. | Minted session and intercepted queue/poll/cancel responses; not real worker cancellation. |
| [redesign.spec.ts](../../frontend/e2e/redesign.spec.ts) | Reflow across five viewport widths, selected automated axe checks, keyboard dismissal/focus return, report print layout and report empty/error states. | Workspace responses are mocked and the local bundled axe script is injected. These automated checks do not establish complete accessibility or WCAG conformance. |

When changing a request or response, update the relevant fixture and test assertions together, then separately verify the backend contract. A fixture that mirrors the same mistaken assumption as the UI can make a test pass while the integrated application fails.

## Gaps and maintenance

The inspected tests do not establish live end-to-end signup/login, Google exchange, session revocation, reset-email delivery, real database isolation, scanner/worker behavior, deployed MCP linking, or AI-provider calls. The specific older-history issue link, whole-history sorting, cross-page comparison collisions, stale preferences responses, editing during save and CSV spreadsheet formula handling warrant targeted tests if those behaviors are changed. This is a list of observed gaps, not a statement that no other tests exist elsewhere.

This guide reviewed the test configurations, E2E specs/helpers, common frontend fixtures, and selected Vitest test bodies and inventories. It did not inspect every assertion in every Vitest file, backend tests, CI execution results, all external dependencies, or live integrations. No tests were run for this guide.
