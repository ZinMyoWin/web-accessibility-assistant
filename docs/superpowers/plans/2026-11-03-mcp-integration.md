# AccessAudit MCP Implementation Plan

**Goal:** Deliver an authenticated, bounded, read-only remote MCP integration for existing per-user scans.

**Architecture:** Run the official stable TypeScript SDK v2 inside Next.js at `/api/mcp`. Validate externally issued OAuth access tokens; use a separate short-lived internal assertion to invoke FastAPI. FastAPI maps the verified issuer/subject to an explicitly linked existing user and reuses ownership-scoped repositories.

**Scope:** Three read tools, a static usage resource, a scan-review prompt, explicit account link/unlink, protected-resource metadata, shared database rate limits, tests, configuration, and deployment documentation. No organization/role model exists. No scan creation, destructive tool, API key access, or paid AI generation is exposed.

## Verified design decisions

- In-app transport reuses the frontend deployment and native Web Request/Response support; a separate service would add deployment and identity boundaries without a current need. Stateless request factories allow horizontal scaling.
- NextAuth is an OAuth client, not an authorization server. A configured external provider supplies authorization code + PKCE S256, consent, client registration, token issuance, and revocation policy. The MCP endpoint validates issuer, audience, asymmetric signatures, expiry, subject, and `scans:read` scope.
- An identity binding requires both a valid app session and a verified OAuth token. No identity, user ID, or scope is accepted as a tool argument. Unlinking revokes the binding immediately.
- Backend endpoints use a distinct shared secret and an assertion expiring within 60 seconds, never an incoming external token. Identity and ownership are checked on each request.
- SQL pagination and explicit output projections omit screenshots, worker diagnostics, and settings. Transport and backend bodies are bounded. All tool annotations declare read-only behavior.
- Missing configuration fails closed. HTTPS is required outside loopback development. A gateway must rate-limit unauthenticated traffic and cap concurrent requests before signature verification.

## Execution

1. Backend agent: first add failing tests for delegation, linking, ownership, pagination and shared rate limits; implement models, migration, router and helpers; run backend checks.
2. Main agent: add failing OAuth and real SDK HTTP interaction tests; implement configuration/authentication, fixed backend client, MCP server registrations, Next.js routes and account linking.
3. Independent review: security agent reviews final trust boundaries and tests; repair findings and rerun affected checks.
4. Documentation/configuration: update environment examples, both compose files, README, architecture, feature checklist and implementation log; document provider setup and client connection instructions.
5. Verification: TypeScript, all Vitest tests, production build, backend pytest/compile, migration round-trip on disposable SQLite, real modern and legacy SDK exchanges, and dependency audit where available. Report any unavailable infrastructure without implying live deployment success.

## Review focus

Test wrong issuer/audience/signature/expiry/scope, malformed and oversized bodies, forged ownership arguments, foreign scan UUIDs, relinking conflicts, revoked sessions/bindings, concurrent identities, bounded issue reads, shared throttling, upstream timeouts/cancellation, secure errors and absence of write tools. Do not modify local secrets or deploy to external services.

## Completion evidence — 2026-11-04

Implementation, independent security review, configuration, and documentation are
complete. All 234 backend tests, 129 frontend tests, and 16 browser regressions
passed, as did TypeScript, production build, Compose validation, migration cycle,
and production-server Host/OAuth challenge checks. The review caught and fixed
exact issuer preservation and reverse-proxy authority validation. Deployment,
OAuth provider provisioning, actual user linking, production PostgreSQL migration,
and hosted ChatGPT/Claude verification remain explicit release prerequisites.
