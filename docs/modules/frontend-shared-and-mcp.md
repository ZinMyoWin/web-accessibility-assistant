# Frontend shared code and MCP

This guide explains the shared frontend building blocks and the server-side Model Context Protocol (MCP) integration. For user-facing pages, start with [Frontend pages and workflows](frontend-workflows.md). These notes describe inspected source, including currently uncommitted MCP work; they do not establish that it is deployed or connected to an identity provider.

## Shared application structure

**What:** Next.js combines route components with reusable React components, contexts, hooks, and helpers. **Why:** Each page can focus on its interaction while shared code handles consistent session state, preferences, API headers, and data mapping.

| Location | Responsibility | How to use or change safely |
| --- | --- | --- |
| [app/layout.tsx](../../frontend/src/app/layout.tsx) | Global font, CSS, authentication provider, then preferences provider. | Preferences consumes authentication, so provider order matters. |
| [components/ui](../../frontend/src/components/ui) | Shared button, dialog, select, tabs, input and other UI primitives. | Preserve keyboard behavior, labels and focus handling; check consumers and UI tests. |
| [components/auth](../../frontend/src/components/auth) | Authentication shell, card, fields, password feedback, and Google button. | Auth pages and the legacy signup route may share these components; check both. |
| [components/dashboard](../../frontend/src/components/dashboard) | Workspace navigation, responsive sidebar and sign-out. | Its shell is a client-side companion to, not a replacement for, backend access checks. |
| [components/home](../../frontend/src/components/home) and [useDashboardScan](../../frontend/src/hooks/useDashboardScan.ts) | Dashboard presentation and scan lifecycle. | The hook handles request state while the page passes its data and actions to panels. |
| [components/issues](../../frontend/src/components/issues), [scan-history](../../frontend/src/components/scan-history), [reports](../../frontend/src/components/reports), [preferences](../../frontend/src/components/preferences) | Feature-specific display and actions. | Look at the owning page and shared saved-scan functions as well as the component. |
| [lib/contexts](../../frontend/src/lib/contexts) | Auth and preferences state shared with descendants. | Both involve asynchronous requests and can be loading or unauthenticated. |
| [lib/api.ts](../../frontend/src/lib/api.ts) | Backend base URL and bearer-header helper. | `authHeaders(token, headers)` adds `Authorization`; do not log tokens or hardcode secrets. |
| [lib/saved-scans.ts](../../frontend/src/lib/saved-scans.ts) | Saved-scan types, API requests, queue/cancel operations, and issue/report mapping. | It is a shared contract for dashboard, history, issues, reports and AI; inspect all callers and tests before changing it. |
| [lib/scan-notifications.ts](../../frontend/src/lib/scan-notifications.ts) | Pure selection of in-app terminal scan notifications. | It returns notification data; it is not an email delivery service. |
| [lib/download.ts](../../frontend/src/lib/download.ts), [lib/utils.ts](../../frontend/src/lib/utils.ts) | Text download and class-name helpers. | Prefer the existing helper where it fits; check the corresponding tests. |
| [lib/mock-scans.ts](../../frontend/src/lib/mock-scans.ts), [lib/mock-issues.ts](../../frontend/src/lib/mock-issues.ts), [test](../../frontend/src/test), [e2e/helpers](../../frontend/e2e/helpers) | Mock data and test fixtures/helpers. | Distinguish fixture values from actual backend responses. |

## Shared function reference

These are the functions most important to following data across pages. The list is intentionally not a claim that every project-owned function has been documented.

| Function | Input and output | How it works and failure behavior |
| --- | --- | --- |
| `authHeaders` | A token and optional headers; returns headers including a bearer authorization value. | Used by API clients; it formats the header and does not validate the token. [Source](../../frontend/src/lib/api.ts). |
| `useAuth` | No arguments; returns the nearest auth context. | Throws if rendered outside `AuthProvider`. The context wraps NextAuth, derives status from its session token, and provides sign-in/up/out. [Source](../../frontend/src/lib/contexts/AuthContext.tsx). |
| `usePreferences` | No arguments; returns preferences state and update/reset/history actions. | Throws outside its provider. The provider loads data once authentication is available and sends mutations with the token. Load errors enter context state; mutations reject on failure. [Source](../../frontend/src/lib/contexts/PreferencesContext.tsx). |
| `fetchSavedScans` | Token and optional limit, offset, status, mode and search; returns a paginated response. | Builds query parameters and performs a no-store authenticated `GET /scans`; a non-success response becomes an error. History, issues, and reports use it. [Source](../../frontend/src/lib/saved-scans.ts). |
| `fetchSavedScan` | Scan ID, token, optional `includeIssues`; returns saved detail. | Requests `GET /scans/{id}`; `includeIssues: false` sets `include_issues=false` for lighter status polls. Non-success responses throw. [Source](../../frontend/src/lib/saved-scans.ts). |
| `mapSavedScanToIssueList` | Saved scan detail; returns display-ready issue rows. | Selects each issue's page and locator, derives a category/WCAG display and finder hint, and carries screenshots. It performs no request or database write. [Source](../../frontend/src/lib/saved-scans.ts). |
| `mapSavedScanToReportData` | Saved scan detail; returns report view data. | Groups findings by page/category, computes display counts and score, and derives metadata; it does not request generated AI suggestions. Its current WCAG label is fixed in the mapper. [Source](../../frontend/src/lib/saved-scans.ts). |
| `evaluateScanNotifications` | Terminal status, summary, optional score/error, and notification preferences; returns an array of notices. | Queued/running yields none, cancelled always yields a cancellation notice, errors and completion depend on preferences, and threshold/high-severity notices are conditional. [Source](../../frontend/src/lib/scan-notifications.ts). |
| `useDashboardScan` | No arguments; returns state and scan, cancel, queue and notice actions. | Posts a scan, polls a pending scan and maps updates. Network/errors are reflected in state; cancellation stops UI polling. See the [workflow](frontend-workflows.md#start-monitor-or-cancel-a-scan) and [source](../../frontend/src/hooks/useDashboardScan.ts). |

Saved-scan helpers also expose generation and export calls: `fetchRepairSuggestionGroups`, `generateRepairSuggestionGroup`, and `fetchRepairSuggestionBundle` target scan-specific endpoints; queue helpers post actions and `cancelSavedScan` posts cancellation. All take the user token. Their actual request shapes and error parsing are in [saved-scans.ts](../../frontend/src/lib/saved-scans.ts).

## MCP: what it is and why it exists

MCP lets a compatible external client ask this application for a linked user's saved scan summaries and findings through a structured tool interface. The frontend endpoint is server-side code; it checks an OAuth access token and calls a separate backend MCP API. It exposes reading, not scan creation or mutation. Webpage content returned by a scan is untrusted evidence, not an instruction to the client.

```mermaid
sequenceDiagram
    participant Client as MCP client
    participant Frontend as Next.js MCP endpoint
    participant IdP as OAuth signing keys
    participant Backend as Backend MCP API
    Client->>Frontend: POST /api/mcp + OAuth bearer token
    Frontend->>IdP: Retrieve signing keys as needed
    Frontend->>Frontend: Validate token; create short-lived delegation
    Frontend->>Backend: Resolve linked user with delegation
    Backend-->>Frontend: User identity or error
    Frontend-->>Client: MCP response to tool/resource/prompt request
```

### Discovery and authentication

- [MCP route](../../frontend/src/app/api/mcp/route.ts) exports POST, GET and DELETE handlers, but `handleMcpRequest` accepts POST after validation and identity lookup and returns 405 for other methods.
- [Protected-resource metadata](../../frontend/src/app/.well-known/oauth-protected-resource/api/mcp/route.ts) is available at `/.well-known/oauth-protected-resource/api/mcp`; the shorter `/.well-known/oauth-protected-resource` route re-exports it. Metadata identifies the resource, authorization server, bearer method and `scans:read` scope.
- `getMcpConfig` in [config.ts](../../frontend/src/lib/mcp/config.ts) validates required configuration. Public endpoints require HTTPS except loopback HTTP in non-production; the resource path must be `/api/mcp`; the internal secret has a minimum byte length. Invalid configuration returns a safe 503 response. Do not put configuration values or credentials in documentation.
- `validateMcpOrigin` and `handleMcpRequest` in [http.ts](../../frontend/src/lib/mcp/http.ts) check the request host/origin and resource path. `authenticate` in [auth.ts](../../frontend/src/lib/mcp/auth.ts) verifies a signed JWT against the configured remote key set, issuer, audience, expiry and required claims; it accepts RS256 or ES256 and requires `scans:read`.
- `createDelegation` issues a short-lived, audience-bound internal assertion. The external access token is not used as the backend assertion. The backend must still resolve the OAuth identity to an application account and enforce ownership.

### Link, read, and errors

1. An application user first links their OAuth identity through `POST /api/mcp/link`. [link.ts](../../frontend/src/lib/mcp/link.ts) requires the correct origin, a NextAuth application session and a valid OAuth bearer token, then forwards the application token and short-lived assertion to the backend link endpoint. `DELETE` revokes links for the signed-in application user without requiring the external OAuth token.
2. A client with a linked identity sends an authorized MCP request. `handleMcpRequest` builds a [McpBackendClient](../../frontend/src/lib/mcp/backend.ts), resolves the linked user through `/mcp/identity`, and creates the MCP server for that request.
3. [server.ts](../../frontend/src/lib/mcp/server.ts) registers `list_scans`, `get_scan_summary`, and `list_scan_issues`, plus a usage guide resource and review prompt. Inputs are bounded with Zod schemas. Findings omit screenshots; source text is to be treated as untrusted.
4. Backend requests have a ten-second timeout and a 512 KiB response limit; the MCP request body limit is 32 KiB. Backend responses are parsed against schemas. Errors are translated to safe messages, with a bounded retry hint for rate limiting; tool errors do not expose arbitrary backend details.

**Debugging:** A 503 can indicate invalid or missing MCP configuration; 401/403 can arise from token validation, scope, origin, or account linking. Trace the status and safe error code, identity-provider issuer/audience/scope, and backend link state without logging credentials. See [MCP integration guide](../guides/mcp-integration.md) for setup details and [MCP tests](../../frontend/src/lib/mcp) for executable examples. A successful unit test does not prove a deployed identity provider, client, or backend is configured.

## Tests and outstanding coverage

[Vitest configuration](../../frontend/vitest.config.mts) and tests beside source cover selected helpers, UI, polling, and MCP; [Playwright tests](../../frontend/e2e) exercise selected routes and responsive flows, often with mocked backend data. [Frontend package scripts](../../frontend/package.json) define `npm test`, `npm run build`, and `npm run test:e2e`.

This guide covers the shared helpers and MCP flow inspected for this audit. It does not document every function or component, prove production authorization, or validate every frontend/backend failure mode. Live MCP linking, external-client use, browser scan/auth flows, full accessibility review, and exhaustive per-function and test coverage remain to be verified.
