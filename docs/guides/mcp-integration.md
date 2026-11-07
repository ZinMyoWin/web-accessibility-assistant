# AccessAudit MCP Integration

## What is implemented

AccessAudit exposes saved accessibility scans to authenticated remote MCP clients at
`https://<frontend-host>/api/mcp`. The endpoint runs in the existing Next.js Node
runtime, uses the official stable `@modelcontextprotocol/server` 2.4.0 SDK, and
supports the 2026-07-28 protocol plus stateless compatibility with 2025-era
Streamable HTTP clients. It does not provide the deprecated standalone SSE transport.

The code is implemented and has automated protocol, authentication, and ownership
tests. A real OAuth authorization server, account links, a migrated database, HTTPS
ingress, and hosted ChatGPT/Claude validation are deployment prerequisites. These
are not provisioned by installing the SDK. Missing configuration returns HTTP 503;
there is no anonymous mode.

| Capability | Inputs | Result |
|---|---|---|
| Tool `list_scans` | `limit` 1–20 (default 10), `offset` 0–100000, optional `status`, optional URL search `q` up to 200 characters | A page of the caller's scan summaries and total count |
| Tool `get_scan_summary` | UUID `scan_id` | Status, mode, URL, page count, timestamps, score, and severity counts for one owned scan |
| Tool `list_scan_issues` | UUID `scan_id`, `limit` 1–50 (default 20), `offset` 0–100000, optional `severity` | A page of owned findings in stable discovery order and total count |
| Resource `accessaudit://guide` | None | Interpretation, pagination, trust, and manual testing guidance |
| Prompt `review_accessibility_scan` | UUID `scan_id` | A review workflow using the summary and issue tools |

`status` accepts `queued`, `running`, `complete`, `error`, or `cancelled`.
`severity` accepts `high`, `medium`, or `low`. Unknown tool arguments are rejected.
All tools declare read-only, idempotent, non-destructive, closed-world annotations.
No tool accepts a user ID, organization ID, permission claim, arbitrary API path,
or upstream URL.

Scan summaries contain `id`, `url`, `status`, `mode`, `pages_scanned`, `started_at`,
`completed_at`, `score`, and `summary` (`total_issues`, `high`, `medium`, `low`).
Issue records contain `rule_id`, `severity`, `element`, `message`,
`recommendation`, `page_url`, and `wcag_criteria`. Lists include `total`, `limit`,
`offset`, and `items`; an issue list also includes `scan_id`.

Screenshots, page queues, worker diagnostics, account settings, emails, provider
keys, and session tokens are excluded. Issue text fields are truncated to 2,000
characters, URLs to 2,048, and WCAG criteria to 20 strings of 100 characters.
Clients should page through results and disclose truncation when reviewing them.
Automated findings and scores do not establish WCAG compliance.

## Why this architecture

The existing app has Next.js/NextAuth for browser sessions, FastAPI for business
operations, SQLAlchemy/PostgreSQL for persistence, and a separate scan worker.
Ownership is per `User.id`; there are no organization, membership, or role models
to extend. The MCP bridge preserves that ownership boundary.

```text
AI client -- OAuth access token --> Next.js /api/mcp
    |                                   |
    +--> external authorization server  +--> verify issuer, audience, JWKS, expiry, scope
                                        |
                                        +--> short-lived internal assertion
                                                  |
                                                  v
                                      FastAPI /mcp/* internal bridge
                                                  |
                                      explicit issuer/subject account link
                                                  |
                                      user-scoped, bounded database reads
```

An in-app route reuses the existing frontend deployment, Web Request/Response
handling, and backend API connection. A fresh MCP server is constructed for each
request, so authentication context is not shared between callers and no sticky
sessions are needed. A separate MCP service would allow independent traffic
scaling and deployment isolation, but would introduce another service and trust
boundary. Revisit that choice if MCP load needs separate capacity or long-lived
server push becomes a requirement.

NextAuth is an OAuth **client**, not an authorization server for external
assistants. The integration therefore uses a configured external authorization
server for consent, authorization-code handling, PKCE, client registration,
refresh tokens, and token revocation policy. It does not repurpose the Google
profile exchange or accept existing app session tokens as MCP credentials.

The incoming OAuth token never goes to FastAPI. Next.js creates a distinct HS256
assertion using `MCP_INTERNAL_SECRET`, with issuer `waa-mcp`, audience
`waa-mcp-backend`, token type `mcp-delegation`, the verified OAuth issuer/subject,
and only `scans:read`. Its lifetime is at most 60 seconds and never exceeds the
external token's expiration. FastAPI validates it and resolves a persisted
identity binding on every request. That binding determines the app user; a scan
UUID grants no additional access. Foreign and nonexistent scan IDs both return
not found.

## How to configure OAuth

Configure a trusted OAuth authorization server before enabling the endpoint.
It must provide:

1. Authorization-code flow with PKCE S256 for public and confidential clients,
   appropriate consent, exact redirect URI validation, and HTTPS endpoints.
2. RFC 8414 authorization-server metadata or OpenID Connect discovery.
3. Resource indicator handling for `resource=<MCP_PUBLIC_URL>` and signed JWT
   access tokens whose `aud` includes that exact MCP resource URL.
4. An HTTPS JWKS endpoint publishing the signing keys for RS256 or ES256.
5. Access-token claims `iss`, stable nonempty `sub`, `iat`, `exp`, and a
   space-delimited `scope` containing `scans:read`. ID tokens are not credentials
   for this API. Opaque access tokens and introspection are not implemented.
6. A supported OAuth client registration method: Client ID Metadata Documents
   (CIMD), dynamic registration (DCR), or explicit pre-registration for the
   intended clients. Register the exact redirect URI shown by each client;
   do not guess it or use wildcard redirects.

The issuer string is an exact identifier. Preserve its trailing slash, if any,
in both services' configuration and the token's `iss`. `MCP_PUBLIC_URL` must be
the canonical frontend URL with exactly the `/api/mcp` path, no trailing slash,
credentials, query, or fragment. Do not put a backend API URL in that variable.

The resource metadata is public at both:

- `/.well-known/oauth-protected-resource/api/mcp`
- `/.well-known/oauth-protected-resource`

It advertises the configured authorization server and `scans:read` scope.
Unauthenticated MCP requests receive HTTP 401 with a `WWW-Authenticate` challenge
containing `resource_metadata`. Missing scope receives HTTP 403 with an
`insufficient_scope` challenge. Tool discovery also requires authentication and
a linked application account.

### Environment variables

| Variable | Service | Meaning |
|---|---|---|
| `MCP_PUBLIC_URL` | Frontend | Canonical HTTPS MCP resource URL, such as `https://audit.example.com/api/mcp` |
| `MCP_OAUTH_ISSUER` | Frontend and backend | Exact trusted authorization-server issuer identifier |
| `MCP_OAUTH_JWKS_URL` | Frontend | Trusted HTTPS JWKS URL obtained from provider configuration/discovery |
| `MCP_INTERNAL_SECRET` | Frontend and backend | Matching random secret of at least 32 UTF-8 bytes; distinct from app session and Google proxy secrets |
| `MCP_ALLOWED_ORIGINS` | Frontend | Optional comma-separated additional exact origins, without paths; canonical frontend origin is always allowed |
| `MCP_RATE_LIMIT_PER_MINUTE` | Backend | Shared per-app-user internal bridge operation budget, integer 1–10000; default 60 |
| `AUTH_API_BASE_URL` | Frontend | Existing server-side backend URL; required explicitly for MCP and preferably private |

These are server environment variables. Never prefix them with `NEXT_PUBLIC_`.
Use a secret manager for `MCP_INTERNAL_SECRET`. Generate a value locally, for
example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
Never reuse a sample value. Rotating this secret requires updating both services;
old assertions cease working immediately.

The checked-in root `.env.example` and `frontend/.env.example` leave MCP disabled
by default. Copy examples to uncommitted local environment files, then supply
real provider values. Compose forwards the backend and frontend values; the
scan worker needs none of the MCP credentials.

### Link an OAuth identity to an existing account

Linking proves control of **both** identities. No matching by email or automatic
account creation occurs. The first release provides account-management API routes;
it does not include a provider-specific linking wizard.

1. Sign in to the intended AccessAudit account in the browser.
2. Through a trusted client registered with your provider, complete its
   authorization-code/PKCE flow for the exact MCP resource and `scans:read` scope.
   Obtain an access token for the same OAuth identity the external assistant will
   use. Follow the provider's SDK or onboarding flow; do not use a client-credentials
   token or disable PKCE to obtain one.
3. In a trusted same-origin onboarding page or the signed-in browser's developer
   console, invoke the link endpoint using that short-lived token:

   ```javascript
   // accessToken comes from your provider's completed PKCE flow.
   const response = await fetch("/api/mcp/link", {
     method: "POST",
     headers: { Authorization: `Bearer ${accessToken}` },
   })
   console.log(response.status, await response.json())
   ```

   The browser supplies the existing session cookie and its Origin. The route
   requires the canonical frontend Origin, validates the OAuth token, and asks
   FastAPI to verify the app session before persisting the issuer/subject binding.
   HTTP 200 reports `linked: true`; repeated linking to the same user is safe.
   HTTP 409 prevents moving an identity already owned by another app account.

4. Clear temporary token variables after onboarding. Never send access tokens to
   an assistant conversation, commit them, or include them in logs.
5. Connect the external client using OAuth as described below.

Provider subjects must be stable for the intended clients. If the provider uses
pairwise, per-client subjects, each distinct verified subject needs its own
explicit link, or the provider must be configured with a suitable shared subject
policy. An email address is not a substitute for that binding.

To revoke **all** MCP identity bindings for the signed-in app account:

```javascript
const response = await fetch("/api/mcp/link", { method: "DELETE" })
console.log(response.status, await response.json()) // { unlinked: <count> }
```

Unlinking needs the app session and canonical Origin, but no OAuth token. It
blocks subsequent identity and data requests even while an external JWT remains
unexpired. A read already authorized and in progress may finish. Browser logout
does not remove an OAuth binding; unlink or revoke the provider grant when that
is intended. There is no destructive MCP tool or assistant-accessible unlink tool.

## How to run locally and deploy

Apply migrations after the existing backend setup:

```powershell
cd backend
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Migration `9848b576f076` adds `mcp_account_links` and `mcp_rate_limits`; it does
not modify existing users or scan data. Downgrading it removes identity bindings
and rate counters. Configure the backend environment before starting the process.
For a separate terminal running Next.js:

```powershell
cd frontend
npm ci
npm run dev
```

For local clients, `http://localhost:3000/api/mcp` is allowed only outside
`NODE_ENV=production`. HTTP issuer/JWKS URLs also require loopback in development.
Use a real HTTPS provider or a local OAuth provider that implements the required
flow; there is no test-token or authentication bypass in the app. ChatGPT and
other hosted clients need an HTTPS endpoint reachable from their service. A
local tunnel changes the canonical MCP resource and token audience, so update
provider settings and `MCP_PUBLIC_URL` together.

For Compose, set the root environment values and run the existing stack:

```powershell
docker compose up --build
# Or hot-reload development:
docker compose -f docker-compose.dev.yml up --build
```

For production, use the existing Node 22 frontend and backend deployment. Keep
the backend image's startup command so it applies migrations before serving.
The public endpoint must terminate valid HTTPS and route `/api/mcp` and both
metadata URLs to Next.js. Keep backend/database traffic on private networking;
the checked-in Compose stack still publishes local database/backend ports and
uses demo database credentials, so it is not a hardened public deployment recipe.

At the gateway, impose unauthenticated per-IP rate limits, a concurrent-request
budget, a 32 KiB request-body limit, header/body read timeouts, and appropriate
connection limits. Do not trust arbitrary forwarded host headers, rewrite the
canonical public Host to an unrelated internal host, cache authenticated MCP
responses, or place browser-session authentication in front of MCP metadata.
Non-browser clients may omit Origin; a present Origin must be allowed. Account
linking always requires the canonical frontend Origin. Cross-origin browser
clients also need an explicitly configured CORS policy at the gateway; the
Origin allowlist alone does not install CORS headers.

## How to connect AI clients

### ChatGPT

After linking the account and completing deployment checks, add the HTTPS
`/api/mcp` URL using ChatGPT's custom MCP server/plugin connection flow and
choose **OAuth** authentication. Configure the client identity/registration mode
supported by your authorization server, then complete consent as the linked
OAuth user. Do not choose anonymous or mixed authentication: this endpoint
authenticates initialization and discovery too. Workspace permissions may
restrict custom connections. Use the exact callback/client metadata values
shown by ChatGPT's connection management screen.

Install/select the resulting connection and try: “List my last five accessibility
scans, then review the high severity findings in the newest completed scan.”
ChatGPT connection labels and availability can vary by product/workspace; follow
the current [OpenAI connection guide](https://developers.openai.com/api/docs/guides/custom-mcp-server)
and [OAuth requirements](https://developers.openai.com/plugins/build/auth).

### Claude Code and other Claude surfaces

For Claude Code, register the remote HTTP endpoint:

```powershell
claude mcp add --transport http accessaudit https://audit.example.com/api/mcp
```

Use Claude Code's `/mcp` flow to authenticate and inspect connection status.
Configure a pre-registered OAuth client if your provider does not support the
client's registration/discovery mechanism. Use the client's displayed callback
URI. Other Claude surfaces that support custom remote connectors can use the
same HTTPS endpoint and OAuth provider; availability depends on the client and
workspace. See the [official Claude Code MCP guide](https://code.claude.com/docs/en/mcp).

### Other MCP clients and a practical tool call

Choose Streamable HTTP, supply the canonical URL, and complete OAuth using the
protected resource metadata. Modern clients can use `server/discover`; legacy
clients use `initialize`, followed by their initialized notification. The SDK
handles both. GET and DELETE at `/api/mcp` return 405 after authentication because
there are no MCP transport sessions to open or delete.

An authenticated legacy-compatible JSON-RPC tool request is:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_scans",
    "arguments": { "limit": 5, "offset": 0, "status": "complete" }
  }
}
```

Send it with `Authorization: Bearer <OAuth access token>`,
`Content-Type: application/json`, `Accept: application/json, text/event-stream`,
and the negotiated `MCP-Protocol-Version`. Prefer a client SDK rather than
hand-building protocol envelopes. Successful tools return structured content
and equivalent text content; tool failures return `isError` without stack traces
or raw upstream messages.

## How reliability and security are enforced

- PostgreSQL atomically maintains one fixed-minute rate counter per app user.
  Different OAuth identities linked to one account share its budget across API
  processes. Each MCP HTTP request verifies the binding through `/mcp/identity`
  (one unit); a tool data read consumes one more. With the default 60, a minute
  containing only tool calls permits roughly 30 calls, while discovery consumes
  one unit. HTTP 429 includes `Retry-After`; counters reset at minute boundaries,
  so gateway controls should also limit bursts.
- Each backend fetch has a 10-second deadline, propagates request cancellation,
  disables redirects, and validates the returned schema. Response reads stop at
  512 KiB. A pathological issue page may need a smaller `limit` even below 50.
  Structured content plus text duplicates the bounded JSON in the final MCP
  result, so size client and gateway response limits accordingly.
- Database reads select only public MCP columns and use SQL `LIMIT/OFFSET`.
  They do not load screenshot blobs or entire issue relationships. Existing
  connection pools and scan/issue indexes are reused. Very large accounts can
  still make total-count and URL-substring searches expensive; measure before
  adding full-text indexes or cursor pagination.
- JWKS keys are cached, with a bounded fetch timeout and cooldown. External JWTs
  are checked locally; provider-side revocation normally takes effect when the
  access token expires. Use short provider access-token lifetimes and unlink for
  immediate app-side revocation. Introspection and a token denylist are absent.
- Request/tool logs include outcomes, duration, tool name, and app user ID where
  relevant. Account link, conflict, and unlink events are logged. Tokens,
  secrets, scan excerpts, and complete tool arguments are not logged. Configure
  production log collection, retention, and restricted access outside the app.
- Scan text remains untrusted. The guide and prompt instruct assistants to use
  it as evidence and never follow embedded webpage instructions. Client-side
  tool approval and prompt-injection protections remain necessary.
- No write tools, paid model calls, scanning, or destructive actions are exposed.
  Future writes need distinct scopes, backend authorization, audit events, and
  meaningful confirmation/idempotency protections before registration.

## How to extend and verify

Keep the current separation:

| Location | Responsibility |
|---|---|
| `frontend/src/app/api/mcp/route.ts` | Next.js Node route |
| `frontend/src/lib/mcp/config.ts`, `auth.ts`, `http.ts` | Configuration, OAuth validation, origin/resource guards, transport |
| `frontend/src/lib/mcp/server.ts` | Tool/resource/prompt registration and safe tool results |
| `frontend/src/lib/mcp/backend.ts` | Fixed backend methods, schemas, response bounds, deadlines |
| `backend/app/mcp_routes.py` | Internal bridge authentication and account link endpoints |
| `backend/app/services/mcp_auth.py` | Dedicated internal assertion verification |
| `backend/app/repositories/mcp_repository.py` | Shared rate accounting and bounded ownership-scoped queries |
| `backend/app/models/mcp.py` | Persistent links and shared counters |

For another read capability, first add a backend operation that derives ownership
from the verified binding and projects a bounded result. Define strict Zod input
and output schemas in `backend.ts`, add a fixed client method, then register a
descriptive tool in `server.ts` using the existing safe execution wrapper and
read-only annotations. Do not accept an arbitrary URL/path or spread a complete
internal API response into a tool result. Add authorization, foreign-owner,
invalid-input, paging/size, and real SDK invocation tests before broadening access.

Run the repository checks:

```powershell
cd frontend
npx.cmd tsc --noEmit --incremental false
npm test
npm run build
cd ../backend
.\venv\Scripts\python.exe -m compileall app
.\venv\Scripts\python.exe -m pytest -q
```

Focused MCP tests live in `frontend/src/lib/mcp/*.test.ts` and
`backend/tests/test_mcp_api.py`. Frontend tests use real cryptographic tokens, a
local HTTP JWKS fixture, and official SDK HTTP exchanges; backend tests exercise
persisted app sessions, links, ownership, bounded reads, and rate accounting.
The local fixture requires loopback socket access in the test environment.
Consult the implementation log and final verification report for actual run
results; automated tests do not prove a hosted provider/client connection.

The implementation verification on 2026-11-04 passed all 234 backend tests,
129 frontend unit/integration tests, 16 existing Chromium browser tests,
TypeScript, production build, both Compose configuration checks, and a running
production-server reverse-proxy Host/OAuth-challenge smoke check. The new migration
was also cycled forward/backward/forward on a disposable SQLite database at the
previous revision. Production PostgreSQL and hosted OAuth clients remain untested.

Before opening production access, verify missing/wrong tokens cannot discover
tools, authorize and link two distinct accounts, confirm each sees only its own
scans, verify unlink and 429 behavior, then complete a real OAuth connection and
tool call from each supported external client. Keep the deployment/provider
configuration and client verification evidence with the release.

Authoritative references: [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28),
[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
[official SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/), and
[HTTP serving/legacy compatibility](https://ts.sdk.modelcontextprotocol.io/v2/serving/http).
