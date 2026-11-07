# Backend API route and helper reference

This page follows the route functions and supporting helpers in [backend/app/main.py](../../backend/app/main.py). It explains what each function accepts, which service or repository it calls, what it returns, and where ownership is checked. For the scanner internals see [Backend scanning](backend-scanning.md), [scanner and worker functions](backend-scan-functions.md), and [scan repository functions](backend-scan-repository-functions.md). Account, preference, repair and internal MCP details are also covered in [Backend data and services](backend-data-and-services.md).

## How a request reaches a route

`app = FastAPI(...)` creates the application, mounts the [MCP internal router](../../backend/app/mcp_routes.py) and installs CORS middleware. FastAPI uses type annotations and [Pydantic schemas](../../backend/app/schemas/) to parse route inputs. For example, an invalid UUID or out-of-range numeric input normally results in a request-validation response before the handler runs. Most database routes receive a session from [`get_db_session`](../../backend/app/db.py); that dependency closes the session, while repository functions often perform their own commits.

Successful routes shown here use the default HTTP 200 unless a handler or framework changes it. `HTTPException` values below are the cases the code explicitly handles; a database, network or unexpected exception can also propagate. User-facing scan, repair and preferences handlers authenticate before passing the user's ID to the repository. The separate MCP bridge uses a different trust flow.

### CORS and rate-limit helpers

* `get_allowed_origins()` starts with local frontend origins, adds configured frontend/extra origins, removes trailing slashes and duplicates, and returns a list. `get_allowed_origin_regex()` returns a configured regular expression or `None`. They run while CORS middleware is installed; middleware allows credentials and all methods/headers for origins it accepts. CORS controls browser cross-origin access; it is not a replacement for authentication.
* `_client_ip(request)` returns the socket peer host or `"unknown"`. `_enforce_rate_limit(request, *, scope, identity)` calls the [rate limiter](../../backend/app/services/rate_limit.py) and returns normally when allowed; otherwise it increments a metric and raises 429 with a `Retry-After` header. Signup, login and forgot-password pass the peer IP; scan submission passes the authenticated user ID. The buckets are per process, and deployments behind a proxy must account for which peer address is seen.
* `_get_bearer_token(authorization)` requires a nonempty `Bearer ` value or raises 401. `_get_user_from_authorization_header(db, authorization)` calls it, then `get_user_for_token`; a missing, expired, revoked or invalid session produces 401. It returns the user model, not just an unchecked ID.

## Public diagnostic routes

| Route and function | Input, result and side effects |
| --- | --- |
| `GET /` — `read_root` | Returns a simple running message. It performs no database check. |
| `GET /health` — `health_check` | Returns a fixed status and service name. It does not check the database, scanner, worker or external providers. |
| `GET /metrics` — `metrics_endpoint` | When metrics are disabled, raises 404. Otherwise it queries global queued-run count and summed worker attempts, updates gauges and returns Prometheus text. A query error is logged and metrics are still rendered. The route is hidden from generated API documentation but has no authentication check in this function; if exposed, it reveals aggregate operational information. |
| `GET /test/page-bad` — `test_bad_page` | Returns deliberately inaccessible static HTML to exercise checks. |
| `GET /test/page-js-rendered` — `test_js_rendered_page` | Returns HTML that injects several inaccessible elements after a short JavaScript delay, useful for comparing rendered and raw analysis. |

## Authentication routes

The request shapes are defined in [auth.py](../../backend/app/schemas/auth.py). The functions call [auth_service.py](../../backend/app/services/auth_service.py) and [auth_repository.py](../../backend/app/repositories/auth_repository.py); the [account guide](backend-data-and-services.md#authentication-and-session-flow) explains the data and security model.

### `POST /auth/signup` — `signup`

Accepts name, email and password. The schema normalizes name/email and checks lengths and a basic email pattern. The handler applies the IP-based auth limit, checks for an existing email (409 when found), hashes the password, creates the user, creates a session token and session row, and returns `{token, user}`. These repository writes commit separately. Concurrent signups can race between the duplicate check and database insert; the handler does not explicitly convert that later database error into 409.

### `POST /auth/login` — `login`

Accepts email and password, normalizes the email and applies the IP limit. It looks up the user and verifies the password; either an unknown user or an incorrect password returns 401. On success it creates and stores a session and returns `{token, user}`.

### `GET /auth/me` and `POST /auth/logout`

`get_current_user` requires an active bearer session and maps the user to `UserResponse` with ID, name, email and creation time. `logout` extracts a bearer token and calls `revoke_user_session`, then returns `{logged_out: true}`. Missing/malformed bearer syntax returns 401, but the route ignores the repository's boolean result, so an already invalid or revoked token with valid bearer syntax still receives that success object.

### `POST /auth/google` — `google_auth`

Accepts a trusted frontend-forwarded profile containing email, name and `google_sub`, plus the `X-OAuth-Proxy-Secret` header. Missing server configuration returns 503 and an absent/mismatched shared secret returns 401. It looks up or creates an account by normalized email, creates a backend session and returns `{token, user}`. The route relies on the frontend's completed OAuth verification; it does not itself verify a Google token or use `google_sub` to identify the account.

### `POST /auth/forgot-password` and `/auth/reset-password`

`forgot_password` accepts email and applies the IP limit. It returns the same generic message for known and unknown addresses. For a known user it creates a random reset token, invalidates existing unused tokens and stores the new hash. Email delivery is **not implemented**; optional link logging exists for local testing only, despite the response's sent-link wording.

`reset_password` accepts a token and a new password, hashes the token and finds an unused, unexpired record. Missing/invalid/expired records produce 400. It stores a new password hash and invalidates unused tokens, then returns a message. The password change and token invalidation are separate commits, and existing sessions are not revoked here; concurrent or interrupted resets need separate investigation and testing. See [password-reset details](backend-data-and-services.md#password-reset-what-actually-happens).

## Scan submission and background helpers

### `POST /scan/page` — `scan_single_page`

The body is [`ScanPageRequest`](../../backend/app/schemas/scan.py): a required HTTP(S) URL and optional mode, limits, crawl rules, WCAG standard and timing overrides. A bearer session is required and the per-user scan limit applies. The handler loads preferences, calls `resolve_scan_settings`, optionally loads the current user's previously scanned URLs, and builds `ScanOptions`. Explicit non-null request values override preferences; although the schema accepts a page limit up to 500, the resolver caps multi-page scans at five.

In worker mode, `create_scan_job` stores a `queued` job and the handler returns its ID with empty initial results. In background mode, multi-page work is stored as `running` and scheduled with FastAPI `BackgroundTasks`. A background-mode single page calls `scan_page` in the request and saves the finished result before returning it. Job creation or final persistence errors are rolled back and returned as 500; direct URL validation `ValueError` becomes 400; direct `ScanError` keeps its status and triggers an attempt to save an error record. Asynchronous validation or scan errors appear later in the job rather than as the original response. Request schema validation occurs before this logic.

**Example flow:** a signed-in user submits a multi-page scan; the API stores its ID and options; the client polls that user's detail route; the worker or background task publishes partial queue/results and finally stores a terminal result. See the [scan guide](backend-scanning.md) for cancellation, target safety and worker limitations.

### Non-route scan helpers

`run_multi_page_scan_job(scan_id, requested_url, options)` is scheduled only for the in-process multi-page branch. It creates its own database session, calls `scan_page` with queue callbacks, honors cancellation after scanning, and calls completion. `ScanCancelled` marks cancellation; validation and scan failures are stored as failures; other exceptions cause a rollback and generic failure message. Its session closes in `finally`. This background execution is tied to the API process, unlike a durable worker queue.

`_build_queue_control(db, scan_id)` returns callbacks that publish progress with `update_scan_progress`, retrieve queue/exclusions with `get_scan_queue_state`, and read cancellation with `is_scan_cancel_requested`. `get_scan_execution_mode()` recognizes `worker` and falls back to `background` for other values. `serialize_scan_options(options)` converts tuples/sets to JSON-compatible lists for the job row, sorting previous URLs. The worker reconstructs these options separately; the documented zero-delay discrepancy is in [the worker reference](backend-scan-functions.md).

`get_password_reset_link_logging_enabled()` returns true only for configured true-like strings and controls local reset-link printing. It does not send email.

## Scan history and queue routes

All routes in this section require a bearer session. The route supplies `current_user.id` to user-scoped repository operations; missing or another user's scan is represented as 404. See [repository functions](backend-scan-repository-functions.md) for transactions and status transitions.

* `GET /scans` — `get_scans`: accepts `limit` (1–100, default 20), nonnegative `offset`, optional status, mode and URL search `q`. Calls `list_saved_scans` and returns total, pagination and summary items. Status and mode are strings here rather than a route-level enum.
* `GET /scans/{scan_id}` — `get_scan`: accepts a UUID and optional `include_issues` (default true), then calls `get_saved_scan` and `to_saved_scan_response`. False keeps the response shape with an empty issue list for polling.
* `POST /scans/{scan_id}/cancel` — `cancel_scan`: checks that the owned row is active (otherwise 409), then calls `request_scan_cancel` and returns the updated scan. Queued work is marked cancelled; running work is asked to stop at a checkpoint. The route's state check and repository write are separate operations.
* `POST /scans/{scan_id}/queue/remove` and `/queue/prioritize` — `remove_scan_queue_page` and `prioritize_scan_queue_page`: accept `{url: string}`, delegate to owner-scoped repository functions and return the scan. Removing adds an exclusion; prioritizing moves a matching queued URL to the front. A terminal job or absent queue match can be returned unchanged.
* `DELETE /scans` — `delete_scans`: calls `clear_saved_scans` for the current user and returns `{deleted_scan_runs: number}`. It deletes all that user's scan runs, including active ones, rather than a selected scan or only finished rows. Associated issue deletion depends on database foreign-key behavior.

## Repair routes

All three first authenticate and load an owned scan with `get_saved_scan`, returning 404 if unavailable. Request and response definitions are in [repair_suggestion.py](../../backend/app/schemas/repair_suggestion.py).

* `GET /scans/{scan_id}/repair-suggestion-groups` — `get_repair_suggestion_groups`: calls `list_repair_suggestion_groups` and returns a scan ID and groups, including any stored suggestion.
* `POST /scans/{scan_id}/repair-suggestion-groups/{group_key}/generate` — `generate_repair_suggestion_group`: accepts `{force: boolean}`, default false. It returns 404 for an unknown group and returns a cached suggestion unless forced. Otherwise it loads provider preferences, resolves provider/model, decrypts the saved key, returns 400 if no usable key exists, and calls the external AI service. A recognized generation error becomes 502; a valid draft is saved and returned. Representative issue content can be sent to that provider. Other unexpected failures are not converted by this route's specific exception handler.
* `GET /scans/{scan_id}/repair-suggestion-bundle?format=markdown|json` — `get_repair_suggestion_bundle`: loads groups and calls `build_repair_bundle`; unsupported formats raise 400. It returns a JSON envelope with metadata and generated text, leaving the client to create a download.

## Preference routes

`get_app_preferences`, `update_app_preferences` and `reset_app_preferences` handle `GET /preferences`, `PUT /preferences`, and `POST /preferences/reset`. Each authenticates and calls the corresponding user-scoped [preferences repository](../../backend/app/repositories/preferences_repository.py). The update takes a validated [`AppPreferencesUpdate`](../../backend/app/schemas/preferences.py) and applies explicitly provided fields, with `api_key` and `clear_api_key` controlling the encrypted key. Reset replaces the row with defaults. Responses use `AppPreferencesResponse` with a `has_api_key` boolean, without returning the encrypted key. A first read can create and commit a default row. Reset also clears the saved provider key.

## Internal MCP bridge and frontend callers

[mcp_routes.py](../../backend/app/mcp_routes.py) mounts `/mcp/link`, `/mcp/identity`, `/mcp/scans`, `/mcp/scans/{id}` and `/mcp/scans/{id}/issues`. Linking requires both an application session and a trusted short-lived assertion; data reads resolve the assertion to a linked user and limit/paginate results. The [MCP guide](../guides/mcp-integration.md) and [backend data guide](backend-data-and-services.md#mcp-internal-bridge) explain the separate frontend-facing MCP endpoint and trust boundary.

For tracing a user action, [useDashboardScan](../../frontend/src/hooks/useDashboardScan.ts) calls scan submission, [saved-scans.ts](../../frontend/src/lib/saved-scans.ts) calls history, detail, queue, cancel and repair routes, [auth.ts](../../frontend/src/lib/auth.ts) and [auth-options.ts](../../frontend/src/lib/auth-options.ts) call account routes, and [PreferencesContext](../../frontend/src/lib/contexts/PreferencesContext.tsx) calls preference and history-deletion routes. Follow the actual client wrapper and page before changing a request or response contract.

## Coverage and verification limits

All route and helper definitions in `main.py` were inspected for this reference. It summarizes the MCP router rather than documenting each of its helpers; refer to the linked guides and source. It does not individually verify every schema field, frontend callback, repository branch, error response, CORS deployment configuration or external provider behavior. No live API, browser, worker, database or provider was exercised for this page. Tests to inspect include [API smoke tests](../../backend/tests/test_api_smoke.py), [cancellation and bundle API tests](../../backend/tests/test_bundle_and_cancel_api.py), [authentication tests](../../backend/tests/test_auth_unit.py), and [MCP API tests](../../backend/tests/test_mcp_api.py).
