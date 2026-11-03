"""Tiny process-local metrics registry plus slow-scan logging.

The backend intentionally avoids adding a metrics dependency: this module is a
small, thread-safe in-process registry rendered in the Prometheus text
exposition format (``text/plain; version=0.0.4``) by ``GET /metrics``.

Metrics exposed
---------------
counters
    ``scan_requests_total{status}``
        Scan runs that reached a terminal status (``complete``, ``error``,
        ``cancelled``); recorded by the scan repository on every terminal
        transition, so it also covers the worker/background execution modes.
    ``scan_issues_total{severity}``
        Accessibility issues found by completed scans, by severity.
    ``rate_limited_total{scope}``
        Requests rejected by the in-process token-bucket rate limiter.

histogram
    ``scan_duration_seconds``
        Wall-clock duration of completed scans, fixed buckets.

gauges
    ``scan_queue_depth``
        Number of scan runs currently in ``queued`` status (index-backed
        ``ix_scan_runs_status_started_at`` query issued at scrape time).
    ``scan_worker_attempts_total``
        Sum of ``scan_runs.worker_attempts``, refreshed from the database when
        the metrics endpoint is scraped so it also covers remote workers.

All values are per-process: a multi-process/multi-container deployment that
wants a single global view must scrape each process or move these values to a
shared metrics store. This module deliberately has no database or FastAPI
imports so repositories can record metrics without creating an import cycle.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Any, Mapping

logger = logging.getLogger("app.metrics")

DEFAULT_HISTOGRAM_BUCKETS: tuple[float, ...] = (
    0.5,
    1.0,
    2.0,
    5.0,
    10.0,
    20.0,
    30.0,
    60.0,
    120.0,
    300.0,
    600.0,
)
DEFAULT_SCAN_SLOW_LOG_SECONDS = 10.0
PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4"

_DISABLED_VALUES = frozenset({"0", "false", "no", "off"})

_metrics_lock = threading.Lock()
_scan_requests_total: dict[str, int] = {}
_scan_issues_total: dict[str, int] = {}
_rate_limited_total: dict[str, int] = {}
_scan_duration_buckets: list[int] = [0] * (len(DEFAULT_HISTOGRAM_BUCKETS) + 1)
_scan_duration_count = 0
_scan_duration_sum = 0.0
_scan_queue_depth = 0.0
_scan_worker_attempts_total = 0.0


def metrics_enabled() -> bool:
    """Return whether ``GET /metrics`` is exposed (``METRICS_ENABLED``)."""
    raw_value = os.getenv("METRICS_ENABLED", "").strip().lower()
    return raw_value not in _DISABLED_VALUES


def get_slow_scan_threshold_seconds() -> float:
    """Return ``SCAN_SLOW_LOG_SECONDS`` (default 10, invalid values ignored)."""
    raw_value = os.getenv("SCAN_SLOW_LOG_SECONDS", "").strip()
    if not raw_value:
        return DEFAULT_SCAN_SLOW_LOG_SECONDS
    try:
        return max(float(raw_value), 0.0)
    except ValueError:
        return DEFAULT_SCAN_SLOW_LOG_SECONDS


def record_scan_request(status: str) -> None:
    """Increment ``scan_requests_total{status}`` for one terminal scan status."""
    with _metrics_lock:
        _scan_requests_total[status] = _scan_requests_total.get(status, 0) + 1


def record_scan_issues(*, high: int = 0, medium: int = 0, low: int = 0) -> None:
    """Add completed-scan issue counts to ``scan_issues_total{severity}``."""
    with _metrics_lock:
        for severity, count in (("high", high), ("medium", medium), ("low", low)):
            _scan_issues_total[severity] = _scan_issues_total.get(severity, 0) + max(
                int(count), 0
            )


def record_scan_issues_from_summary(summary: object | None) -> None:
    """Record issue counts from a ``ScanSummary``-shaped object or mapping."""
    record_scan_issues(
        high=int(_field_value(summary, "high") or 0),
        medium=int(_field_value(summary, "medium") or 0),
        low=int(_field_value(summary, "low") or 0),
    )


def record_scan_duration(seconds: float) -> None:
    """Observe one completed scan duration in ``scan_duration_seconds``."""
    global _scan_duration_count, _scan_duration_sum
    duration = max(float(seconds), 0.0)
    with _metrics_lock:
        for index, boundary in enumerate(DEFAULT_HISTOGRAM_BUCKETS):
            if duration <= boundary:
                _scan_duration_buckets[index] += 1
        # The final slot is the implicit +Inf bucket: every observation lands in it.
        _scan_duration_buckets[-1] += 1
        _scan_duration_count += 1
        _scan_duration_sum += duration


def record_rate_limited(scope: str) -> None:
    """Increment ``rate_limited_total{scope}`` for one rejected request."""
    with _metrics_lock:
        _rate_limited_total[scope] = _rate_limited_total.get(scope, 0) + 1


def set_scan_queue_depth(depth: int) -> None:
    """Set the scrape-time ``scan_queue_depth`` gauge."""
    global _scan_queue_depth
    _scan_queue_depth = float(max(int(depth), 0))


def set_scan_worker_attempts_total(attempts: int) -> None:
    """Set the scrape-time ``scan_worker_attempts_total`` counter value."""
    global _scan_worker_attempts_total
    _scan_worker_attempts_total = float(max(int(attempts), 0))


def record_scan_completion(
    *,
    scan_id: object,
    mode: str | None,
    pages_scanned: int,
    duration_seconds: float,
    summary: object | None = None,
    timings: object | None = None,
) -> None:
    """Record a completed scan and emit one slow-scan log line when needed.

    ``timings`` is consumed defensively (``getattr(result, "timings", None)``)
    so the scanner engine may add or omit phase timings without breaking the
    repository. Phase timings are attached to the slow-scan log line only; no
    duplicate timing computation happens here.
    """
    record_scan_duration(duration_seconds)
    record_scan_issues_from_summary(summary)
    maybe_log_slow_scan(
        scan_id=scan_id,
        mode=mode,
        pages_scanned=pages_scanned,
        duration_seconds=duration_seconds,
        summary=summary,
        timings=timings,
    )


def maybe_log_slow_scan(
    *,
    scan_id: object,
    mode: str | None,
    pages_scanned: int,
    duration_seconds: float,
    summary: object | None = None,
    timings: object | None = None,
) -> bool:
    """Log one structured line when a completed scan exceeds the threshold.

    Returns ``True`` when a line was logged. The payload always carries
    ``scan_id``, ``mode``, ``pages``, ``total_seconds`` and ``issue_counts``;
    scanner phase timings are included only when the scanner result provides
    them.
    """
    threshold = get_slow_scan_threshold_seconds()
    try:
        total_seconds = float(duration_seconds)
    except (TypeError, ValueError):
        return False
    if total_seconds <= threshold:
        return False

    payload: dict[str, Any] = {
        "event": "slow_scan",
        "scan_id": str(scan_id),
        "mode": mode,
        "pages": int(pages_scanned),
        "total_seconds": round(total_seconds, 3),
        "issue_counts": {
            "total": int(_field_value(summary, "total_issues") or 0),
            "high": int(_field_value(summary, "high") or 0),
            "medium": int(_field_value(summary, "medium") or 0),
            "low": int(_field_value(summary, "low") or 0),
        },
    }
    phase_timings = _normalized_timings(timings)
    if phase_timings:
        payload["phase_timings"] = phase_timings

    logger.warning("slow_scan_complete %s", json.dumps(payload, sort_keys=True))
    return True


def render_prometheus() -> str:
    """Render the registry in the Prometheus text exposition format."""
    lines: list[str] = []

    with _metrics_lock:
        counter_snapshots = {
            "scan_requests_total": dict(_scan_requests_total),
            "scan_issues_total": dict(_scan_issues_total),
            "rate_limited_total": dict(_rate_limited_total),
        }
        bucket_snapshot = list(_scan_duration_buckets)
        duration_count = _scan_duration_count
        duration_sum = _scan_duration_sum
        queue_depth = _scan_queue_depth
        worker_attempts = _scan_worker_attempts_total

    lines.append("# HELP scan_requests_total Scan API submissions by outcome.")
    lines.append("# TYPE scan_requests_total counter")
    _append_labelled_samples(
        lines,
        "scan_requests_total",
        "status",
        counter_snapshots["scan_requests_total"],
    )

    lines.append(
        "# HELP scan_duration_seconds Wall-clock duration of completed scans in seconds."
    )
    lines.append("# TYPE scan_duration_seconds histogram")
    for boundary, count in zip(DEFAULT_HISTOGRAM_BUCKETS, bucket_snapshot):
        lines.append(
            f'scan_duration_seconds_bucket{{le="{_format_boundary(boundary)}"}} {count}'
        )
    lines.append(f'scan_duration_seconds_bucket{{le="+Inf"}} {bucket_snapshot[-1]}')
    lines.append(f"scan_duration_seconds_sum {_format_number(duration_sum)}")
    lines.append(f"scan_duration_seconds_count {duration_count}")

    lines.append("# HELP scan_issues_total Accessibility issues found by completed scans.")
    lines.append("# TYPE scan_issues_total counter")
    _append_labelled_samples(
        lines,
        "scan_issues_total",
        "severity",
        counter_snapshots["scan_issues_total"],
    )

    lines.append(
        "# HELP rate_limited_total Requests rejected by the in-process rate limiter."
    )
    lines.append("# TYPE rate_limited_total counter")
    _append_labelled_samples(
        lines,
        "rate_limited_total",
        "scope",
        counter_snapshots["rate_limited_total"],
    )

    lines.append("# HELP scan_queue_depth Number of scan runs currently queued.")
    lines.append("# TYPE scan_queue_depth gauge")
    lines.append(f"scan_queue_depth {_format_number(queue_depth)}")

    lines.append(
        "# HELP scan_worker_attempts_total Sum of scan worker attempts across scan runs."
    )
    lines.append("# TYPE scan_worker_attempts_total gauge")
    lines.append(f"scan_worker_attempts_total {_format_number(worker_attempts)}")

    return "\n".join(lines) + "\n"


def reset_metrics() -> None:
    """Clear every recorded value (used by tests and process restarts)."""
    global _scan_duration_count, _scan_duration_sum
    global _scan_queue_depth, _scan_worker_attempts_total
    with _metrics_lock:
        _scan_requests_total.clear()
        _scan_issues_total.clear()
        _rate_limited_total.clear()
        for index in range(len(_scan_duration_buckets)):
            _scan_duration_buckets[index] = 0
        _scan_duration_count = 0
        _scan_duration_sum = 0.0
        _scan_queue_depth = 0.0
        _scan_worker_attempts_total = 0.0


def _append_labelled_samples(
    lines: list[str],
    metric_name: str,
    label_name: str,
    samples: Mapping[str, int],
) -> None:
    if not samples:
        return
    for label_value in sorted(samples):
        lines.append(
            f'{metric_name}{{{label_name}="{_escape_label_value(label_value)}"}} '
            f"{samples[label_value]}"
        )


def _escape_label_value(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _format_boundary(boundary: float) -> str:
    return f"{boundary:g}"


def _format_number(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:g}"


def _normalized_timings(timings: object | None) -> dict[str, float]:
    if not isinstance(timings, Mapping):
        return {}
    normalized: dict[str, float] = {}
    for key, value in timings.items():
        try:
            normalized[str(key)] = round(float(value), 3)
        except (TypeError, ValueError):
            continue
    return normalized


def _field_value(source: object | None, name: str) -> object | None:
    """Read *name* from a mapping or attribute object, tolerating None."""
    if source is None:
        return None
    if isinstance(source, Mapping):
        return source.get(name)
    return getattr(source, name, None)
