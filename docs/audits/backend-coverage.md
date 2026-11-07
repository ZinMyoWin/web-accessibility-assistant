# Backend documentation coverage ledger

This ledger compares the working-tree backend file inventory with the documentation available during this audit. It is a **documentation coverage map**, not a test result or a security certification. A file can have a function reference and still need tests, review of unusual inputs, concurrency analysis or live verification. Existing uncommitted backend and MCP files were present before this documentation work; their presence does not establish deployment state.

The inventory was checked against `backend/app`, `backend/tests`, `backend/alembic` and `scripts/perf`, and the named reference pages were inspected for coverage. Some earlier documentation may contain additional descriptions; it has not been exhaustively compared here. The scope does not include the frontend, CI or repository-wide artifacts outside these backend-related paths. See the [module inventory](../module-inventory.md), [file inventory](../file-inventory.md), and [progress tracker](../PROGRESS.md) for the wider project.

## Status meanings

* **Function reference**: the linked guide describes named important functions or groups of closely related helpers, based on source inspection. It is not a statement that every callback, edge case, caller and line has been independently verified.
* **Summary**: the module, schema, test file or revision is described at a useful level, but individual functions, fields, assertions or migration statements have not all been documented.
* **Not reviewed in depth**: a file is inventoried but this ledger does not establish a detailed function/line-level review.
* **Excluded**: third-party, generated, installed or sensitive configuration content is outside the project-owned source review described here.

## Application entry points and foundations

| Source file | Status and current coverage | Remaining boundary |
| --- | --- | --- |
| [app/main.py](../../backend/app/main.py) | **Function reference:** [API routes and helpers](../modules/backend-api-functions.md); [auth reference](../modules/backend-auth-functions.md) goes deeper on account routes. | Individual branches, all frontend callers, unexpected errors and live CORS/runtime behavior are not fully verified. |
| [app/db.py](../../backend/app/db.py) | **Function reference:** [foundations](../modules/backend-foundations-functions.md) describes URL selection, engine/session caching, pool settings and errors. | Driver-specific behavior, actual connection settings and deployed pool limits remain unverified. |
| [app/scan_worker.py](../../backend/app/scan_worker.py) | **Function reference:** [scanner and worker](../modules/backend-scan-functions.md) covers loop, job, callback, browser manager and configuration helpers. | Worker ownership, process failures and PostgreSQL concurrency require runtime characterization. |
| [app/mcp_routes.py](../../backend/app/mcp_routes.py) | **Function reference:** [MCP bridge](../modules/mcp-backend-functions.md) covers identity dependencies and routes. | Live identity/provider setup and all concurrency/error paths remain unverified. |

## Services and utilities

| Source file | Status and current coverage | Remaining boundary |
| --- | --- | --- |
| [services/page_scanner.py](../../backend/app/services/page_scanner.py) | **Function reference:** [scanner and worker](../modules/backend-scan-functions.md) covers major scanner, parser, crawl, browser, screenshot and helper functions, some grouped. | Every malformed HTML case, network/browser failure, selector and screenshot-provider edge case is not verified. |
| [services/axe_scanner.py](../../backend/app/services/axe_scanner.py) | **Function reference:** [scanner and worker](../modules/backend-scan-functions.md) covers script loading, WCAG tags, mapping and merge. | Axe runtime behavior and all mappings need independent checks; the mapped-rule merge gap is recorded there. |
| [services/scan_options_resolver.py](../../backend/app/services/scan_options_resolver.py) | **Summary:** [preferences and repairs](../modules/backend-preferences-repairs-functions.md) describes precedence, conversion and page cap. | `_is_explicit`, `_pref_value`, `_pick_mode`, `_pick_int`, `_pick_bool`, `_pick_patterns`, `_pick_wcag_standard` and `_pick_include_best_practices` need their own input/output and edge-case reference. |
| [services/auth_service.py](../../backend/app/services/auth_service.py) | **Function reference:** [authentication](../modules/backend-auth-functions.md) covers password, session/reset tokens and encoding helpers. | Independent cryptographic/security review and deployed-secret behavior are not established. |
| [services/repair_suggestion_service.py](../../backend/app/services/repair_suggestion_service.py) | **Function reference:** [preferences and repairs](../modules/backend-preferences-repairs-functions.md) covers provider dispatch, prompt, HTTP and output parsing helpers. | Unexpected provider payloads, provider policy and live network behavior remain unverified. |
| [services/repair_bundle_service.py](../../backend/app/services/repair_bundle_service.py) | **Function reference:** [preferences and repairs](../modules/backend-preferences-repairs-functions.md) describes format normalization and grouped rendering helpers. | All formatting edge cases and exported content have not been independently verified. |
| [services/mcp_auth.py](../../backend/app/services/mcp_auth.py) | **Function reference:** [MCP bridge](../modules/mcp-backend-functions.md) describes assertion verification and identity key derivation. | Production key management, live token exchange and independent security review remain open. |
| [services/rate_limit.py](../../backend/app/services/rate_limit.py) | **Function reference:** [foundations](../modules/backend-foundations-functions.md) covers bucket, configuration and registry helpers. | Multi-process/proxy deployment behavior and alternative configuration edges are not verified live. |
| [services/metrics.py](../../backend/app/services/metrics.py) | **Function reference:** [foundations](../modules/backend-foundations-functions.md) describes recording, rendering and process-local limitations. | Scrape topology, production counters and concurrency under load are not verified. |
| [utils/url_utils.py](../../backend/app/utils/url_utils.py) | **Function reference:** [foundations](../modules/backend-foundations-functions.md) covers parsing, host resolution and private-target policy. | Redirects, subrequests and DNS changes are not prevented by validation alone; a live egress policy was not tested. |
| [utils/encryption.py](../../backend/app/utils/encryption.py) | **Function reference:** [preferences and repairs](../modules/backend-preferences-repairs-functions.md) covers encryption/decryption and development-key fallback. | Key rotation, deployed settings and independent security review remain open. |

## Repositories

| Source file | Status and current coverage | Remaining boundary |
| --- | --- | --- |
| [repositories/scan_repository.py](../../backend/app/repositories/scan_repository.py) | **Function reference:** [scan repository](../modules/backend-scan-repository-functions.md) groups functions by lifecycle, ownership, writes and commit behavior. | Actual PostgreSQL locking, attempt ownership, cancellation races and every failure path are not proven. |
| [repositories/auth_repository.py](../../backend/app/repositories/auth_repository.py) | **Function reference:** [authentication](../modules/backend-auth-functions.md) covers named queries and writes, including commit boundaries. | Concurrent token/reset behavior and all database failure paths remain unverified. |
| [repositories/preferences_repository.py](../../backend/app/repositories/preferences_repository.py) | **Function reference:** [preferences and repairs](../modules/backend-preferences-repairs-functions.md) covers get/update/reset and key handling. | Concurrent row creation and database failure scenarios remain open. |
| [repositories/repair_suggestion_repository.py](../../backend/app/repositories/repair_suggestion_repository.py) | **Function reference:** [preferences and repairs](../modules/backend-preferences-repairs-functions.md) covers grouping, properties, persistence and mapping helpers. | Concurrent generation/save and every grouping edge case need further testing. |
| [repositories/mcp_repository.py](../../backend/app/repositories/mcp_repository.py) | **Function reference:** [MCP bridge](../modules/mcp-backend-functions.md) covers dialect selection, rate limiting and user-scoped reads. | PostgreSQL contention and live MCP flows are not established by documentation. |

## Models and schemas

The following files primarily declare fields and relationships rather than workflow functions. A summary is not a complete data dictionary: field-by-field constraints, historical backfills, nullability, database indexes and deployment schema still need reconciliation against the actual models and migrations.

| Source file | Status and current coverage |
| --- | --- |
| [models/base.py](../../backend/app/models/base.py) | **Summary:** SQLAlchemy declarative base; its role is implicit in [backend data](../modules/backend-data-and-services.md). No standalone class-level reference. |
| [models/auth.py](../../backend/app/models/auth.py) | **Summary:** user, session and reset-token relationships in [backend data](../modules/backend-data-and-services.md) and [authentication](../modules/backend-auth-functions.md). |
| [models/scan.py](../../backend/app/models/scan.py) | **Summary:** run/issue ownership, state and relationship in [scan repository](../modules/backend-scan-repository-functions.md). |
| [models/preferences.py](../../backend/app/models/preferences.py) | **Summary:** user preferences and encrypted-key storage in [backend data](../modules/backend-data-and-services.md). |
| [models/repair_suggestion.py](../../backend/app/models/repair_suggestion.py) | **Summary:** suggestion ownership, group uniqueness and nullable scan reference in [preferences and repairs](../modules/backend-preferences-repairs-functions.md). |
| [models/mcp.py](../../backend/app/models/mcp.py) | **Summary:** identity links and rate-limit rows in [MCP bridge](../modules/mcp-backend-functions.md). |
| [schemas/auth.py](../../backend/app/schemas/auth.py) | **Function reference plus summary:** [authentication](../modules/backend-auth-functions.md) lists request models and named validators; all payload/error combinations are not tested here. |
| [schemas/preferences.py](../../backend/app/schemas/preferences.py) | **Function reference plus summary:** [preferences and repairs](../modules/backend-preferences-repairs-functions.md) explains the severity validator, bounds and update/response shape; not every field is individually traced to a consumer. |
| [schemas/scan.py](../../backend/app/schemas/scan.py) | **Summary:** request bounds and result fields in [scanning](../modules/backend-scanning.md) and [API functions](../modules/backend-api-functions.md); no field-by-field contract table. |
| [schemas/history.py](../../backend/app/schemas/history.py) | **Summary:** list/detail mapping in [scan repository](../modules/backend-scan-repository-functions.md); all fields are not individually documented. |
| [schemas/repair_suggestion.py](../../backend/app/schemas/repair_suggestion.py) | **Summary:** request, group and bundle shapes in [preferences and repairs](../modules/backend-preferences-repairs-functions.md); no exhaustive field contract table. |

## Alembic migrations and setup

[Database migrations](../architecture/database-migrations.md) gives a linked revision-by-revision upgrade overview. All 18 revisions below are **summary**, not function-level documentation of every `upgrade`/`downgrade` statement or proof of applied database state. The f076 file is existing uncommitted work. Migration graph and selected f075 operations have test coverage described in [backend tests](../engineering/backend-tests-and-benchmarks.md), but the full chain has not been executed or validated against a deployed database in this documentation pass.

| Revision source | Revision source | Revision source |
| --- | --- | --- |
| [f059 scan tables](../../backend/alembic/versions/9848b576f059_create_scan_tables.py) | [f060 preferences](../../backend/alembic/versions/9848b576f060_create_preferences_table.py) | [f061 issue URL](../../backend/alembic/versions/9848b576f061_add_page_url_to_scan_issues.py) |
| [f062 crawl memory](../../backend/alembic/versions/9848b576f062_add_crawl_memory_preferences.py) | [f063 URL lists](../../backend/alembic/versions/9848b576f063_add_scan_page_url_lists.py) | [f064 scan options](../../backend/alembic/versions/9848b576f064_add_scan_options.py) |
| [f065 queue state](../../backend/alembic/versions/9848b576f065_add_scan_worker_queue_state.py) | [f066 auth tables](../../backend/alembic/versions/9848b576f066_add_auth_tables.py) | [f067 user scoping](../../backend/alembic/versions/9848b576f067_scope_data_by_user.py) |
| [f068 suggestions](../../backend/alembic/versions/9848b576f068_create_repair_suggestions.py) | [f069 scan scoping](../../backend/alembic/versions/9848b576f069_scope_repair_suggestions_to_scan_run.py) | [f070 screenshots](../../backend/alembic/versions/9848b576f070_persist_issue_screenshots.py) |
| [f071 reset tokens](../../backend/alembic/versions/9848b576f071_add_password_reset_tokens.py) | [f072 notifications](../../backend/alembic/versions/9848b576f072_add_notification_preferences.py) | [f073 cancellation](../../backend/alembic/versions/9848b576f073_add_scan_cancel_request.py) |
| [f074 WCAG default](../../backend/alembic/versions/9848b576f074_default_wcag_standard_wcag21aa.py) | [f075 indexes](../../backend/alembic/versions/9848b576f075_add_scan_performance_indexes.py) | [f076 MCP links](../../backend/alembic/versions/9848b576f076_add_mcp_account_links.py) |

| Other backend-owned file | Status and boundary |
| --- | --- |
| [alembic/env.py](../../backend/alembic/env.py) | **Summary:** the migration guide identifies its setup role. It has not been independently reviewed function by function for this ledger. |
| [alembic.ini](../../backend/alembic.ini), [alembic/README](../../backend/alembic/README), [alembic/script.py.mako](../../backend/alembic/script.py.mako) | **Not reviewed in depth:** migration configuration, provider README and template are inventoried; do not infer their full behavior from the revision map. |
| [start.sh](../../backend/start.sh) | **Summary:** [migration guide](../architecture/database-migrations.md) notes startup invokes migrations; all shell failure and deployment branches were not independently reviewed here. |
| [Dockerfile](../../backend/Dockerfile), [Dockerfile.dev](../../backend/Dockerfile.dev), [.dockerignore](../../backend/.dockerignore), [requirements.txt](../../backend/requirements.txt) | **Summary/not reviewed in depth:** deployment files and dependencies are inventoried; no complete per-line build, dependency provenance or vulnerability audit is claimed. |

## Tests and performance scripts

[Backend tests and benchmarks](../engineering/backend-tests-and-benchmarks.md) summarizes the 15 test files individually and identifies selected fixtures. **All tests are summary**, not an assertion-by-assertion coverage audit or proof of a passing suite:

| Test source | Test source | Test source |
| --- | --- | --- |
| [API smoke](../../backend/tests/test_api_smoke.py) | [auth](../../backend/tests/test_auth_unit.py) | [bundle/cancel API](../../backend/tests/test_bundle_and_cancel_api.py) |
| [MCP API](../../backend/tests/test_mcp_api.py) | [page scanner](../../backend/tests/test_page_scanner_unit.py) | [performance/API](../../backend/tests/test_perf_api_unit.py) |
| [preferences](../../backend/tests/test_preferences_unit.py) | [repair bundle](../../backend/tests/test_repair_bundle_unit.py) | [repair repository](../../backend/tests/test_repair_suggestion_repository_unit.py) |
| [repair service](../../backend/tests/test_repair_suggestion_service_unit.py) | [scan cancel](../../backend/tests/test_scan_cancel_unit.py) | [scan options](../../backend/tests/test_scan_options_resolver_unit.py) |
| [scan performance](../../backend/tests/test_scan_perf_unit.py) | [scan repository](../../backend/tests/test_scan_repository_unit.py) | [scan worker](../../backend/tests/test_scan_worker_unit.py) |

| Script | Status and remaining work |
| --- | --- |
| [scripts/perf/bench_scan.py](../../scripts/perf/bench_scan.py) | **Summary with principal functions:** [backend tests and benchmarks](../engineering/backend-tests-and-benchmarks.md) covers the local server, instrumentation, scenarios, side effects and output caveats. Not every wrapper, statistics function or report branch was individually reviewed. |
| [scripts/perf/bench_db.py](../../scripts/perf/bench_db.py) | **Summary with principal functions:** same guide explains in-memory SQLite seeding, operations, counters and PostgreSQL limitations. Not every seed/helper branch was individually reviewed. |
| [scripts/perf/check_fallback_path.py](../../scripts/perf/check_fallback_path.py) | **Summary with principal functions:** same guide records output side effects and its stale hardcoded conclusion. It has not been corrected or rerun in this pass. |

The benchmark JSON outputs in `scripts/perf/` are **generated/historical artifacts**, not project implementation or evidence of current performance. They were inventoried but their measurements were not revalidated as part of this ledger.

## Excluded and inaccessible content

* [app/assets/axe.min.js](../../backend/app/assets/axe.min.js) is vendored third-party/minified axe-core; it is **excluded** from project-owned function documentation. [The asset README](../../backend/app/assets/README.md) and [axe integration reference](../modules/backend-scan-functions.md) describe its role, not an audit of its internals.
* Installed dependencies and local virtual environments, caches, compiled Python files and other generated output are **excluded** from the owned-source function review. Their absence from this ledger does not mean their security or licensing was assessed.
* Environment files and their values were **not opened or inventoried**. Configuration variable names and source defaults documented elsewhere come from application code, not a live configuration inspection.

## Follow-up priorities

1. Write a function-level reference for `scan_options_resolver.py`, including explicit `None`, zero, preference and fallback behavior; trace each preference's consumers.
2. Build field-level schema/model and migration upgrade/downgrade references where maintenance depends on exact compatibility, then validate migration behavior on an isolated representative PostgreSQL database.
3. Reconcile all test assertions and helper/callback references, particularly scanner SSRF prevention, mapped axe findings, worker zero-delay reconstruction, stale-worker ownership and reset-token transactions.
4. Complete live, authorized end-to-end and deployment checks separately; record exact commands/results in [progress](../PROGRESS.md). No such checks are implied by a documentation status above.
