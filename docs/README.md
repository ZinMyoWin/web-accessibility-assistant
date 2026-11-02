# Documentation Index

This folder contains deeper project documentation. Start with the root `README.md` for setup and common commands.

## Where To Read

| Question | Read This File |
|---|---|
| How do I install, run, test, or troubleshoot the app? | `../README.md` |
| How do the frontend, API, worker, scanner, and database fit together? | `architecture/system-architecture.md` |
| What is implemented now? | `tracking/feature-checklist.md` |
| What changed, when, and how was it verified? | `tracking/implementation-log.md` |
| How was Docker introduced? | `guides/docker-setup-guide.md` |
| How was PostgreSQL and Alembic originally bootstrapped? | `guides/database-setup-guide.md` |
| How was the first persistence layer planned? | `implementation/backend-persistence-implementation-guide.md` |

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
