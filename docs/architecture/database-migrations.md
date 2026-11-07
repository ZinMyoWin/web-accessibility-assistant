# Database migrations and history

Alembic keeps the database schema in step with SQLAlchemy models. A revision describes an `upgrade` and usually a `downgrade`; revision files are historical operations, not a report of the schema currently deployed. [Alembic environment](../../backend/alembic/env.py) obtains its database URL through [db.py](../../backend/app/db.py), imports model metadata and runs revisions against the selected connection. The working tree contains a linear chain from `9848b576f059` to `9848b576f076`; `f076` is pre-existing uncommitted MCP work. Do not infer that any database has applied it.

## Revision map

The short IDs below all have the prefix `9848b576`. Follow a link to inspect exact columns, constraints, backfills and downgrade behavior before changing a database.

| Revision | Upgrade responsibility |
| --- | --- |
| [f059](../../backend/alembic/versions/9848b576f059_create_scan_tables.py) | Create scan runs and ordered issue tables and initial indexes. |
| [f060](../../backend/alembic/versions/9848b576f060_create_preferences_table.py) | Create application preferences. |
| [f061](../../backend/alembic/versions/9848b576f061_add_page_url_to_scan_issues.py) | Add issue page URL and reduce missing or greater-than-five saved page limits to five. |
| [f062](../../backend/alembic/versions/9848b576f062_add_crawl_memory_preferences.py) | Add crawl-memory preference and skipped-page count, then backfill nulls. |
| [f063](../../backend/alembic/versions/9848b576f063_add_scan_page_url_lists.py) | Add scanned/skipped URL lists and backfill them using PostgreSQL JSON expressions. |
| [f064](../../backend/alembic/versions/9848b576f064_add_scan_options.py) | Store scan options on a run. |
| [f065](../../backend/alembic/versions/9848b576f065_add_scan_worker_queue_state.py) | Add queued/excluded URLs and worker attempt, lock and heartbeat state. |
| [f066](../../backend/alembic/versions/9848b576f066_add_auth_tables.py) | Create users and sessions with indexes. |
| [f067](../../backend/alembic/versions/9848b576f067_scope_data_by_user.py) | Add nullable user ownership to scans and preferences, foreign keys and indexes. |
| [f068](../../backend/alembic/versions/9848b576f068_create_repair_suggestions.py) | Create saved AI repair suggestions and indexes. |
| [f069](../../backend/alembic/versions/9848b576f069_scope_repair_suggestions_to_scan_run.py) | Change suggestion uniqueness to include the scan. |
| [f070](../../backend/alembic/versions/9848b576f070_persist_issue_screenshots.py) | Add saved issue screenshot data/URL. |
| [f071](../../backend/alembic/versions/9848b576f071_add_password_reset_tokens.py) | Create password-reset token storage and indexes. |
| [f072](../../backend/alembic/versions/9848b576f072_add_notification_preferences.py) | Add notification threshold and severity settings. |
| [f073](../../backend/alembic/versions/9848b576f073_add_scan_cancel_request.py) | Add the running scan cancellation-request timestamp. |
| [f074](../../backend/alembic/versions/9848b576f074_default_wcag_standard_wcag21aa.py) | Set a WCAG 2.1 AA server default and update rows holding the earlier default. |
| [f075](../../backend/alembic/versions/9848b576f075_add_scan_performance_indexes.py) | Add composite indexes for history, queued claims, stale recovery and ordered issues. |
| [f076](../../backend/alembic/versions/9848b576f076_add_mcp_account_links.py) | Create MCP identity links and database-backed request counters. |

## How to use this safely

1. Confirm the intended database and backup/recovery plan before any schema-changing command. The backend [startup script](../../backend/start.sh) invokes `alembic upgrade head` before starting the API, so starting a container can also run migrations.
2. From `backend/`, `alembic heads` reports heads in the current code; `alembic current` queries the selected database. These answer different questions. See the [operations guide](../engineering/testing-and-operations.md#database-and-worker-operations) for Windows commands.
3. Read the migration and surrounding models and repositories, then run it against an isolated database representative of production. Some revisions include PostgreSQL-specific SQL; a SQLite unit test does not validate this chain.
4. Avoid assuming a downgrade restores the original data. For example, f061 changes all null or larger page limits to five on upgrade, while downgrade changes every value of five to twenty. f074's downgrade likewise rewrites every matching newer default to the old one. These operations cannot reconstruct which rows had each original value.
5. Add a new migration for an approved schema change; do not rewrite applied history. Verify upgrade, rollback strategy, application compatibility and data preservation before use.

This map is an overview of migration operations, not a tested upgrade or complete database integrity review. No migration was executed and no database was contacted during this documentation pass.
