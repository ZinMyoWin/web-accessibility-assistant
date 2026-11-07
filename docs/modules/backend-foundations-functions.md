# Backend foundation function reference

This page describes four shared backend modules: [database sessions](../../backend/app/db.py), [rate limiting](../../backend/app/services/rate_limit.py), [metrics](../../backend/app/services/metrics.py) and [scan target validation](../../backend/app/utils/url_utils.py). They support multiple features rather than one screen. See [Backend API functions](backend-api-functions.md) for route callers and [Backend scanning](backend-scanning.md) for the scanning workflow. Configuration below names variables and code defaults; it does not describe values in any deployment.

## Database engine and sessions

### What and why

[db.py](../../backend/app/db.py) supplies SQLAlchemy engines and sessions. An engine manages connections; a session tracks database operations. API routes receive a session through FastAPI dependency injection, while the background scan task and worker create and close their own sessions. The Alembic setup calls `get_database_url` for migrations.

### Functions

* `get_database_url() -> str` reads `DATABASE_URL`, using the code's local development fallback when absent. It changes `postgresql://` or `postgres://` prefixes to SQLAlchemy's `postgresql+psycopg://` form and otherwise returns the URL as supplied. It does not test connectivity. Connection strings may contain credentials and should not be logged or copied into documentation.
* `get_engine_options(database_url=None) -> dict` returns no pool options for a SQLite URL; for other URLs it returns pool size, overflow, timeout, recycle and pre-ping settings. If no URL argument is supplied it calls `get_database_url`. This does not itself create a connection.
* `_get_env_int(name, default, minimum)` parses an integer, uses the default for an empty/invalid value and clamps valid values to the minimum. `_get_env_bool(name, default)` recognizes common true/false strings and otherwise uses the default. They are internal helpers for engine options.
* `get_engine()` constructs and caches one engine per process with the selected URL and pool options. `get_session_factory()` constructs and caches a session factory with `autoflush=False`, `autocommit=False` and `expire_on_commit=False`. These caches mean configuration changes do not automatically replace an already-created engine or factory in a running process.
* `get_db_session()` yields one session and closes it in `finally`. It does not itself commit a transaction. Repositories such as the [scan repository](../../backend/app/repositories/scan_repository.py) often commit internally, so inspect those boundaries when coordinating multiple writes. An unhandled connection or SQL exception can propagate; closing the session is not a substitute for an explicit transaction design.

### Pool configuration

| Variable | Code default and behavior |
| --- | --- |
| `DB_POOL_SIZE` | 5; minimum 1. |
| `DB_MAX_OVERFLOW` | 10; minimum 0. |
| `DB_POOL_TIMEOUT` | 30 seconds; minimum 1. |
| `DB_POOL_RECYCLE` | 1,800 seconds; minimum 0. |
| `DB_POOL_PRE_PING` | Enabled by default; recognizes common boolean strings. |

Pool settings are per engine/process, so multiple API and worker processes can collectively use more connections than a single pool's limit. SQLite uses SQLAlchemy defaults here. Inspect [performance API tests](../../backend/tests/test_perf_api_unit.py) and test against the target database before changing pooling or transaction behavior.

## In-process rate limiting

### What and why

[rate_limit.py](../../backend/app/services/rate_limit.py) implements token buckets to slow repeated requests. Each identity starts with a capacity of tokens; a request consumes one, and tokens refill over time. The [API helper](../../backend/app/main.py) turns a denial into HTTP 429 and `Retry-After`. Signup, login and forgot-password use the socket peer IP; scan submission uses the authenticated user's ID. Other routes are not automatically limited by this module. MCP has a separate database-backed limiter described in [Backend data and services](backend-data-and-services.md).

### Functions and state

* `TokenBucketRateLimiter(rate_per_minute, capacity=None, clock=time.monotonic)` creates a process-local registry protected by a thread lock. A nonpositive rate raises `ValueError`; default capacity equals the rate. Supplying a clock makes deterministic tests possible.
* `try_acquire(key, cost=1.0) -> (allowed, retry_seconds)` returns success immediately for nonpositive cost. Otherwise, under the lock it prunes idle buckets when due, creates a full bucket for a new key, refills based on elapsed monotonic time up to capacity, and either consumes cost or returns an estimated wait. This operation changes only memory. A custom cost greater than capacity cannot be satisfied by the bucket even though a wait estimate is returned; normal API calls use the default cost.
* `bucket_count()` and `reset()` read or clear the instance's buckets under the lock. `_prune_idle_locked(now)` removes keys idle more than 300 seconds when either the prune interval has elapsed or the registry reaches 256 entries. It is called during acquisition, so a completely idle process does not run a background cleanup job.
* `is_rate_limit_enabled()` is enabled unless `RATE_LIMIT_ENABLED` is a recognized false-like value. `get_configured_limit(scope)` reads `RATE_LIMIT_SCAN_PER_MINUTE` or `RATE_LIMIT_AUTH_PER_MINUTE`; unknown scopes use `RATE_LIMIT_<SCOPE>_PER_MINUTE`. Empty/invalid values use defaults and valid values are clamped to at least 1. Defaults are 30 scan requests per minute per user and 10 auth requests per minute per peer IP; unknown scopes default to 60.
* `get_limiter(scope)` gets or creates a process-wide bucket instance and replaces it if the configured rate changes, clearing that scope's prior bucket state. `check_rate_limit(scope, identity)` returns `(True, 0)` when disabled, otherwise delegates to that limiter. `reset_rate_limits()` clears the process registry, mainly for tests.

The lock coordinates threads **within one process**, not separate API processes or containers. With several processes the effective allowance can be greater than a single configured rate. Behind a reverse proxy, clients can share one apparent socket IP; apply an appropriate trusted-proxy or ingress policy rather than assuming the application sees individual client addresses.

## Metrics and slow-scan logging

### What and why

[metrics.py](../../backend/app/services/metrics.py) keeps a small in-memory registry and renders Prometheus text. The scan repository records terminal/completion information; the API's rate-limit helper records denied requests. `GET /metrics` in [main.py](../../backend/app/main.py) refreshes database-wide queue and worker-attempt gauges, then returns the registry. The endpoint has no authentication check in its handler. When enabled on an exposed backend, its operational data is reachable unless access is restricted elsewhere.

`METRICS_ENABLED` defaults to enabled unless it is set to a recognized false-like value; `metrics_enabled()` controls the route's 404 behavior. It does not turn off every recording call. `SCAN_SLOW_LOG_SECONDS` controls the slow-log threshold, defaulting to 10 seconds; `get_slow_scan_threshold_seconds()` uses the default for an invalid value and clamps a valid value at zero.

### Recording functions

* `record_scan_request(status)` increments a status-labelled process counter. The scan repository normally calls it for terminal states, including completion.
* `record_scan_issues(high=0, medium=0, low=0)` adds nonnegative integer severity counts. `record_scan_issues_from_summary(summary)` obtains those fields from a mapping or object, using zero for missing values. Invalid numeric conversions can raise to the caller.
* `record_scan_duration(seconds)` adds a nonnegative duration to a fixed cumulative histogram, count and sum. `record_rate_limited(scope)` increments a scope-labelled counter. These registry operations use a thread lock.
* `set_scan_queue_depth(depth)` and `set_scan_worker_attempts_total(attempts)` set nonnegative gauges. The API route queries all queued rows and the sum of attempts across scan rows when scraped; if the database query fails it logs a warning and still renders the registry, which may contain old gauge values. The attempts value is a gauge even though its name ends in `_total`; deleting scan records can reduce it.
* `record_scan_completion(scan_id, mode, pages_scanned, duration_seconds, summary=None, timings=None)` records duration and issue totals, then calls `maybe_log_slow_scan`. The repository's `_record_scan_completion_metrics` calls this after committing and catches/logs metrics exceptions so they do not undo persisted results.
* `maybe_log_slow_scan(...) -> bool` logs a structured warning only when duration is greater than the threshold; it returns whether it logged. It includes scan ID, mode, page count, duration and issue counts, plus numeric phase timings if available. An invalid duration returns false. `_field_value` reads a field from a mapping or object; `_normalized_timings` keeps values convertible to numbers.

### Rendering functions and interpretation

`render_prometheus() -> str` takes snapshots of counters and histogram under the registry lock and renders labelled counters, cumulative duration buckets, count/sum and gauges. `_append_labelled_samples` orders labels; `_escape_label_value` escapes special characters; `_format_boundary` and `_format_number` format numeric output. `reset_metrics()` clears the process registry and gauges, principally for tests.

Counters and duration histograms live in the process that recorded them. A separate worker records its own scan completions, while the shown `/metrics` route is in the API process; scraping only that API process does not automatically include worker-local counters. Queue and attempt gauges are instead loaded from the shared database at scrape time. If multiple API instances each expose the same database-wide gauge, summing those gauge values across instances can double-count. Process restarts reset in-memory counters. These points matter when building dashboards or alerts; no live metrics deployment was inspected.

## Scan target URL validation

### What and why

The scanner fetches user-supplied URLs from the server. [url_utils.py](../../backend/app/utils/url_utils.py) checks URL structure and can reject hosts resolving to non-global addresses. [`scan_page`, `_validate_final_url` and `_normalize_discovered_url`](../../backend/app/services/page_scanner.py) call the validator for the initial URL, final navigation URL and discovered links respectively.

### Functions and limits

* `private_targets_allowed() -> bool` reads `SCAN_ALLOW_PRIVATE_TARGETS`. Only recognized false-like values disable private targets; the default and unrecognized values allow them. When allowed, `_warn_private_targets_allowed_once()` logs one warning per process on the first validation call.
* `validate_public_http_url(url) -> str` returns the original URL if accepted. It raises `ValueError` for a non-string/over-2,048-character input, unsupported scheme, missing host or embedded credentials. With private targets disabled it calls `_assert_public_host` before returning. The initial validator does not itself make an HTTP request, although hostname resolution can perform DNS lookup.
* `_resolve_host_addresses(host) -> set[str]` returns a literal IP address directly or uses `socket.getaddrinfo`; lookup failure or no addresses raises `ValueError`. `_assert_public_host(host)` checks every resolved address using `ipaddress` and rejects any address for which `is_global` is false. DNS resolution success is checked at validation time, not pinned to the subsequent connection.

This validation is **not a complete network boundary**. In the current scanner, browser navigation and standard-library redirect following can reach a destination before its final URL is checked; a browser page can also make subrequests. DNS answers can change between checking and connecting. Even with private targets disabled, use a deployment-level network egress policy and treat pre-request controls as unresolved security work. See [target safety limitations](backend-scanning.md#target-safety-limitation) and [scanner functions](backend-scan-functions.md).

## Testing and coverage limits

[Performance/API unit tests](../../backend/tests/test_perf_api_unit.py) cover selected database options, token-bucket behavior, rate-limit responses and metrics rendering. [Scan performance tests](../../backend/tests/test_scan_perf_unit.py) cover selected URL validation and final redirect rejection. Those tests do not by themselves demonstrate that a forbidden redirect destination was never contacted or that multiple processes share limits.

All functions in the four named modules were inspected, along with their principal callers in the API, worker, scanner and scan repository. The detailed behavior of SQLAlchemy drivers/pool implementations, all DNS edge cases, the deployment proxy/egress policy, actual metrics scraping and every test assertion was not verified. No live database, DNS/network target, metrics server or multi-process deployment was exercised for this documentation.
