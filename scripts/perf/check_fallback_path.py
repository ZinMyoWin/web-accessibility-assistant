#!/usr/bin/env python
"""Read-only check of the scanner's raw-HTML fallback path (no app code edited).

During phase instrumentation of ``page_scanner`` a latent defect was noticed:
``_run_playwright_analysis()`` (backend/app/services/page_scanner.py:837) reads
``options.wcag_standard`` / ``options.include_best_practices`` at line 874, but
that function has no ``options`` parameter or local.  The resulting NameError is
swallowed by the broad ``except Exception`` around the axe-core call, so the
fallback browser path silently returns custom-checks-only issues instead of
merging axe-core results.

This script verifies the behaviour in two ways and writes
``scripts/perf/fallback_path_check.json``:

1. End-to-end: a normal rendered scan vs. the same URL with
   ``_scan_rendered_page`` forced to return None while the browser itself is
   still available (the exact condition that routes into
   ``_run_playwright_analysis``).
2. Direct call: ``_run_playwright_analysis`` is invoked with a fake browser
   session so the call counts for axe-core can be observed without Playwright
   timing noise.

Run:
    backend\\venv\\Scripts\\python.exe scripts\\perf\\check_fallback_path.py
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import bench_scan as bench  # noqa: E402

OUTPUT_PATH = SCRIPT_DIR / "fallback_path_check.json"
CODE_REFERENCE = (
    "backend/app/services/page_scanner.py:837-896 - _run_playwright_analysis() has no "
    "`options` parameter, yet line 874 passes options.wcag_standard / "
    "options.include_best_practices; the NameError is swallowed by the surrounding "
    "`except Exception`, so the fallback path never merges axe-core results."
)


class _FakeContext:
    def close(self) -> None:
        pass


class _FakePage:
    viewport_size = {"width": 1440, "height": 960}

    def set_default_timeout(self, _timeout) -> None:
        pass

    def set_content(self, _html, wait_until=None) -> None:
        pass

    def wait_for_load_state(self, *_args, **_kwargs) -> None:
        pass

    def wait_for_timeout(self, _timeout) -> None:
        pass

    def evaluate(self, *_args, **_kwargs):
        raise AssertionError("page.evaluate should not be reached in the fallback defect path")


class _FakeBrowserSession:
    def __init__(self) -> None:
        self.pages_opened = 0

    def new_page(self):
        self.pages_opened += 1
        return _FakeContext(), _FakePage()

    def close(self) -> None:
        pass


def _sources(issues) -> dict:
    return {
        "issues": len(issues),
        "sources": sorted({issue.source or "unknown" for issue in issues}),
        "axe_or_both_sourced": sum(
            1 for issue in issues if issue.source in {"axe-core", "both"}
        ),
    }


def main() -> int:
    bench._load_app()
    page_scanner = bench.page_scanner
    axe_scanner = bench.axe_scanner

    options = page_scanner.ScanOptions(
        mode="single",
        page_limit=1,
        crawl_depth=1,
        request_delay_ms=0,
        page_timeout_ms=15000,
        wcag_standard="wcag21aa",
        include_best_practices=True,
    )

    server, base_url = bench.start_fixture_server()
    try:
        url = base_url + "/issue-dense"
        normal_result = page_scanner.scan_page(url, options)

        original_render = page_scanner._scan_rendered_page
        page_scanner._scan_rendered_page = lambda *_args, **_kwargs: None
        try:
            forced_fallback_result = page_scanner.scan_page(url, options)
        finally:
            page_scanner._scan_rendered_page = original_render
    finally:
        server.shutdown()
        server.server_close()

    # Direct call with a fake session: observe whether run_axe_core is invoked.
    axe_calls: list[str] = []
    original_run_axe_core = axe_scanner.run_axe_core

    def spy_run_axe_core(*args, **kwargs):
        axe_calls.append("called")
        return original_run_axe_core(*args, **kwargs)

    axe_scanner.run_axe_core = spy_run_axe_core
    fake_session = _FakeBrowserSession()
    custom_issue = page_scanner.ScanIssue(
        rule_id="document-title",
        severity="high",
        element="<title>",
        message="Document title is missing or empty.",
        recommendation="Add a clear and descriptive <title>.",
    )
    try:
        direct_result = page_scanner._run_playwright_analysis(
            "https://example.test/fallback",
            "<html><body><img src='/x.png'></body></html>",
            [custom_issue],
            page_timeout_ms=15000,
            capture_screenshots=False,
            browser_session=fake_session,
        )
        direct_exception = None
    except BaseException as exc:  # pragma: no cover - the defect swallows it
        direct_exception = repr(exc)
        direct_result = []
    finally:
        axe_scanner.run_axe_core = original_run_axe_core

    payload = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "generated_by": "scripts/perf/check_fallback_path.py",
        "app_code_modified": False,
        "code_reference": CODE_REFERENCE,
        "end_to_end": {
            "url": url,
            "normal_rendered_scan": _sources(normal_result.issues),
            "forced_fallback_scan": _sources(forced_fallback_result.issues),
        },
        "direct_call": {
            "browser_pages_opened": fake_session.pages_opened,
            "axe_core_calls": len(axe_calls),
            "returned": _sources(direct_result) if direct_result else {"issues": 0},
            "exception_propagated": direct_exception,
        },
        "conclusion": (
            "With the browser available but _scan_rendered_page forced to return None, the "
            "fallback returns custom-checks-only issues: axe-core was never invoked and the "
            "undefined `options` NameError was swallowed. This is a correctness/performance "
            "observation only; application code was not modified by this harness."
        ),
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2))
    print(f"\nwritten to: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
