# Documentation Index

This folder contains deeper project documentation. Start with the root `README.md` for setup and common commands.

## Where To Read

- [Module inventory](module-inventory.md): map of the frontend, backend, infrastructure and their dependencies.
- [File inventory](file-inventory.md): searchable working-tree path index and explicit exclusions.
- [Frontend pages and workflows](modules/frontend-workflows.md) and [shared frontend and MCP](modules/frontend-shared-and-mcp.md): UI flows, shared helpers and the remote interface.
- [Backend scanning](modules/backend-scanning.md) and [backend data and services](modules/backend-data-and-services.md): scan lifecycle, persistence, accounts and supporting services.
- Frontend references: [public pages and shared controls](modules/frontend-public-and-ui.md), [workspace screens](modules/frontend-workspace-functions.md), [account and preferences UI](modules/frontend-account-preferences-ui.md), [scan and mapping](modules/frontend-scan-functions.md), and [authentication and preferences state](modules/frontend-auth-preferences-functions.md).
- Backend function references: [API routes](modules/backend-api-functions.md), [scanner and worker](modules/backend-scan-functions.md), [scan persistence](modules/backend-scan-repository-functions.md), [authentication](modules/backend-auth-functions.md), [preferences and repairs](modules/backend-preferences-repairs-functions.md), [shared foundations](modules/backend-foundations-functions.md), and [MCP bridge](modules/mcp-backend-functions.md).
- [Developer onboarding](getting-started/developer-onboarding.md): learning path, setup, tracing and troubleshooting.
- [Learn your project](getting-started/learn-your-project.md): beginner-friendly explanations, a real scan walkthrough and exercises with answers.
- [Testing and operations](engineering/testing-and-operations.md): checks, migration safety and deployment caveats.
- Test references: [frontend suites and fixtures](engineering/frontend-tests.md), [backend suites and benchmarks](engineering/backend-tests-and-benchmarks.md).
- [Database migration history](architecture/database-migrations.md): revision map, backfills and upgrade/downgrade cautions.
- [Audit findings](audits/code-quality-report.md): source-based risks and recommended follow-up.
- [Audit progress and coverage](PROGRESS.md): completed evidence, remaining work and validation limits.
- [Refactoring decisions](audits/refactoring-changelog.md): changes made and decisions deferred.
- [MCP integration](guides/mcp-integration.md): optional authenticated remote AI
  access, tool inventory, OAuth/account linking, deployment, and client setup.

| Question | Read This File |
|---|---|
| How do I install, run, test, or troubleshoot the app? | [Project README](../README.md) |
| How do the frontend, API, worker, scanner, and database fit together? | [System architecture](architecture/system-architecture.md) |
| What is implemented now? | [Feature checklist](tracking/feature-checklist.md) |
| What does each feature do, where does it live, and how complete is it? | [Feature inventory](tracking/feature-inventory.md) |
| How fast is scanning, what were the bottlenecks, and what was optimised? | [Performance analysis](architecture/scan-performance-analysis.md), [baseline](architecture/performance-baseline.md), and [results](architecture/performance-results.md) |
| What changed, when, and how was it verified? | [Implementation log](tracking/implementation-log.md) |
| How was Docker introduced? | [Docker setup](guides/docker-setup-guide.md) |
| How was PostgreSQL and Alembic originally bootstrapped? | [Database setup](guides/database-setup-guide.md) |
| How was the first persistence layer planned? | [Persistence implementation guide](implementation/backend-persistence-implementation-guide.md) |

## Document Roles

### `architecture/`

Current technical design and onboarding explanations. This is the canonical place for:

- runtime components and boundaries
- request and worker flows
- data model and API summaries
- external integrations
- risky areas, glossary, and open questions

### `guides/`

Repeatable setup or operational walkthroughs. Some guides record an earlier implementation stage. Their opening callout states whether they are current or historical.

### `implementation/`

Feature build plans and implementation notes. These may be historical after a feature is complete; use the architecture and checklist for current behavior.

### `tracking/`

- `feature-checklist.md` is the source of truth for implemented vs pending features.
- `feature-inventory.md` explains what each feature does, where it lives, and how complete it is (report-ready snapshot with a gap register).
- `implementation-log.md` is append-only history and verification evidence. Older entries describe the project as it existed at that date.

## Avoiding Duplicate Documentation

- Keep the root `README.md` focused on starting and working safely.
- Put current feature status only in `tracking/feature-checklist.md`; other docs should summarize and link to it.
- Put detailed architecture, data, and API explanations in `architecture/system-architecture.md`.
- Put chronological evidence in `tracking/implementation-log.md`; do not rewrite history when later work changes the system.
- Cross-link to a canonical section instead of copying long route, config, or status lists.

## Update Rule

When behavior changes:

1. update `architecture/system-architecture.md` if a flow, boundary, route, model, or integration changed
2. update `tracking/feature-checklist.md` if implementation status changed
3. append `tracking/implementation-log.md` with the change, files, and verification that actually ran
4. update the root `README.md` only when setup, commands, config, or the beginner entry path changed
