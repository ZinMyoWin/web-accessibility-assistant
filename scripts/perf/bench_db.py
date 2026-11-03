#!/usr/bin/env python
"""Reproducible database-path performance baseline for the AccessAudit backend.

The harness seeds synthetic rows into an in-memory SQLite database using the
real SQLAlchemy models and calls the real repository functions from
``app.repositories.scan_repository``.  It measures the query/write operations the
scan API and the scan worker perform, and counts SQL statements plus ORM
objects loaded per operation with SQLAlchemy event listeners (portable evidence
that survives the SQLite -> PostgreSQL caveat).

Run it from anywhere with the backend virtualenv interpreter::

    backend\\venv\\Scripts\\python.exe scripts\\perf\\bench_db.py
    backend\\venv\\Scripts\\python.exe scripts\\perf\\bench_db.py --iterations 20

The database is SQLite in memory (same pattern as the backend unit tests), not
PostgreSQL.  Absolute timings are therefore optimistic: there is no network
round-trip, no WAL/fsync, no PostgreSQL planner and no row locking.  The point of
this section is the *shape* of each operation (statements issued, rows loaded,
rows written) and the relative ordering of costs.
"""

from __future__ import annotations

import argparse
import ctypes
import importlib.metadata
import json
import os
import platform
import statistics
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_JSON_PATH = SCRIPT_DIR / "db_baseline.json"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.models.auth import User  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.models.preferences import AppPreferences  # noqa: E402
from app.models.scan import ScanIssueRecord, ScanRun  # noqa: E402
from app.repositories import scan_repository  # noqa: E402
from app.schemas.scan import ScanIssue, ScanPageResponse, ScanSummary  # noqa: E402

SQLITE_URL = "sqlite+pysqlite:///:memory:"
DEFAULT_ITERATIONS = 20
COMPLETE_SCANS_PER_USER_A = 200
ISSUES_PER_COMPLETE_SCAN = 100
PAGES_PER_COMPLETE_SCAN = 5
QUEUED_SCANS_USER_A = 20
STALE_RUNNING_SCANS_USER_A = 20
COMPLETE_SCANS_USER_B = 20
PROGRESS_ISSUE_COUNTS = [100, 200, 300, 400, 500]

RULE_IDS = [
    "image-alt",
    "color-contrast",
    "link-name",
    "label",
    "button-name",
    "document-title",
    "html-lang",
    "heading-order",
    "duplicate-id",
    "region",
]
SEVERITIES = ["high", "medium", "low"]


# ---------------------------------------------------------------------------
# Counting events + stats helpers
# ---------------------------------------------------------------------------


class DbCounter:
    """Counts SQL statements and ORM instances loaded while `active`."""

class DbCounter:
    """Counts SQL statements, rows affected and ORM instances while `active`.

    Row-write evidence is collected two ways so the append-only persistence
    rewrite can be verified independently of the SQLite timings:

    * DML row counts from ``cursor.rowcount`` in ``after_cursor_execute``
      (portable DBAPI evidence; SQLite reports affected rows for INSERT/DELETE/UPDATE).
    * ORM instance counts from ``Session.before_flush`` (how many
      ``ScanIssueRecord`` objects the unit of work is about to insert/delete).
    """

    def __init__(self) -> None:
        self.active = False
        self.reset()

    def reset(self) -> None:
        self.sql_statements = 0
        self.sql_executemany = 0
        self.orm_loaded = 0
        self.sql_select = 0
        self.sql_insert = 0
        self.sql_update = 0
        self.sql_delete = 0
        self.sql_other = 0
        self.rows_inserted = 0
        self.rows_deleted = 0
        self.rows_updated = 0
        self.orm_issue_rows_inserted = 0
        self.orm_issue_rows_deleted = 0
        self._current_verb = ""

    def attach(self, engine, models) -> None:
        event.listen(engine, "before_cursor_execute", self._before_cursor_execute)
        event.listen(engine, "after_cursor_execute", self._after_cursor_execute)
        # "load" is a mapper/instance event: it must be attached per mapped class.
        for model in models:
            event.listen(model, "load", self._orm_load)
        event.listen(Session, "before_flush", self._before_flush)

    def _before_cursor_execute(
        self, _conn, _cursor, statement, _parameters, _context, executemany
    ) -> None:
        if not self.active:
            return
        self.sql_statements += 1
        if executemany:
            self.sql_executemany += 1
        verb = (statement or "").lstrip().split(None, 1)[0].upper()
        self._current_verb = verb
        if verb == "SELECT":
            self.sql_select += 1
        elif verb == "INSERT":
            self.sql_insert += 1
        elif verb == "UPDATE":
            self.sql_update += 1
        elif verb == "DELETE":
            self.sql_delete += 1
        else:
            self.sql_other += 1

    def _after_cursor_execute(
        self, _conn, cursor, _statement, _parameters, _context, _executemany
    ) -> None:
        if not self.active:
            return
        rowcount = getattr(cursor, "rowcount", -1)
        if rowcount is None or rowcount < 0:
            return
        if self._current_verb == "INSERT":
            self.rows_inserted += int(rowcount)
        elif self._current_verb == "DELETE":
            self.rows_deleted += int(rowcount)
        elif self._current_verb == "UPDATE":
            self.rows_updated += int(rowcount)

    def _orm_load(self, _instance, _context) -> None:
        if self.active:
            self.orm_loaded += 1

    def _before_flush(self, session, _flush_context, _instances) -> None:
        if not self.active:
            return
        for obj in session.new:
            if isinstance(obj, ScanIssueRecord):
                self.orm_issue_rows_inserted += 1
        for obj in session.deleted:
            if isinstance(obj, ScanIssueRecord):
                self.orm_issue_rows_deleted += 1

    def dml_snapshot(self) -> dict:
        return {
            "sql_statements": self.sql_statements,
            "sql_executemany": self.sql_executemany,
            "orm_loaded": self.orm_loaded,
            "sql_select": self.sql_select,
            "sql_insert": self.sql_insert,
            "sql_update": self.sql_update,
            "sql_delete": self.sql_delete,
            "sql_other": self.sql_other,
            "rows_inserted": self.rows_inserted,
            "rows_deleted": self.rows_deleted,
            "rows_updated": self.rows_updated,
            "orm_issue_rows_inserted": self.orm_issue_rows_inserted,
            "orm_issue_rows_deleted": self.orm_issue_rows_deleted,
        }


def _percentile(sorted_values: list[float], percent: float) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * (percent / 100.0)
    lower = int(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    fraction = position - lower
    return sorted_values[lower] * (1.0 - fraction) + sorted_values[upper] * fraction


def _describe_ms(samples_ms: list[float]) -> dict:
    ordered = sorted(samples_ms)
    stdev = statistics.stdev(samples_ms) if len(samples_ms) > 1 else 0.0
    mean = statistics.fmean(samples_ms)
    return {
        "count": len(samples_ms),
        "median_ms": round(statistics.median(samples_ms), 3),
        "min_ms": round(ordered[0], 3),
        "max_ms": round(ordered[-1], 3),
        "p90_ms": round(_percentile(ordered, 90), 3),
        "mean_ms": round(mean, 3),
        "stdev_ms": round(stdev, 3),
        "cv_pct": round((stdev / mean) * 100.0, 2) if mean else 0.0,
        "samples_ms": [round(value, 3) for value in samples_ms],
    }


def _describe_int(samples: list[int]) -> dict:
    ordered = sorted(samples)
    return {
        "count": len(samples),
        "median": statistics.median(samples),
        "min": ordered[0],
        "max": ordered[-1],
        "samples": samples,
    }


def _timed_operation(
    operation_id: str,
    description: str,
    action,
    *,
    iterations: int,
    setup=None,
    kind: str = "read",
    notes: str = "",
) -> dict:
    """Warm the operation once, then time `iterations` measured invocations."""
    action()
    if setup is not None:
        setup()

    samples_ms: list[float] = []
    sql_counts: list[int] = []
    executemany_counts: list[int] = []
    orm_counts: list[int] = []
    select_counts: list[int] = []
    insert_counts: list[int] = []
    update_counts: list[int] = []
    delete_counts: list[int] = []
    rows_inserted_counts: list[int] = []
    rows_deleted_counts: list[int] = []
    rows_updated_counts: list[int] = []
    orm_issue_inserted_counts: list[int] = []
    orm_issue_deleted_counts: list[int] = []
    observed = None
    for _ in range(iterations):
        if setup is not None:
            setup()
        counter.reset()
        counter.active = True
        started = time.perf_counter()
        try:
            observed = action()
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            counter.active = False
        samples_ms.append(elapsed_ms)
        sql_counts.append(counter.sql_statements)
        executemany_counts.append(counter.sql_executemany)
        orm_counts.append(counter.orm_loaded)
        select_counts.append(counter.sql_select)
        insert_counts.append(counter.sql_insert)
        update_counts.append(counter.sql_update)
        delete_counts.append(counter.sql_delete)
        rows_inserted_counts.append(counter.rows_inserted)
        rows_deleted_counts.append(counter.rows_deleted)
        rows_updated_counts.append(counter.rows_updated)
        orm_issue_inserted_counts.append(counter.orm_issue_rows_inserted)
        orm_issue_deleted_counts.append(counter.orm_issue_rows_deleted)

    return {
        "operation_id": operation_id,
        "kind": kind,
        "description": description,
        "iterations": iterations,
        "duration_ms": _describe_ms(samples_ms),
        "sql_statements": _describe_int(sql_counts),
        "sql_executemany_statements": _describe_int(executemany_counts),
        "sql_by_verb": {
            "select": _describe_int(select_counts),
            "insert": _describe_int(insert_counts),
            "update": _describe_int(update_counts),
            "delete": _describe_int(delete_counts),
        },
        "rows_affected": {
            "inserted": _describe_int(rows_inserted_counts),
            "deleted": _describe_int(rows_deleted_counts),
            "updated": _describe_int(rows_updated_counts),
        },
        "orm_issue_rows": {
            "inserted": _describe_int(orm_issue_inserted_counts),
            "deleted": _describe_int(orm_issue_deleted_counts),
        },
        "orm_objects_loaded": _describe_int(orm_counts),
        "observed_last_iteration": observed,
        "notes": notes,
    }


def _measure_progress_publishes(
    session: Session,
    progress_scan_id,
    issue_sets: dict[int, list[ScanIssue]],
    *,
    iterations: int,
) -> dict:
    """Time one full 5-page crawl worth of progress publishes per iteration."""
    page_urls = [
        f"https://user-a.example.com/site-0/page-{index}" for index in range(1, PAGES_PER_COMPLETE_SCAN + 1)
    ]

    def publish_plan():
        queued = list(page_urls[1:])
        return [
            (
                step,
                count,
                {
                    "current_page_url": page_urls[step - 1],
                    "queued_page_urls": queued[step - 1:],
                    "scanned_page_urls": page_urls[:step],
                    "skipped_page_urls": [],
                    "issues": issue_sets[count],
                },
            )
            for step, count in enumerate(PROGRESS_ISSUE_COUNTS, start=1)
        ]

    def reset_state() -> None:
        session.query(ScanIssueRecord).filter(
            ScanIssueRecord.scan_run_id == progress_scan_id
        ).delete(synchronize_session=False)
        session.query(ScanRun).filter(ScanRun.id == progress_scan_id).update(
            {
                "status": "running",
                "pages_scanned": 0,
                "scanned_page_urls": [],
                "queued_page_urls": list(page_urls[1:]),
                "current_page_url": None,
                "total_issues": 0,
                "high_count": 0,
                "medium_count": 0,
                "low_count": 0,
            },
            synchronize_session=False,
        )
        session.commit()
        session.expire_all()

    def run_cycle() -> dict[int, dict]:
        """Run the 5 publishes, capturing measured DML events per publish."""
        measurements: dict[int, dict] = {}
        for step, count, kwargs in publish_plan():
            counter.reset()
            counter.active = True
            started = time.perf_counter()
            try:
                scan_repository.update_scan_progress(session, progress_scan_id, **kwargs)
            finally:
                elapsed_ms = (time.perf_counter() - started) * 1000.0
                counter.active = False
                measurements[step] = {
                    "ms": elapsed_ms,
                    "dml": counter.dml_snapshot(),
                }
        return measurements

    reset_state()
    run_cycle()
    reset_state()

    steps = [step for step, _count, _kwargs in publish_plan()]
    cycle_samples: list[float] = []
    per_step_ms: dict[int, list[float]] = {step: [] for step in steps}
    per_step_dml: dict[int, list[dict]] = {step: [] for step in steps}
    cycle_rows_inserted: list[int] = []
    cycle_rows_deleted: list[int] = []
    cycle_sql_inserts: list[int] = []
    cycle_sql_deletes: list[int] = []
    cycle_sql_selects: list[int] = []
    cycle_orm_inserted: list[int] = []
    cycle_orm_deleted: list[int] = []
    sql_counts: list[int] = []
    orm_counts: list[int] = []
    final_issue_count = 0
    for _ in range(iterations):
        reset_state()
        started = time.perf_counter()
        measurements = run_cycle()
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        final_issue_count = (
            session.query(ScanIssueRecord)
            .filter(ScanIssueRecord.scan_run_id == progress_scan_id)
            .count()
        )
        cycle_samples.append(elapsed_ms)
        cycle_rows_inserted.append(sum(item["dml"]["rows_inserted"] for item in measurements.values()))
        cycle_rows_deleted.append(sum(item["dml"]["rows_deleted"] for item in measurements.values()))
        cycle_sql_inserts.append(sum(item["dml"]["sql_insert"] for item in measurements.values()))
        cycle_sql_deletes.append(sum(item["dml"]["sql_delete"] for item in measurements.values()))
        cycle_sql_selects.append(sum(item["dml"]["sql_select"] for item in measurements.values()))
        cycle_orm_inserted.append(
            sum(item["dml"]["orm_issue_rows_inserted"] for item in measurements.values())
        )
        cycle_orm_deleted.append(
            sum(item["dml"]["orm_issue_rows_deleted"] for item in measurements.values())
        )
        sql_counts.append(sum(item["dml"]["sql_statements"] for item in measurements.values()))
        orm_counts.append(sum(item["dml"]["orm_loaded"] for item in measurements.values()))
        for step, item in measurements.items():
            per_step_ms[step].append(item["ms"])
            per_step_dml[step].append(item["dml"])

    final_rows = PROGRESS_ISSUE_COUNTS[-1]
    inserted_median = int(statistics.median(cycle_rows_inserted))
    deleted_median = int(statistics.median(cycle_rows_deleted))

    def _per_publish_rows(step: int, key: str) -> dict:
        values = [item[key] for item in per_step_dml[step]]
        return _describe_int(values)

    return {
        "operation_id": "update_scan_progress_5_page_crawl",
        "kind": "write",
        "description": (
            "Worker publish cycle: update_scan_progress called once per crawled page with cumulative "
            "issue lists 100->200->300->400->500 (5 publishes per iteration)"
        ),
        "iterations": iterations,
        "cumulative_cycle_ms": _describe_ms(cycle_samples),
        "per_publish_ms": {
            f"publish_{step}_issues_{count}": _describe_ms(per_step_ms[step])
            for step, count in enumerate(PROGRESS_ISSUE_COUNTS, start=1)
        },
        "per_publish_measured_rows": {
            f"publish_{step}_issues_{count}": {
                "issue_rows_inserted": _per_publish_rows(step, "rows_inserted"),
                "issue_rows_deleted": _per_publish_rows(step, "rows_deleted"),
                "sql_insert_statements": _per_publish_rows(step, "sql_insert"),
                "sql_delete_statements": _per_publish_rows(step, "sql_delete"),
                "sql_select_statements": _per_publish_rows(step, "sql_select"),
            }
            for step, count in enumerate(PROGRESS_ISSUE_COUNTS, start=1)
        },
        "sql_statements_per_cycle": _describe_int(sql_counts),
        "sql_statements_by_verb_per_cycle": {
            "select": _describe_int(cycle_sql_selects),
            "insert": _describe_int(cycle_sql_inserts),
            "delete": _describe_int(cycle_sql_deletes),
        },
        "orm_objects_loaded_per_cycle": _describe_int(orm_counts),
        "measured_write_amplification": {
            "pages": PAGES_PER_COMPLETE_SCAN,
            "issues_per_page": PROGRESS_ISSUE_COUNTS[0],
            "inserted_issue_rows_total": inserted_median,
            "deleted_issue_rows_total": deleted_median,
            "row_write_operations_total": inserted_median + deleted_median,
            "final_persisted_issue_rows": final_rows,
            "insert_amplification_x": round(inserted_median / final_rows, 2)
            if final_rows
            else None,
            "row_write_operations_per_final_issue": round(
                (inserted_median + deleted_median) / final_rows, 2
            )
            if final_rows
            else None,
            "verified_final_row_count": final_issue_count,
            "sql_insert_statements_per_cycle": int(statistics.median(cycle_sql_inserts)),
            "sql_delete_statements_per_cycle": int(statistics.median(cycle_sql_deletes)),
            "orm_issue_rows_inserted_per_cycle": int(statistics.median(cycle_orm_inserted)),
            "orm_issue_rows_deleted_per_cycle": int(statistics.median(cycle_orm_deleted)),
            "measurement_method": (
                "Measured from SQLAlchemy after_cursor_execute cursor.rowcount (DML rows) and "
                "Session.before_flush ORM instance counts; not hardcoded arithmetic. A delete "
                "performed via a bulk query before the timed loop is not part of the cycle."
            ),
        },
        "notes": (
            "update_scan_progress now appends only issues that are not persisted yet (count/max-position "
            "SELECT, then insert the tail), so the measured row-event totals above show the real write "
            "amplification of the 5-page crawl. Completion still performs one authoritative replace."
        ),
    }


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------


ISSUE_TEMPLATE = {
    "rule_id": "image-alt",
    "severity": "medium",
    "element": "<img src='/img/hero.png'>",
    "message": "Image is missing an alt attribute.",
    "recommendation": "Add meaningful alt text, or use alt='' for decorative images.",
    "line": 10,
    "column": 5,
    "source_hint": "<img src='/img/hero.png'>",
    "dom_path": "body > main > img:nth-of-type(1)",
    "text_preview": "hero.png",
    "screenshot_data_url": None,
    "wcag_criteria": ["WCAG 2.1 AA"],
    "source": "axe-core",
}


def _make_issue_dict(index: int, page_url: str) -> dict:
    template = ISSUE_TEMPLATE
    return {
        **template,
        "rule_id": RULE_IDS[index % len(RULE_IDS)],
        "severity": SEVERITIES[index % len(SEVERITIES)],
        "position": index,
        "page_url": page_url,
        "dom_path": f"body > main > :nth-child({index + 1})",
        "line": 10 + index,
        "column": (index % 40) + 1,
        "text_preview": f"element-{index}",
    }


def _seed_database(session: Session) -> dict:
    """Seed one primary user (200 complete scans) plus a second scoping user."""
    base = datetime(2025, 1, 1, tzinfo=UTC)

    user_a = User(
        id=uuid4(),
        name="Perf Baseline User A",
        email="perf-baseline-a@example.com",
        password_hash="not-a-real-hash",
    )
    user_b = User(
        id=uuid4(),
        name="Perf Baseline User B",
        email="perf-baseline-b@example.com",
        password_hash="not-a-real-hash",
    )
    session.add_all([user_a, user_b])
    session.flush()

    session.add(
        AppPreferences(
            user_id=user_a.id,
            crawl_depth=3,
            request_delay_ms=250,
            default_page_limit=5,
        )
    )

    run_rows: list[dict] = []
    issue_rows: list[dict] = []

    def add_complete_scan(user, scan_index: int, *, total_runs: int) -> None:
        run_id = uuid4()
        page_urls = [
            f"https://user-{'a' if user is user_a else 'b'}.example.com/site-{scan_index}/page-{page}"
            for page in range(1, PAGES_PER_COMPLETE_SCAN + 1)
        ]
        started_at = base + timedelta(minutes=scan_index)
        run_rows.append(
            {
                "id": run_id,
                "user_id": user.id,
                "requested_url": page_urls[0],
                "final_url": page_urls[0],
                "status": "complete",
                "mode": "multi",
                "page_limit": PAGES_PER_COMPLETE_SCAN,
                "pages_scanned": PAGES_PER_COMPLETE_SCAN,
                "pages_skipped": 0,
                "scanned_page_urls": page_urls,
                "skipped_page_urls": [],
                "queued_page_urls": [],
                "excluded_page_urls": [],
                "current_page_url": None,
                "scan_options": {"mode": "multi", "page_limit": 5, "crawl_depth": 3},
                "worker_attempts": 1,
                "max_worker_attempts": 3,
                "worker_id": None,
                "locked_at": None,
                "heartbeat_at": None,
                "cancel_requested_at": None,
                "last_error": None,
                "started_at": started_at,
                "completed_at": started_at + timedelta(seconds=30),
                "duration_seconds": 30,
                "total_issues": ISSUES_PER_COMPLETE_SCAN,
                "high_count": 4,
                "medium_count": 4,
                "low_count": issues_remaining,
                "score": 60,
                "error_message": None,
            }
        )
        for issue_index in range(ISSUES_PER_COMPLETE_SCAN):
            issue_rows.append(
                {
                    "id": uuid4(),
                    "scan_run_id": run_id,
                    **_make_issue_dict(
                        issue_index, page_urls[issue_index % PAGES_PER_COMPLETE_SCAN]
                    ),
                }
            )

    issues_remaining = ISSUES_PER_COMPLETE_SCAN - 8
    for scan_index in range(COMPLETE_SCANS_PER_USER_A):
        add_complete_scan(user_a, scan_index, total_runs=COMPLETE_SCANS_PER_USER_A)
    for scan_index in range(COMPLETE_SCANS_USER_B):
        add_complete_scan(user_b, 1000 + scan_index, total_runs=COMPLETE_SCANS_USER_B)

    queued_ids: list = []
    for queue_index in range(QUEUED_SCANS_USER_A):
        run_id = uuid4()
        queued_ids.append(run_id)
        run_rows.append(
            {
                "id": run_id,
                "user_id": user_a.id,
                "requested_url": "https://user-a.example.com/queued",
                "final_url": None,
                "status": "queued",
                "mode": "multi",
                "page_limit": 5,
                "pages_scanned": 0,
                "pages_skipped": 0,
                "scanned_page_urls": [],
                "skipped_page_urls": [],
                "queued_page_urls": ["https://user-a.example.com/queued"],
                "excluded_page_urls": [],
                "current_page_url": None,
                "scan_options": {"mode": "multi"},
                "worker_attempts": 0,
                "max_worker_attempts": 3,
                "worker_id": None,
                "locked_at": None,
                "heartbeat_at": None,
                "cancel_requested_at": None,
                "last_error": None,
                "started_at": base + timedelta(days=1, seconds=queue_index),
                "completed_at": None,
                "duration_seconds": None,
                "total_issues": 0,
                "high_count": 0,
                "medium_count": 0,
                "low_count": 0,
                "score": None,
                "error_message": None,
            }
        )

    stale_ids: list = []
    stale_heartbeat = datetime.now(UTC) - timedelta(hours=2)
    for stale_index in range(STALE_RUNNING_SCANS_USER_A):
        run_id = uuid4()
        stale_ids.append(run_id)
        run_rows.append(
            {
                "id": run_id,
                "user_id": user_a.id,
                "requested_url": "https://user-a.example.com/stale",
                "final_url": None,
                "status": "running",
                "mode": "multi",
                "page_limit": 5,
                "pages_scanned": 0,
                "pages_skipped": 0,
                "scanned_page_urls": [],
                "skipped_page_urls": [],
                "queued_page_urls": [],
                "excluded_page_urls": [],
                "current_page_url": "https://user-a.example.com/stale",
                "scan_options": {"mode": "multi"},
                "worker_attempts": 1,
                "max_worker_attempts": 3,
                "worker_id": "dead-worker",
                "locked_at": stale_heartbeat,
                "heartbeat_at": stale_heartbeat,
                "cancel_requested_at": None,
                "last_error": None,
                "started_at": base + timedelta(days=2, seconds=stale_index),
                "completed_at": None,
                "duration_seconds": None,
                "total_issues": 0,
                "high_count": 0,
                "medium_count": 0,
                "low_count": 0,
                "score": None,
                "error_message": None,
            }
        )

    # Dedicated rows for the remaining write-path measurements.
    progress_scan_id = uuid4()
    complete_scan_id = uuid4()
    worker_poll_scan_id = uuid4()
    for scan_id, status in (
        (progress_scan_id, "running"),
        (complete_scan_id, "running"),
        (worker_poll_scan_id, "running"),
    ):
        run_rows.append(
            {
                "id": scan_id,
                "user_id": user_a.id,
                "requested_url": "https://user-a.example.com/dedicated",
                "final_url": None,
                "status": status,
                "mode": "multi",
                "page_limit": 5,
                "pages_scanned": 0,
                "pages_skipped": 0,
                "scanned_page_urls": [],
                "skipped_page_urls": [],
                "queued_page_urls": ["https://user-a.example.com/dedicated/page-2"],
                "excluded_page_urls": [],
                "current_page_url": None,
                "scan_options": {"mode": "multi"},
                "worker_attempts": 1,
                "max_worker_attempts": 3,
                "worker_id": "perf-worker",
                "locked_at": None,
                "heartbeat_at": None,
                "cancel_requested_at": None,
                "last_error": None,
                "started_at": base + timedelta(days=3),
                "completed_at": None,
                "duration_seconds": None,
                "total_issues": 0,
                "high_count": 0,
                "medium_count": 0,
                "low_count": 0,
                "score": None,
                "error_message": None,
            }
        )

    _bulk_insert(session, ScanRun, run_rows)
    _bulk_insert(session, ScanIssueRecord, issue_rows)

    return {
        "user_a_id": user_a.id,
        "user_b_id": user_b.id,
        "queued_ids": queued_ids,
        "stale_ids": stale_ids,
        "progress_scan_id": progress_scan_id,
        "complete_scan_id": complete_scan_id,
        "worker_poll_scan_id": worker_poll_scan_id,
        "a_complete_scan_ids": [row["id"] for row in run_rows if row["user_id"] == user_a.id and row["status"] == "complete"],
        "b_complete_scan_ids": [row["id"] for row in run_rows if row["user_id"] == user_b.id and row["status"] == "complete"],
    }


def _bulk_insert(session: Session, model, rows: list[dict], chunk_size: int = 2000) -> None:
    for start in range(0, len(rows), chunk_size):
        session.bulk_insert_mappings(model, rows[start : start + chunk_size])
        session.commit()


# ---------------------------------------------------------------------------
# Environment info
# ---------------------------------------------------------------------------


def _windows_cpu_name() -> str | None:
    try:
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
        )
        with key:
            value, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            return str(value).strip()
    except Exception:
        return None


def _total_ram_gb() -> float | None:
    try:
        class _MemoryStatusEx(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = _MemoryStatusEx()
        status.dwLength = ctypes.sizeof(_MemoryStatusEx)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return round(status.ullTotalPhys / (1024**3), 1)
    except Exception:
        return None
    return None


def _package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def _machine_info() -> dict:
    return {
        "hostname": platform.node(),
        "platform": platform.platform(),
        "processor": _windows_cpu_name() or platform.processor() or None,
        "cpu_logical": os.cpu_count(),
        "ram_total_gb": _total_ram_gb(),
        "python": sys.version,
        "python_executable": sys.executable,
        "packages": {
            "sqlalchemy": _package_version("sqlalchemy"),
            "pydantic": _package_version("pydantic"),
        },
    }


# ---------------------------------------------------------------------------
# Scoping checks (untimed correctness of the measured access patterns)
# ---------------------------------------------------------------------------


def _scoping_checks(session: Session, ids: dict) -> dict:
    """Untimed checks that the measured access patterns stay user-scoped.

    Runs against the freshly seeded database, before the write benchmarks add
    extra rows.
    """
    user_a = ids["user_a_id"]
    user_b = ids["user_b_id"]
    a_scan_id = ids["a_complete_scan_ids"][0]
    b_scan_id = ids["b_complete_scan_ids"][0]

    user_a_list = scan_repository.list_saved_scans(
        session, user_id=user_a, limit=10, offset=0, status="complete"
    )
    user_b_list = scan_repository.list_saved_scans(
        session, user_id=user_b, limit=10, offset=0, status="complete"
    )
    user_a_detail = scan_repository.get_saved_scan(session, a_scan_id, user_a)
    user_b_detail = scan_repository.get_saved_scan(session, b_scan_id, user_b)
    cross_detail = scan_repository.get_saved_scan(session, a_scan_id, user_b)

    return {
        "user_a_complete_scans": user_a_list.total,
        "user_a_list_items_returned": len(user_a_list.items),
        "expected_user_a_complete_scans": COMPLETE_SCANS_PER_USER_A,
        "user_a_total_matches": user_a_list.total == COMPLETE_SCANS_PER_USER_A,
        "user_b_complete_scans": user_b_list.total,
        "expected_user_b_complete_scans": COMPLETE_SCANS_USER_B,
        "user_b_total_matches": user_b_list.total == COMPLETE_SCANS_USER_B,
        "user_a_detail_issues": len(user_a_detail.issues) if user_a_detail else None,
        "user_b_detail_issues": len(user_b_detail.issues) if user_b_detail else None,
        "cross_user_get_saved_scan_is_none": cross_detail is None,
    }


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _print_markdown_table(baseline: dict) -> None:
    print("\n### Repository operation timings (in-memory SQLite, ms)\n")
    headers = [
        "operation",
        "kind",
        "n",
        "median",
        "p90",
        "mean",
        "stdev",
        "SQL stmts/op",
        "DML rows ins/del/upd",
        "ORM rows loaded/op",
    ]
    rows = []
    for operation in baseline["operations"]:
        duration = operation["duration_ms"]
        dml = operation["rows_affected"]
        rows.append(
            [
                operation["operation_id"],
                operation["kind"],
                str(duration["count"]),
                f"{duration['median_ms']:.2f}",
                f"{duration['p90_ms']:.2f}",
                f"{duration['mean_ms']:.2f}",
                f"{duration['stdev_ms']:.2f}",
                f"{operation['sql_statements']['median']:.0f}",
                f"{dml['inserted']['median']:.0f}/{dml['deleted']['median']:.0f}/{dml['updated']['median']:.0f}",
                f"{operation['orm_objects_loaded']['median']:.0f}",
            ]
        )
    widths = [max(len(str(row[index])) for row in [headers, *rows]) for index in range(len(headers))]
    print("| " + " | ".join(str(headers[i]).ljust(widths[i]) for i in range(len(headers))) + " |")
    print("|" + "|".join("-" * (width + 2) for width in widths) + "|")
    for row in rows:
        print("| " + " | ".join(str(row[i]).ljust(widths[i]) for i in range(len(headers))) + " |")

    amplification = baseline["progress_write_amplification"]
    write_info = amplification["measured_write_amplification"]
    print("\n### 5-page progress publish: measured write amplification\n")
    print(
        f"- per iteration (measured, not hardcoded): "
        f"{write_info['inserted_issue_rows_total']} issue-row INSERTs + "
        f"{write_info['deleted_issue_rows_total']} issue-row DELETEs = "
        f"{write_info['row_write_operations_total']} row-write operations "
        f"to persist {write_info['final_persisted_issue_rows']} final rows "
        f"({write_info['row_write_operations_per_final_issue']}x row writes per final issue; "
        f"{write_info['insert_amplification_x']}x insert amplification)"
    )
    print(
        f"- SQL statements per cycle: {amplification['sql_statements_by_verb_per_cycle']}"
    )
    print("\n### Per-publish timings inside the 5-page crawl cycle (ms)\n")
    for name, stats in amplification["per_publish_ms"].items():
        print(f"- {name}: median {stats['median_ms']:.2f} ms, p90 {stats['p90_ms']:.2f} ms")

    checks = baseline["scoping_checks"]
    print("\n### Scoping checks (freshly seeded database)\n")
    print(
        f"- user A complete scans: {checks['user_a_complete_scans']} "
        f"(expected {checks['expected_user_a_complete_scans']}, ok={checks['user_a_total_matches']}); "
        f"user B complete scans: {checks['user_b_complete_scans']} "
        f"(expected {checks['expected_user_b_complete_scans']}, ok={checks['user_b_total_matches']})"
    )
    print(
        f"- detail lookups: user A scan issues={checks['user_a_detail_issues']}, "
        f"user B scan issues={checks['user_b_detail_issues']}, "
        f"cross-user get_saved_scan blocked={checks['cross_user_get_saved_scan_is_none']}"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def _parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=DEFAULT_ITERATIONS)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_PATH)
    arguments = parser.parse_args(argv)
    if arguments.iterations < 20:
        raise SystemExit("--iterations must be >= 20 (the baseline requires medians over >=20 runs)")
    return arguments


def main(argv: list[str] | None = None) -> int:
    global counter

    arguments = _parse_arguments(argv)
    started_at = datetime.now(UTC)
    iterations = arguments.iterations
    machine = _machine_info()

    print("AccessAudit database-path performance baseline")
    print(f"  engine: {SQLITE_URL} (PostgreSQL is the production database; see limitations)")
    print(f"  machine: {machine['processor']} | {machine['cpu_logical']} logical CPUs | {machine['ram_total_gb']} GB RAM")

    engine = create_engine(SQLITE_URL)
    counter = DbCounter()
    counter.attach(engine, [ScanRun, ScanIssueRecord])
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        class_=Session,
    )

    Base.metadata.create_all(engine)
    session = session_factory()

    print("  seeding 200 complete scans x (5 pages, 100 issues) + 20 queued + 20 stale running ...", flush=True)
    seed_started = time.perf_counter()
    ids = _seed_database(session)
    seed_seconds = time.perf_counter() - seed_started
    row_counts = {
        "scan_runs": session.query(ScanRun).count(),
        "scan_issues": session.query(ScanIssueRecord).count(),
        "users": session.query(User).count(),
    }
    print(f"  seeded: {row_counts} in {seed_seconds:.1f}s", flush=True)

    user_a = ids["user_a_id"]
    user_b = ids["user_b_id"]
    a_scan_id = ids["a_complete_scan_ids"][0]
    progress_scan_id = ids["progress_scan_id"]
    worker_poll_scan_id = ids["worker_poll_scan_id"]

    # Pre-build payloads outside timed regions (production already holds them in
    # memory; only the repository call itself is measured).
    progress_issue_sets = {
        count: [
            ScanIssue(
                rule_id=RULE_IDS[index % len(RULE_IDS)],
                severity=SEVERITIES[index % len(SEVERITIES)],
                element=f"<div id='perf-{index}'>",
                message="Synthetic issue message for the progress publish benchmark.",
                recommendation="Synthetic recommendation text for the progress publish benchmark.",
                dom_path=f"body > main > :nth-child({index + 1})",
                page_url="https://user-a.example.com/dedicated/page-1",
            )
            for index in range(count)
        ]
        for count in PROGRESS_ISSUE_COUNTS
    }
    complete_issue_list = [
        ScanIssue(
            rule_id=RULE_IDS[index % len(RULE_IDS)],
            severity=SEVERITIES[index % len(SEVERITIES)],
            element=f"<div id='complete-{index}'>",
            message="Synthetic issue message for the completion write benchmark.",
            recommendation="Synthetic recommendation text for the completion write benchmark.",
            dom_path=f"body > main > :nth-child({index + 1})",
            page_url="https://user-a.example.com/dedicated/page-1",
        )
        for index in range(ISSUES_PER_COMPLETE_SCAN)
    ]
    complete_result = ScanPageResponse(
        url="https://user-a.example.com/dedicated/page-1",
        scanned_at=datetime.now(UTC).isoformat(),
        mode="single",
        pages_scanned=1,
        pages_skipped=0,
        scanned_page_urls=["https://user-a.example.com/dedicated/page-1"],
        skipped_page_urls=[],
        summary=ScanSummary(
            total_issues=ISSUES_PER_COMPLETE_SCAN,
            high=4,
            medium=4,
            low=ISSUES_PER_COMPLETE_SCAN - 8,
        ),
        issues=complete_issue_list,
    )

    claim_holder: dict = {"last_claimed_id": None}

    def reset_complete_scan() -> None:
        session.query(ScanIssueRecord).filter(
            ScanIssueRecord.scan_run_id == ids["complete_scan_id"]
        ).delete(synchronize_session=False)
        scan_run = session.get(ScanRun, ids["complete_scan_id"])
        scan_run.status = "running"
        scan_run.pages_scanned = 0
        scan_run.scanned_page_urls = []
        scan_run.current_page_url = None
        scan_run.total_issues = 0
        scan_run.high_count = 0
        scan_run.medium_count = 0
        scan_run.low_count = 0
        scan_run.worker_attempts = 1
        session.commit()

    def reset_claimed_scan() -> None:
        claimed_id = claim_holder["last_claimed_id"]
        if claimed_id is not None:
            session.query(ScanRun).filter(ScanRun.id == claimed_id).update(
                {
                    "status": "queued",
                    "worker_attempts": 0,
                    "worker_id": None,
                    "locked_at": None,
                    "heartbeat_at": None,
                },
                synchronize_session=False,
            )
            session.commit()
            session.expire_all()

    def claim_action() -> dict:
        claimed = scan_repository.claim_next_queued_scan(session, worker_id="perf-worker")
        claim_holder["last_claimed_id"] = claimed.id if claimed is not None else None
        return {"claimed": claimed is not None, "status": claimed.status if claimed else None}

    def reset_stale_scans() -> None:
        old_heartbeat = datetime.now(UTC) - timedelta(hours=2)
        session.query(ScanRun).filter(ScanRun.id.in_(ids["stale_ids"])).update(
            {
                "status": "running",
                "worker_attempts": 1,
                "worker_id": "dead-worker",
                "heartbeat_at": old_heartbeat,
                "locked_at": old_heartbeat,
                "cancel_requested_at": None,
            },
            synchronize_session=False,
        )
        session.commit()
        session.expire_all()

    # Scoping checks run against the freshly seeded database, before the write
    # benchmarks add extra completed scans.
    scoping = _scoping_checks(session, ids)
    print(f"  scoping checks: {scoping}", flush=True)

    def poll_status_only() -> dict:
        """Lightweight polling read + serialization with include_issues=False."""
        scan = scan_repository.get_saved_scan(
            session, a_scan_id, user_a, include_issues=False
        )
        if scan is None:
            return {"found": False, "issues": 0}
        response = scan_repository.to_saved_scan_response(scan, include_issues=False)
        return {"found": True, "issues": len(response.issues), "status": scan.status}

    operations = []
    operations.append(
        _timed_operation(
            "list_saved_scans_limit_10",
            "Saved scan list, first page of 10, unfiltered (GET /scans?limit=10)",
            lambda: _observe_list(
                scan_repository.list_saved_scans(session, user_id=user_a, limit=10, offset=0)
            ),
            iterations=iterations,
            notes=(
                "COUNT(*) + page SELECT; for rows with empty scanned_page_urls the list adds one "
                "column-only issue-page-URL query for the whole page (constant, replaces the historical "
                "per-row lazy loads)."
            ),
        )
    )
    operations.append(
        _timed_operation(
            "list_saved_scans_limit_50",
            "Saved scan list, first page of 50, unfiltered (GET /scans?limit=50)",
            lambda: _observe_list(
                scan_repository.list_saved_scans(session, user_id=user_a, limit=50, offset=0)
            ),
            iterations=iterations,
            notes="Same statements as limit=10 but returns 50 scan rows; fallback URL resolution stays constant.",
        )
    )
    operations.append(
        _timed_operation(
            "list_saved_scans_status_filter",
            "Saved scan list, limit 10, status='complete' filter",
            lambda: _observe_list(
                scan_repository.list_saved_scans(
                    session, user_id=user_a, limit=10, offset=0, status="complete"
                )
            ),
            iterations=iterations,
            notes=(
                "Complete rows have scanned_page_urls populated, so no fallback query is issued. The "
                "(status, started_at) index from migration f075 is migration-only and therefore not "
                "present in this SQLite create_all database - the measured time is shape-only."
            ),
        )
    )
    operations.append(
        _timed_operation(
            "list_saved_scans_q_ilike",
            "Saved scan list, limit 10, q='site-42' (ILIKE on requested_url/final_url)",
            lambda: _observe_list(
                scan_repository.list_saved_scans(
                    session, user_id=user_a, limit=10, offset=0, q="site-42"
                )
            ),
            iterations=iterations,
            notes="Two leading-wildcard ILIKE scans over requested_url/final_url; not indexable in PostgreSQL either.",
        )
    )
    operations.append(
        _timed_operation(
            "get_saved_scan_100_issues",
            "Saved scan detail for one scan with 100 issue rows (GET /scans/{id})",
            lambda: _observe_detail(
                scan_repository.get_saved_scan(session, a_scan_id, user_a)
            ),
            iterations=iterations,
            notes="selectinload(ScanRun.issues): one SELECT for the run plus one SELECT ... WHERE scan_run_id IN (...).",
        )
    )
    operations.append(
        _timed_operation(
            "get_saved_scan_status_only",
            "Lightweight status polling read + serialization (GET /scans/{id}?include_issues=false)",
            poll_status_only,
            iterations=iterations,
            notes=(
                "Repository read with include_issues=False skips the selectinload query entirely; the "
                "response keeps its shape with issues=[]. This mirrors the API polling path measured by "
                "the backend owner (status/summary polling while a scan runs)."
            ),
        )
    )
    operations.append(
        _timed_operation(
            "get_previously_scanned_page_urls_for_domain",
            "Crawl-memory lookup called once per multi-page scan request (all complete scans of the user)",
            lambda: _observe_url_set(
                scan_repository.get_previously_scanned_page_urls_for_domain(
                    session, user_a, "https://user-a.example.com/site-0/"
                )
            ),
            iterations=iterations,
            notes=(
                "Identical scenario to the baseline. The implementation now selects only the URL-bearing "
                "columns (no issue eager-load); compare the measured SQL statement count and ORM rows "
                "loaded against the baseline's 2 SELECTs / 20,200 ORM rows."
            ),
        )
    )
    operations.append(
        _timed_operation(
            "get_scan_queue_state",
            "Worker queue refresh between pages (queued_page_urls + excluded_page_urls)",
            lambda: _observe_queue_state(
                scan_repository.get_scan_queue_state(session, worker_poll_scan_id)
            ),
            iterations=iterations,
            notes="Called by CrawlQueueControl.refresh from the worker loop around every crawled page.",
        )
    )
    operations.append(
        _timed_operation(
            "is_scan_cancel_requested",
            "Worker cancellation poll before/after every crawled page",
            lambda: scan_repository.is_scan_cancel_requested(session, worker_poll_scan_id),
            iterations=iterations,
            notes="Single SELECT of cancel_requested_at/status; called at least once per page.",
        )
    )
    operations.append(
        _timed_operation(
            "claim_next_queued_scan",
            "Worker claims the next queued job",
            claim_action,
            iterations=iterations,
            setup=reset_claimed_scan,
            kind="write",
            notes="SELECT ... WHERE status='queued' ORDER BY started_at LIMIT 1 FOR UPDATE SKIP LOCKED + state UPDATE + refresh.",
        )
    )
    operations.append(
        _timed_operation(
            "recover_stale_running_scans",
            "Worker startup stale-job recovery over 20 stale running rows",
            lambda: scan_repository.recover_stale_running_scans(
                session, stale_after_seconds=300
            ),
            iterations=iterations,
            setup=reset_stale_scans,
            kind="write",
            notes="One SELECT of stale runs + 20 row updates (one batched executemany) + commit.",
        )
    )
    operations.append(
        _timed_operation(
            "complete_running_scan_100_issues",
            "Persist a completed single-page scan result with 100 issues (worker completion path)",
            lambda: _observe_completion(
                scan_repository.complete_running_scan(
                    session,
                    ids["complete_scan_id"],
                    result=complete_result,
                    completed_at=datetime.now(UTC),
                )
            ),
            iterations=iterations,
            setup=reset_complete_scan,
            kind="write",
            notes="_replace_scan_issue_records: delete previous issue rows + insert 100 new rows + update summary counts + commit.",
        )
    )
    operations.append(
        _timed_operation(
            "save_completed_scan_100_issues",
            "Save a completed background single-page scan with 100 issues (in-request save path)",
            lambda: _observe_completed_save(
                scan_repository.save_completed_scan(
                    session,
                    user_id=user_a,
                    requested_url="https://user-a.example.com/background-single",
                    result=complete_result,
                    started_at=datetime.now(UTC) - timedelta(seconds=30),
                    completed_at=datetime.now(UTC),
                )
            ),
            iterations=iterations,
            kind="write",
            notes="INSERT scan run + INSERT 100 issue rows + commit + refresh.",
        )
    )

    progress = _measure_progress_publishes(
        session,
        progress_scan_id,
        progress_issue_sets,
        iterations=iterations,
    )

    by_operation = {operation["operation_id"]: operation for operation in operations}

    def _median_sql(operation_id: str) -> int:
        return int(by_operation[operation_id]["sql_statements"]["median"])

    def _median_orm(operation_id: str) -> int:
        return int(by_operation[operation_id]["orm_objects_loaded"]["median"])

    query_shape_observations = {
        "list_saved_scans_limit_10": {
            "sql_statements": _median_sql("list_saved_scans_limit_10"),
            "orm_rows_loaded": _median_orm("list_saved_scans_limit_10"),
        },
        "list_saved_scans_limit_50": {
            "sql_statements": _median_sql("list_saved_scans_limit_50"),
            "orm_rows_loaded": _median_orm("list_saved_scans_limit_50"),
        },
        "list_saved_scans_status_filter": {
            "sql_statements": _median_sql("list_saved_scans_status_filter"),
            "orm_rows_loaded": _median_orm("list_saved_scans_status_filter"),
        },
        "get_saved_scan_100_issues": {
            "sql_statements": _median_sql("get_saved_scan_100_issues"),
            "orm_rows_loaded": _median_orm("get_saved_scan_100_issues"),
        },
        "get_saved_scan_status_only": {
            "sql_statements": _median_sql("get_saved_scan_status_only"),
            "orm_rows_loaded": _median_orm("get_saved_scan_status_only"),
        },
        "get_previously_scanned_page_urls_for_domain": {
            "sql_statements": _median_sql("get_previously_scanned_page_urls_for_domain"),
            "orm_rows_loaded": _median_orm("get_previously_scanned_page_urls_for_domain"),
        },
        "notes": [
            "Saved-scan list pages are resolved with a constant number of statements: limit=50 issued "
            f"{_median_sql('list_saved_scans_limit_50')} SQL statements and the status-filtered page issued "
            f"{_median_sql('list_saved_scans_status_filter')} (baseline: 45 vs 2; the historical per-row "
            "lazy-load N+1 is replaced by one batched column-only issue-page-URL query).",
            "get_previously_scanned_page_urls_for_domain issued "
            f"{_median_sql('get_previously_scanned_page_urls_for_domain')} SELECT(s) and materialized "
            f"{_median_orm('get_previously_scanned_page_urls_for_domain')} ORM rows (baseline: 2 SELECTs / "
            "20,200 ORM rows). The implementation selects requested_url/final_url/scanned_page_urls only.",
            "get_saved_scan with 100 issues issued "
            f"{_median_sql('get_saved_scan_100_issues')} SELECTs and materialized "
            f"{_median_orm('get_saved_scan_100_issues')} ORM rows via selectinload (unchanged by design: the "
            "full detail response still needs the issues).",
            "get_saved_scan_status_only (include_issues=False) issued "
            f"{_median_sql('get_saved_scan_status_only')} statement(s) and materialized "
            f"{_median_orm('get_saved_scan_status_only')} ORM rows, confirming the polling read never touches "
            "issue rows.",
        ],
    }

    baseline = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "generated_by": "scripts/perf/bench_db.py",
        "started_at_utc": started_at.isoformat(),
        "duration_seconds": round((datetime.now(UTC) - started_at).total_seconds(), 1),
        "machine": machine,
        "database": {
            "engine": SQLITE_URL,
            "production_engine": "postgresql+psycopg (docker compose)",
            "seed": {
                "user_a_complete_scans": COMPLETE_SCANS_PER_USER_A,
                "pages_per_complete_scan": PAGES_PER_COMPLETE_SCAN,
                "issues_per_complete_scan": ISSUES_PER_COMPLETE_SCAN,
                "user_a_queued_scans": QUEUED_SCANS_USER_A,
                "user_a_stale_running_scans": STALE_RUNNING_SCANS_USER_A,
                "user_b_complete_scans": COMPLETE_SCANS_USER_B,
                "user_b_issues_per_scan": ISSUES_PER_COMPLETE_SCAN,
                "row_counts": row_counts,
                "seed_seconds": round(seed_seconds, 2),
                "user_a_preferences_row": True,
            },
            "methodology": {
                "warmup": "one untimed invocation of each operation before the measured loop",
                "iterations": iterations,
                "sql_counting": (
                    "SQLAlchemy before_cursor_execute listener: counts cursor execute() calls "
                    "(executemany batches counted once, flagged separately) and classifies each "
                    "statement as SELECT/INSERT/UPDATE/DELETE; COMMIT is not counted"
                ),
                "dml_row_counting": (
                    "Two independent signals: (1) after_cursor_execute cursor.rowcount for INSERT/DELETE/"
                    "UPDATE (rows affected, portable DBAPI evidence); (2) Session.before_flush counting of "
                    "pending ScanIssueRecord instances inserted/deleted by the ORM unit of work. Progress "
                    "publish amplification is reported from these measured events, not from hardcoded "
                    "arithmetic."
                ),
                "orm_row_counting": (
                    "InstanceEvents.load listeners on the ScanRun and ScanIssueRecord mapped classes: "
                    "counts ORM instances materialized from database rows (lazy and eager loads alike)."
                ),
                "index_caveat": (
                    "Migration f075 adds composite indexes via Alembic, NOT via Base.metadata, so this "
                    "harness's SQLite create_all database does not contain them. Index performance is a "
                    "PostgreSQL artifact and is not measured here; statement/row counts and shapes are the "
                    "portable evidence."
                ),
                "percentile_method": "linear interpolation between closest ranks (numpy/Excel PERCENTILE.INC)",
            },
        },
        "operations": operations,
        "query_shape_observations": query_shape_observations,
        "scoping_checks": scoping,
        "progress_write_amplification": {
            **progress,
            "operation_id": progress["operation_id"],
        },
        "limitations": [
            "SQLite in memory is not PostgreSQL: no network round-trip, no WAL/fsync, no planner statistics, no row locks (FOR UPDATE SKIP LOCKED is ignored by SQLite). Absolute timings are optimistic lower bounds.",
            "Migration f075 composite indexes are migration-only (not in Base.metadata), so this SQLite create_all database has none of them; index speed-ups are a PostgreSQL-only effect and are NOT measured by this harness. Statement/row counts are the portable evidence.",
            "The database runs in the same process: PostgreSQL cost would add protocol serialization and network latency per statement.",
            "Synthetic rows use uniform 100-issue scans; real scans vary widely, and single-page production saves can additionally carry large base64 screenshot data URLs in scan_issues.screenshot_data_url (not seeded here because the multi-page worker publish path does not capture screenshots).",
            "No concurrent users or workers were simulated; contention, lock waits and connection-pool effects are out of scope for this benchmark.",
        ],
    }

    output_path = Path(arguments.json_out).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(baseline, indent=2), encoding="utf-8")
    print(f"\nraw results written to: {output_path}")
    _print_markdown_table(baseline)
    return 0


# ---------------------------------------------------------------------------
# Observation helpers: pull a small, JSON-serializable summary out of results.
# ---------------------------------------------------------------------------


def _observe_list(response) -> dict:
    return {"total": response.total, "items": len(response.items), "limit": response.limit}


def _observe_detail(response) -> dict:
    if response is None:
        return {"found": False, "issues": 0}
    return {"found": True, "issues": len(response.issues), "status": response.status}


def _observe_url_set(urls: set[str]) -> dict:
    return {"urls": len(urls), "hosts": len({url.split("/")[2] for url in urls if "://" in url})}


def _observe_queue_state(state) -> dict:
    queued_urls, excluded_urls = state
    return {"queued": len(queued_urls), "excluded": len(excluded_urls)}


def _observe_completion(scan_run) -> dict:
    return {"status": scan_run.status, "total_issues": scan_run.total_issues}


def _observe_completed_save(scan_run) -> dict:
    return {"id": str(scan_run.id), "status": scan_run.status, "total_issues": scan_run.total_issues}


if __name__ == "__main__":
    raise SystemExit(main())
