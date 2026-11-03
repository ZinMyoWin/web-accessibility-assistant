#!/usr/bin/env python
"""Reproducible scanner-level performance baseline for the AccessAudit scanner.

The harness serves deterministic fixture pages from a local HTTP server
(127.0.0.1, ephemeral port) and calls
``app.services.page_scanner.scan_page`` directly (no FastAPI, no database, no
authentication).  Each scenario is measured with one explicit warm-up run
followed by N measured runs; raw per-iteration samples and per-phase timings are
written to ``scripts/perf/baseline.json``.

Run it from anywhere with the backend virtualenv interpreter::

    backend\\venv\\Scripts\\python.exe scripts\\perf\\bench_scan.py
    backend\\venv\\Scripts\\python.exe scripts\\perf\\bench_scan.py --quick
    backend\\venv\\Scripts\\python.exe scripts\\perf\\bench_scan.py --only single_clean
    backend\\venv\\Scripts\\python.exe scripts\\perf\\bench_scan.py --skip-cold

Measurement approach
--------------------
* Nothing in ``app/`` is edited.  Phase instrumentation monkeypatches module
  attributes at runtime (see ``_install_instrumentation``) and restores them by
  keeping the originals; the only permanent artefact is this script.
* A *scenario iteration* is one full ``scan_page`` job, i.e. a fresh
  ``BrowserSession`` is created, Chromium is launched, the job runs and the
  browser is closed - exactly the production per-job lifecycle.
* Phase times are accumulated with ``time.perf_counter()`` inside wrappers.
  Top-level phases are non-overlapping; nested phases (prefixed ``nested:``)
  are reported separately and must not be added to the top-level total.
* ``--cold`` (default on) spawns a fresh Python subprocess before any other
  browser work and times its scan #1 / #2 / #3.  This captures per-process
  effects (Playwright import + driver start, Chromium launch, axe-core CDN
  download) without contaminating the warm scenario medians.
"""

from __future__ import annotations

import argparse
import base64
import ctypes
import importlib.metadata
import inspect
import json
import os
import platform
import statistics
import subprocess
import sys
import threading
import time
from collections import Counter
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_JSON_PATH = SCRIPT_DIR / "baseline.json"

COLD_RESULT_PREFIX = "COLD_RESULT_JSON:"

# ---------------------------------------------------------------------------
# Deterministic fixtures
# ---------------------------------------------------------------------------
# The issue-dense and JS-rendered fixtures are HTML-equivalent replicas of the
# deterministic test routes in backend/app/main.py (GET /test/page-bad and
# GET /test/page-js-rendered) so scanner results here are comparable to the
# documented smoke-test pages.  The multi-page fixture is a five-page linked
# site with known, fixed violations.

_CLEAN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Clean accessibility fixture page</title>
</head>
<body>
  <main>
    <h1>Clean accessibility fixture</h1>
    <p>This page is deliberately accessible and should produce no violations.</p>
    <p><a href="/clean">Read the documentation</a></p>
    <img src="/img/logo.png" alt="AccessAudit logo">
  </main>
</body>
</html>
"""

# Equivalent of backend GET /test/page-bad (missing lang/title, missing alt,
# vague link text, duplicated id, skipped heading level, plus axe-only issues:
# low contrast, empty button, unlabelled input/select, unlandmarked content).
_ISSUE_DENSE_HTML = """<!DOCTYPE html>
<html>
  <body>
    <a href="/more">click here</a>
    <img src="/image.png">
    <h1>Main heading</h1>
    <h3>Skipped heading level</h3>
    <div id="duplicate-id">First block</div>
    <div id="duplicate-id">Second block</div>

    <p style="color: #aaa; background-color: #fff;">Low contrast text</p>
    <button></button>
    <form>
      <input type="text">
      <select><option>Pick one</option></select>
    </form>
    <marquee>Scrolling text</marquee>
    <table>
      <tr><td>Data without headers</td><td>Another cell</td></tr>
    </table>
  </body>
</html>
"""

# Equivalent of backend GET /test/page-js-rendered: violations appear only
# after the inline setTimeout(150ms) mutates the DOM.
_SPA_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>JavaScript rendered accessibility test</title>
</head>
<body>
  <h1>JavaScript rendered test page</h1>
  <div id="app">Initial static content is accessible.</div>
  <script>
    window.setTimeout(() => {
      const app = document.getElementById("app");
      app.innerHTML = `
        <section>
          <h2>Rendered content</h2>
          <img src="/dynamic-product.png">
          <a href="/dynamic-details">click here</a>
          <button></button>
        </section>
      `;
    }, 150);
  </script>
</body>
</html>
"""

_MULTI_ROOT_HTML = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi fixture root</title></head>
<body>
  <main>
    <h1>Multi-page fixture root</h1>
    <p>Root page with a deterministic internal link set.</p>
    <img src="/img/logo.png">
    <ul>
      <li><a href="/multi/page-2">Read the page two documentation</a></li>
      <li><a href="/multi/page-3">Read the page three documentation</a></li>
      <li><a href="/multi/page-4">Read the page four documentation</a></li>
      <li><a href="/multi/page-5">Read the page five documentation</a></li>
    </ul>
  </main>
</body>
</html>
"""

_MULTI_PAGE_2_HTML = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi fixture page two</title></head>
<body>
  <main>
    <h1>Multi fixture page two</h1>
    <p>One image without alt text and one vague link.</p>
    <img src="/img/logo.png">
    <p><a href="/multi/page-2">click here</a></p>
  </main>
</body>
</html>
"""

_MULTI_PAGE_3_HTML = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi fixture page three</title></head>
<body>
  <main>
    <h1>Multi fixture page three</h1>
    <p>One image without alt text and duplicated ids.</p>
    <img src="/img/logo.png">
    <div id="dup-block">First block</div>
    <div id="dup-block">Second block</div>
  </main>
</body>
</html>
"""

_MULTI_PAGE_4_HTML = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi fixture page four</title></head>
<body>
  <main>
    <h1>Multi fixture page four</h1>
    <p>One image without alt text and a skipped heading level.</p>
    <img src="/img/logo.png">
    <h3>Skipped heading level</h3>
  </main>
</body>
</html>
"""

_MULTI_PAGE_5_HTML = """<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Multi fixture page five</title></head>
<body>
  <main>
    <h1>Multi fixture page five</h1>
    <p>One image without alt text and one empty button.</p>
    <img src="/img/logo.png">
    <button></button>
  </main>
</body>
</html>
"""

# 1x1 transparent PNG so fixture <img> subresources resolve deterministically.
_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)

FIXTURES: dict[str, str] = {
    "/": _CLEAN_HTML,
    "/clean": _CLEAN_HTML,
    "/issue-dense": _ISSUE_DENSE_HTML,
    "/spa": _SPA_HTML,
    "/multi/": _MULTI_ROOT_HTML,
    "/multi": _MULTI_ROOT_HTML,
    "/multi/page-2": _MULTI_PAGE_2_HTML,
    "/multi/page-3": _MULTI_PAGE_3_HTML,
    "/multi/page-4": _MULTI_PAGE_4_HTML,
    "/multi/page-5": _MULTI_PAGE_5_HTML,
}

BINARY_FIXTURES: dict[str, tuple[bytes, str]] = {
    "/img/logo.png": (_PNG_BYTES, "image/png"),
    "/image.png": (_PNG_BYTES, "image/png"),
    "/dynamic-product.png": (_PNG_BYTES, "image/png"),
}

FIXTURE_DESCRIPTIONS = {
    "/clean": "clean small page (production single-page path, 0 expected violations)",
    "/issue-dense": "issue-dense page equivalent to GET /test/page-bad (~10-15 violations)",
    "/spa": "JS-rendered SPA equivalent to GET /test/page-js-rendered (violations injected after 150ms)",
    "/multi/": "multi-page fixture root linking 5 pages with fixed known violations",
}


class _FixtureHandler(BaseHTTPRequestHandler):
    server_version = "AccessAuditPerfFixture/1.0"
    protocol_version = "HTTP/1.0"

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = urlsplit(self.path).path
        if path == "/robots.txt":
            body = b"User-agent: *\nAllow: /\n"
            content_type = "text/plain; charset=utf-8"
        elif path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        elif path in BINARY_FIXTURES:
            body, content_type = BINARY_FIXTURES[path]
        else:
            html = FIXTURES.get(path)
            if html is None:
                self.send_error(404, "Unknown fixture path")
                return
            body = html.encode("utf-8")
            content_type = "text/html; charset=utf-8"

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args) -> None:
        """Silence per-request logging so stderr stays clean."""


def start_fixture_server() -> tuple[ThreadingHTTPServer, str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FixtureHandler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, name="fixture-server", daemon=True)
    thread.start()
    host, port = server.server_address[0], server.server_address[1]
    base_url = f"http://{host}:{port}"
    _wait_for_server(base_url + "/clean", timeout_seconds=10.0)
    return server, base_url


def _wait_for_server(url: str, timeout_seconds: float) -> None:
    import urllib.request

    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.02)
    raise RuntimeError(f"fixture server did not become ready: {url}")


# ---------------------------------------------------------------------------
# Runtime imports of the application scanner (never imported before this point)
# ---------------------------------------------------------------------------

page_scanner = None  # set by _load_app()
axe_scanner = None  # set by _load_app()


def _ensure_backend_on_path() -> None:
    backend = str(BACKEND_DIR)
    if backend not in sys.path:
        sys.path.insert(0, backend)


def _load_app() -> float:
    """Import the scanner modules, returning the import duration in seconds."""
    global page_scanner, axe_scanner

    _ensure_backend_on_path()
    started = time.perf_counter()
    from app.services import axe_scanner as loaded_axe_scanner
    from app.services import page_scanner as loaded_page_scanner

    duration = time.perf_counter() - started
    page_scanner = loaded_page_scanner
    axe_scanner = loaded_axe_scanner
    return duration


# ---------------------------------------------------------------------------
# Phase instrumentation (monkeypatch, no app edits)
# ---------------------------------------------------------------------------

TOP_LEVEL_PHASES = [
    "browser_setup",
    "goto",
    "render_wait",
    "request_delay",
    "page_content",
    "parse_html",
    "build_issues",
    "axe_core",
    "merge_issues",
    "screenshots_total",
    "fetch_html",
    "prepare_html",
    "static_wait",
    "context_close",
    "browser_close",
]

NESTED_PHASES = [
    "browser_start",  # inside browser_setup when the browser is first needed
    "context_create",  # inside browser_setup per page/context
    "networkidle_wait",  # inside render_wait: page.wait_for_load_state("networkidle")
    "fixed_settle_wait",  # inside render_wait: page.wait_for_timeout(250-600ms)
    "axe_script_fetch",  # inside axe_core (CDN download only on cold cache)
    "screenshot_capture",  # inside screenshots_total
    "screenshot_store",  # inside screenshots_total
]

PHASE_NOTES = {
    "browser_setup": "BrowserSession.new_page(): lazy Playwright/Chromium start on first page + new browser context + new page",
    "goto": "page.goto(url, wait_until='domcontentloaded')",
    "render_wait": "_wait_for_rendered_content(): networkidle wait (<=3s) + fixed 250-600ms settle",
    "request_delay": "sleep(request_delay_ms/1000) between crawled pages",
    "page_content": "page.content() DOM serialization",
    "parse_html": "_parse_page_html(): custom HTML parser pass",
    "build_issues": "_build_issues(): custom rule checks",
    "axe_core": "axe_scanner.run_axe_core(): inject axe-core script + axe.run() in the page",
    "merge_issues": "axe_scanner.merge_issues(): custom/axe deduplication",
    "screenshots_total": "_attach_issue_screenshots(): capture and store one screenshot per unique selector",
    "fetch_html": "_fetch_page_html(): urllib raw-HTML fetch (fallback / multi when browser analysis is off)",
    "prepare_html": "_prepare_html_for_screenshot(): script stripping / base-tag injection (fallback browser path)",
    "static_wait": "_wait_for_static_content() (fallback browser path)",
    "context_close": "browser context.close()",
    "browser_close": "BrowserSession.close(): browser.close() + playwright.stop()",
    "nested:browser_start": "nested in browser_setup: sync_playwright().start() + chromium.launch()",
    "nested:context_create": "nested in browser_setup: browser.new_context(viewport, locale, UA)",
    "nested:networkidle_wait": "nested in render_wait: page.wait_for_load_state('networkidle', <=3000ms)",
    "nested:fixed_settle_wait": "nested in render_wait: page.wait_for_timeout(page_timeout_ms//40 clamped to 250-600ms)",
    "nested:axe_script_fetch": "nested in axe_core: axe-core 4.10.2 CDN download (first call per process only)",
    "nested:screenshot_capture": "nested in screenshots_total: locator scroll/bounding-box + page.screenshot",
    "nested:screenshot_store": "nested in screenshots_total: Cloudinary upload or base64 data-URL conversion",
}

_REC = None
_CHROMIUM_VERSION = None
_AXE_SCRIPT_BYTES = None


class PhaseRecorder:
    """Accumulates per-iteration phase seconds and call counts."""

    def __init__(self) -> None:
        self.phases: dict[str, float] = {}
        self.calls: dict[str, int] = {}
        self.active = False

    def start(self) -> None:
        self.phases = {}
        self.calls = {}
        self.active = True

    def add(self, name: str, seconds: float) -> None:
        if not self.active:
            return
        self.phases[name] = self.phases.get(name, 0.0) + seconds
        self.calls[name] = self.calls.get(name, 0) + 1

    def stop(self) -> dict[str, dict[str, float] | dict[str, int]]:
        self.active = False
        return {
            "phases_s": {name: value for name, value in self.phases.items()},
            "calls": {name: count for name, count in self.calls.items()},
        }


class _PageProxy:
    """Transparent page wrapper that times goto/content and wait primitives."""

    def __init__(self, page) -> None:
        self._page = page

    def goto(self, *args, **kwargs):
        started = time.perf_counter()
        try:
            return self._page.goto(*args, **kwargs)
        finally:
            _REC.add("goto", time.perf_counter() - started)

    def content(self, *args, **kwargs):
        started = time.perf_counter()
        try:
            return self._page.content(*args, **kwargs)
        finally:
            _REC.add("page_content", time.perf_counter() - started)

    def wait_for_load_state(self, *args, **kwargs):
        started = time.perf_counter()
        try:
            return self._page.wait_for_load_state(*args, **kwargs)
        finally:
            _REC.add("nested:networkidle_wait", time.perf_counter() - started)

    def wait_for_timeout(self, *args, **kwargs):
        started = time.perf_counter()
        try:
            return self._page.wait_for_timeout(*args, **kwargs)
        finally:
            _REC.add("nested:fixed_settle_wait", time.perf_counter() - started)

    def __getattr__(self, name: str):
        return getattr(self._page, name)


class _ContextProxy:
    """Transparent browser-context wrapper that times close()."""

    def __init__(self, context) -> None:
        self._context = context

    def close(self, *args, **kwargs):
        started = time.perf_counter()
        try:
            return self._context.close(*args, **kwargs)
        finally:
            _REC.add("context_close", time.perf_counter() - started)

    def __getattr__(self, name: str):
        return getattr(self._context, name)


def _install_instrumentation() -> ExitStack:
    """Monkeypatch scanner module attributes with timing wrappers."""
    assert page_scanner is not None and axe_scanner is not None
    stack = ExitStack()

    def patch_attr(module, name: str, phase: str, *, nested: bool = False) -> None:
        original = getattr(module, name)
        record_name = f"nested:{phase}" if nested else phase

        def wrapper(*args, **kwargs):
            started = time.perf_counter()
            try:
                return original(*args, **kwargs)
            finally:
                _REC.add(record_name, time.perf_counter() - started)

        setattr(module, name, wrapper)
        stack.callback(setattr, module, name, original)

    # page_scanner module-level functions.
    patch_attr(page_scanner, "_wait_for_rendered_content", "render_wait")
    patch_attr(page_scanner, "_wait_for_static_content", "static_wait")
    patch_attr(page_scanner, "_fetch_page_html", "fetch_html")
    patch_attr(page_scanner, "_parse_page_html", "parse_html")
    patch_attr(page_scanner, "_build_issues", "build_issues")
    patch_attr(page_scanner, "_prepare_html_for_screenshot", "prepare_html")
    patch_attr(page_scanner, "_attach_issue_screenshots", "screenshots_total")
    patch_attr(page_scanner, "_capture_screenshot_bytes", "screenshot_capture", nested=True)
    patch_attr(page_scanner, "_store_screenshots_concurrently", "screenshot_store", nested=True)
    # page_scanner imports `sleep` directly into its module namespace; patching
    # that attribute captures the artificial inter-page crawl delay.
    patch_attr(page_scanner, "sleep", "request_delay")

    # axe_scanner functions are imported *inside* page_scanner functions at call
    # time, so patching the axe_scanner module attributes is effective.
    patch_attr(axe_scanner, "run_axe_core", "axe_core")
    patch_attr(axe_scanner, "merge_issues", "merge_issues")

    original_get_axe_script = axe_scanner._get_axe_script

    def timed_get_axe_script():
        global _AXE_SCRIPT_BYTES
        started = time.perf_counter()
        try:
            script = original_get_axe_script()
        finally:
            _REC.add("nested:axe_script_fetch", time.perf_counter() - started)
        if _AXE_SCRIPT_BYTES is None and script:
            _AXE_SCRIPT_BYTES = len(script)
        return script

    axe_scanner._get_axe_script = timed_get_axe_script
    stack.callback(setattr, axe_scanner, "_get_axe_script", original_get_axe_script)

    # BrowserSession lifecycle.
    original_new_page = page_scanner.BrowserSession.new_page
    original_ensure_browser = page_scanner.BrowserSession._ensure_browser
    original_close = page_scanner.BrowserSession.close
    original_new_context = page_scanner._new_browser_context

    def timed_ensure_browser(self):
        global _CHROMIUM_VERSION
        started = time.perf_counter()
        try:
            browser = original_ensure_browser(self)
        finally:
            _REC.add("nested:browser_start", time.perf_counter() - started)
        if browser is not None and _CHROMIUM_VERSION is None:
            try:
                _CHROMIUM_VERSION = browser.version
            except Exception:  # pragma: no cover - browser.version is stable
                pass
        return browser

    def timed_new_context(browser):
        started = time.perf_counter()
        try:
            return original_new_context(browser)
        finally:
            _REC.add("nested:context_create", time.perf_counter() - started)

    def timed_new_page(self):
        started = time.perf_counter()
        try:
            result = original_new_page(self)
        finally:
            _REC.add("browser_setup", time.perf_counter() - started)
        if result is None:
            return None
        context, page = result
        return _ContextProxy(context), _PageProxy(page)

    def timed_close(self):
        started = time.perf_counter()
        try:
            return original_close(self)
        finally:
            _REC.add("browser_close", time.perf_counter() - started)

    page_scanner.BrowserSession._ensure_browser = timed_ensure_browser
    page_scanner.BrowserSession.new_page = timed_new_page
    page_scanner.BrowserSession.close = timed_close
    page_scanner._new_browser_context = timed_new_context
    stack.callback(setattr, page_scanner.BrowserSession, "_ensure_browser", original_ensure_browser)
    stack.callback(setattr, page_scanner.BrowserSession, "new_page", original_new_page)
    stack.callback(setattr, page_scanner.BrowserSession, "close", original_close)
    stack.callback(setattr, page_scanner, "_new_browser_context", original_new_context)

    return stack


# ---------------------------------------------------------------------------
# Scenario definitions
# ---------------------------------------------------------------------------

SINGLE_OPTIONS = {
    "mode": "single",
    "page_limit": 1,
    "crawl_depth": 1,
    "request_delay_ms": 0,
    "page_timeout_ms": 15000,
    "wcag_standard": "wcag21aa",
    "include_best_practices": True,
}

MULTI_OPTIONS = {
    "mode": "multi",
    "page_limit": 5,
    "crawl_depth": 2,
    "request_delay_ms": 0,
    "page_timeout_ms": 15000,
    "wcag_standard": "wcag21aa",
    "include_best_practices": True,
    "run_browser_analysis_for_multi": True,
    "respect_robots_txt": True,
    "skip_previously_scanned_pages": False,
}


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    description: str
    path: str
    options: dict
    special: str | None = None
    iterations: int = 7
    # "per_call": each iteration is a scan_page() call that creates and closes its
    #             own BrowserSession (the baseline production shape).
    # "worker":  one BrowserSession is created once and reused across every
    #             iteration (the post-optimization production worker shape).
    session_mode: str = "per_call"


SCENARIOS = [
    Scenario(
        "single_clean",
        "Single page, clean fixture (production single-page path with screenshots)",
        "/clean",
        SINGLE_OPTIONS,
    ),
    Scenario(
        "single_issue_dense_screenshots",
        "Single page, issue-dense fixture WITH screenshot capture (production single-page path)",
        "/issue-dense",
        SINGLE_OPTIONS,
    ),
    Scenario(
        "single_issue_dense_no_screenshots",
        "Single page, issue-dense fixture with _attach_issue_screenshots patched to a no-op",
        "/issue-dense",
        SINGLE_OPTIONS,
        special="no_screenshots",
    ),
    Scenario(
        "single_js_rendered_spa",
        "Single page, JS-rendered SPA fixture (violations injected via setTimeout)",
        "/spa",
        SINGLE_OPTIONS,
    ),
    Scenario(
        "multi_5_pages_delay_0",
        "Multi-page crawl, 5 pages, crawl_depth=2, request_delay_ms=0 (production worker path: browser analysis per page)",
        "/multi/",
        {**MULTI_OPTIONS, "request_delay_ms": 0},
        iterations=5,
    ),
    Scenario(
        "multi_5_pages_delay_250",
        "Multi-page crawl, 5 pages, crawl_depth=2, request_delay_ms=250 (production default delay)",
        "/multi/",
        {**MULTI_OPTIONS, "request_delay_ms": 250},
        iterations=5,
    ),
    Scenario(
        "single_raw_html_fallback",
        "Single page, issue-dense fixture with BrowserSession._ensure_browser patched to return None (raw-HTML custom-checks-only path)",
        "/issue-dense",
        SINGLE_OPTIONS,
        special="browser_unavailable",
    ),
    Scenario(
        "single_render_failure_fallback",
        "Single page, issue-dense fixture with _scan_rendered_page forced to return None while the browser is available "
        "(the raw-HTML + browser-analysis fallback path affected by the fixed _run_playwright_analysis NameError)",
        "/issue-dense",
        SINGLE_OPTIONS,
        special="render_failure",
    ),
]

# Worker-mode scenarios: one BrowserSession is reused across every measured scan,
# which is how the optimized scan worker runs jobs. These are additive to the
# per-call scenarios above; the same fixtures/options are used so only the
# session lifecycle differs.
WORKER_SCENARIOS = [
    Scenario(
        "worker_single_clean",
        "Worker-mode: clean fixture, one reused BrowserSession across measured scans (production worker shape)",
        "/clean",
        SINGLE_OPTIONS,
        session_mode="worker",
    ),
    Scenario(
        "worker_single_issue_dense_screenshots",
        "Worker-mode: issue-dense fixture WITH screenshots, one reused BrowserSession across measured scans",
        "/issue-dense",
        SINGLE_OPTIONS,
        session_mode="worker",
    ),
    Scenario(
        "worker_multi_5_pages_delay_0",
        "Worker-mode: 5-page crawl (delay 0), one reused BrowserSession across measured scans",
        "/multi/",
        {**MULTI_OPTIONS, "request_delay_ms": 0},
        iterations=5,
        session_mode="worker",
    ),
    Scenario(
        "worker_multi_5_pages_delay_250",
        "Worker-mode: 5-page crawl (delay 250 ms), one reused BrowserSession across measured scans",
        "/multi/",
        {**MULTI_OPTIONS, "request_delay_ms": 250},
        iterations=5,
        session_mode="worker",
    ),
]

ALL_SCENARIOS = [*SCENARIOS, *WORKER_SCENARIOS]

SPECIAL_PATCHES = {
    "no_screenshots": lambda: _patch_attr_ctx(page_scanner, "_attach_issue_screenshots", lambda page, issues: None),
    "browser_unavailable": lambda: _patch_attr_ctx(
        page_scanner.BrowserSession, "_ensure_browser", lambda self: None
    ),
    "render_failure": lambda: _patch_attr_ctx(
        page_scanner, "_scan_rendered_page", lambda *_args, **_kwargs: None
    ),
}


@contextmanager
def _patch_attr_ctx(target, name: str, replacement):
    original = getattr(target, name)
    setattr(target, name, replacement)
    try:
        yield
    finally:
        setattr(target, name, original)


# ---------------------------------------------------------------------------
# Measurement core
# ---------------------------------------------------------------------------

REQUIRED_ENV = {
    "python": sys.version,
    "python_executable": sys.executable,
}


def _percentile(sorted_values: list[float], percent: float) -> float | None:
    """Linear-interpolation percentile (numpy default / Excel PERCENTILE.INC)."""
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
    median = statistics.median(samples_ms)
    return {
        "count": len(samples_ms),
        "median_ms": round(median, 3),
        "min_ms": round(ordered[0], 3),
        "max_ms": round(ordered[-1], 3),
        "p90_ms": round(_percentile(ordered, 90), 3),
        "mean_ms": round(statistics.fmean(samples_ms), 3),
        "stdev_ms": round(stdev, 3),
        "cv_pct": round((stdev / statistics.fmean(samples_ms)) * 100.0, 2)
        if statistics.fmean(samples_ms)
        else 0.0,
        "samples_ms": [round(value, 3) for value in samples_ms],
    }


def _measure_call(call) -> dict:
    """Run one scan call under instrumentation and return a raw sample."""
    _REC.start()
    started = time.perf_counter()
    try:
        result = call()
    except BaseException:
        _REC.stop()
        raise
    duration = time.perf_counter() - started
    snapshot = _REC.stop()

    rule_counts = Counter(issue.rule_id for issue in result.issues)
    severity_counts = Counter(issue.severity for issue in result.issues)
    source_counts = Counter(issue.source or "unknown" for issue in result.issues)
    screenshots = sum(1 for issue in result.issues if issue.screenshot_data_url)

    return {
        "duration_ms": round(duration * 1000.0, 3),
        "phases_s": {name: round(value, 7) for name, value in snapshot["phases_s"].items()},
        "calls": snapshot["calls"],
        "issues": len(result.issues),
        "pages_scanned": result.pages_scanned,
        "pages_skipped": result.pages_skipped,
        "scanned_page_urls": list(result.scanned_page_urls),
        "rule_counts": dict(sorted(rule_counts.items())),
        "severity_counts": dict(sorted(severity_counts.items())),
        "source_counts": dict(sorted(source_counts.items())),
        "issues_with_screenshots": screenshots,
        "summary": result.summary.model_dump(),
    }


def _measure_once(url: str, options, *, browser_session=None) -> dict:
    """Run one scan_page job under instrumentation and return a raw sample."""
    if browser_session is None:
        return _measure_call(lambda: page_scanner.scan_page(url, options))
    return _measure_call(
        lambda: page_scanner.scan_page(url, options, browser_session=browser_session)
    )


def _run_worker_mode_iterations(scenario: Scenario, url: str, options, iterations: int):
    """Measure scans with one BrowserSession reused across every iteration.

    This is the production shape of the optimized scan worker: a single
    long-lived Playwright driver/Chromium is reused for successive scan jobs, so
    the per-job browser lifecycle disappears from the measured scan.
    """
    signature = inspect.signature(page_scanner.scan_page)
    native = "browser_session" in signature.parameters
    worker_session = page_scanner.BrowserSession()

    with ExitStack() as restore_stack:
        if native:
            strategy = "native_session_injection"

            def call():
                return page_scanner.scan_page(url, options, browser_session=worker_session)

        else:
            # Baseline code has no injection parameter: emulate the worker by
            # providing the same BrowserSession instance from the module-level
            # factory and suppressing the per-call close(). Page work and the
            # scanner logic are otherwise unchanged.
            strategy = "emulated_shared_session_factory"
            module = page_scanner
            original_factory = module.BrowserSession
            original_close = worker_session.close
            worker_session.close = lambda: None  # type: ignore[method-assign]

            def factory():
                return worker_session

            module.BrowserSession = factory  # type: ignore[assignment]
            restore_stack.callback(setattr, module, "BrowserSession", original_factory)

            def call():
                return page_scanner.scan_page(url, options)

        warmup = _measure_call(call)
        samples = [_measure_call(call) for _ in range(iterations)]

    # Measure the one-time session teardown outside the per-scan samples.
    started = time.perf_counter()
    if strategy == "native_session_injection":
        worker_session.close()
    else:
        original_close()
    teardown_ms = (time.perf_counter() - started) * 1000.0

    session_info = {
        "session_mode": "worker",
        "strategy": strategy,
        "native_injection_supported": native,
        "reused_across_scans": True,
        "session_teardown_ms": round(teardown_ms, 3),
        "session_warmup_note": (
            "the warm-up scan creates the browser once; its browser_start time is "
            "recorded in the warm-up sample, not in the measured samples"
        ),
    }
    return warmup, samples, session_info


def _run_scenario(scenario: Scenario, base_url: str, iterations: int) -> dict:
    options = page_scanner.ScanOptions(**scenario.options)
    url = base_url + scenario.path

    with ExitStack() as special_stack:
        if scenario.special:
            special_stack.enter_context(SPECIAL_PATCHES[scenario.special]())

        if scenario.session_mode == "worker":
            warmup, samples, session_info = _run_worker_mode_iterations(
                scenario, url, options, iterations
            )
            return _build_scenario_result(
                scenario, url, iterations, warmup, samples, session_info=session_info
            )

        warmup = _measure_once(url, options)
        samples = [_measure_once(url, options) for _ in range(iterations)]

    return _build_scenario_result(scenario, url, iterations, warmup, samples)


def _build_scenario_result(
    scenario: Scenario,
    url: str,
    iterations: int,
    warmup: dict,
    samples: list[dict],
    *,
    session_info: dict | None = None,
) -> dict:
    durations = [sample["duration_ms"] for sample in samples]
    stats = _describe_ms(durations)

    phase_totals: dict[str, float] = {}
    phase_calls: dict[str, int] = {}
    for sample in samples:
        for name, seconds in sample["phases_s"].items():
            phase_totals[name] = phase_totals.get(name, 0.0) + seconds
        for name, count in sample["calls"].items():
            phase_calls[name] = phase_calls.get(name, 0) + count

    total_seconds = sum(durations) / 1000.0
    phases: dict[str, dict] = {}
    for name in sorted(phase_totals):
        seconds = phase_totals[name]
        calls = phase_calls.get(name, 0)
        phases[name] = {
            "total_s": round(seconds, 4),
            "per_scan_ms": round((seconds / len(samples)) * 1000.0, 3),
            "share_of_total_pct": round((seconds / total_seconds) * 100.0, 2) if total_seconds else None,
            "calls_total": calls,
            "calls_per_scan": round(calls / len(samples), 2),
        }

    issue_counts = [sample["issues"] for sample in samples]
    page_counts = [sample["pages_scanned"] for sample in samples]
    median_issues = statistics.median(issue_counts)
    median_pages = statistics.median(page_counts)

    measured_phase_seconds = sum(
        phase_totals.get(name, 0.0) for name in TOP_LEVEL_PHASES
    )
    unattributed_seconds = total_seconds - measured_phase_seconds
    unattributed_share_pct = (
        (unattributed_seconds / total_seconds) * 100.0 if total_seconds else None
    )

    return {
        "scenario_id": scenario.scenario_id,
        "description": scenario.description,
        "url": url,
        "fixture_path": scenario.path,
        "special": scenario.special,
        "session_mode": scenario.session_mode,
        "worker_session": session_info,
        "scan_options": dict(scenario.options),
        "iterations_measured": iterations,
        "warmups": 1,
        "warmup": warmup,
        "iterations": samples,
        "aggregates": {
            "duration_ms": stats,
            "issue_counts": {
                "median": median_issues,
                "min": min(issue_counts),
                "max": max(issue_counts),
                "samples": issue_counts,
            },
            "pages_scanned": {
                "median": median_pages,
                "samples": page_counts,
            },
            "ms_per_page": round(stats["median_ms"] / median_pages, 2) if median_pages else None,
            "ms_per_issue": round(stats["median_ms"] / median_issues, 2) if median_issues else None,
            "screenshots_per_scan_median": statistics.median(
                [sample["issues_with_screenshots"] for sample in samples]
            ),
            "phase_share": {
                "measured_total_s": round(total_seconds, 4),
                "sum_of_top_level_phases_s": round(measured_phase_seconds, 4),
                "unattributed_s": round(unattributed_seconds, 4),
                "unattributed_share_pct": round(unattributed_share_pct, 2)
                if unattributed_share_pct is not None
                else None,
                "attribution_warning": (
                    unattributed_share_pct is None or abs(unattributed_share_pct) > 5.0
                ),
            },
            "phases": phases,
        },
        "observed_rule_ids": sorted(
            {rule_id for sample in samples for rule_id in sample["rule_counts"]}
        ),
        "observed_severities": sorted(
            {severity for sample in samples for severity in sample["severity_counts"]}
        ),
        "median_issue_counts_by_rule": _median_rule_counts(samples),
    }


def _median_rule_counts(samples: list[dict]) -> dict[str, float]:
    rule_ids: set[str] = set()
    for sample in samples:
        rule_ids.update(sample["rule_counts"])
    medians: dict[str, float] = {}
    for rule_id in sorted(rule_ids):
        counts = [sample["rule_counts"].get(rule_id, 0) for sample in samples]
        medians[rule_id] = statistics.median(counts)
    return medians


# ---------------------------------------------------------------------------
# Cold-process and axe-cache measurements
# ---------------------------------------------------------------------------


def _run_cold_child(base_url: str, iterations: int) -> dict:
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--cold-inner",
        "--base-url",
        base_url,
        "--iterations",
        str(iterations),
    ]
    print(f"  spawning fresh process for cold scans: {iterations} scans ...", flush=True)
    process = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=600,
        cwd=str(REPO_ROOT),
    )
    if process.returncode != 0:
        raise RuntimeError(
            "cold subprocess failed with exit code "
            f"{process.returncode}\nstdout tail:\n{process.stdout[-2000:]}\n"
            f"stderr tail:\n{process.stderr[-4000:]}"
        )

    payload = None
    for line in reversed(process.stdout.splitlines()):
        if line.startswith(COLD_RESULT_PREFIX):
            payload = json.loads(line[len(COLD_RESULT_PREFIX):])
            break
    if payload is None:
        raise RuntimeError(
            "cold subprocess produced no result marker; stderr tail:\n"
            f"{process.stderr[-4000:]}"
        )
    payload["stderr_tail"] = process.stderr[-1000:]
    return payload


def _cold_inner_main(arguments: argparse.Namespace) -> int:
    """Entry point for the fresh subprocess that measures scan #1/#2/#3."""
    import_seconds = _load_app()
    with _install_instrumentation():
        options = page_scanner.ScanOptions(**SINGLE_OPTIONS)
        url = arguments.base_url + "/issue-dense"
        scans = [_measure_once(url, options) for _ in range(arguments.iterations)]

    payload = {
        "fresh_process": True,
        "pid": os.getpid(),
        "import_seconds": round(import_seconds, 4),
        "axe_script_cache_cold_at_scan_1": True,
        "scans": scans,
        "durations_ms": [scan["duration_ms"] for scan in scans],
        "chromium_version": _CHROMIUM_VERSION,
        "axe_script_bytes": _AXE_SCRIPT_BYTES,
    }
    print(COLD_RESULT_PREFIX + json.dumps(payload))
    return 0


def _measure_axe_cache_cold_vs_warm(base_url: str) -> dict:
    """Time axe-core script fetch cold vs warm plus interleaved scan pairs."""
    options = page_scanner.ScanOptions(**SINGLE_OPTIONS)
    url = base_url + "/issue-dense"

    axe_scanner._axe_script_cache = None
    started = time.perf_counter()
    script = axe_scanner._get_axe_script()
    cold_fetch_ms = (time.perf_counter() - started) * 1000.0

    started = time.perf_counter()
    axe_scanner._get_axe_script()
    warm_fetch_ms = (time.perf_counter() - started) * 1000.0

    cold_scans: list[dict] = []
    warm_scans: list[dict] = []
    print("  axe cache: 3 cold-cache scans interleaved with 3 warm-cache scans ...", flush=True)
    for _ in range(3):
        axe_scanner._axe_script_cache = None
        cold_scans.append(_measure_once(url, options))
        warm_scans.append(_measure_once(url, options))

    return {
        "axe_cdn_url": getattr(axe_scanner, "AXE_CDN_URL", None),
        "axe_script_bytes": len(script),
        "cold_fetch_ms": round(cold_fetch_ms, 3),
        "warm_fetch_ms": round(warm_fetch_ms, 3),
        "cold_scan": _summarize_scans(cold_scans),
        "warm_scan": _summarize_scans(warm_scans),
        "derived_cold_cache_penalty_ms_median": round(
            statistics.median([scan["duration_ms"] for scan in cold_scans])
            - statistics.median([scan["duration_ms"] for scan in warm_scans]),
            3,
        ),
    }


def _summarize_scans(scans: list[dict]) -> dict:
    durations = [scan["duration_ms"] for scan in scans]
    phases: dict[str, float] = {}
    for scan in scans:
        for name, seconds in scan["phases_s"].items():
            phases[name] = phases.get(name, 0.0) + seconds
    return {
        "durations_ms": _describe_ms(durations),
        "samples": scans,
        "mean_axe_script_fetch_ms": round(
            (phases.get("nested:axe_script_fetch", 0.0) / len(scans)) * 1000.0, 3
        ),
    }


def _measure_browser_lifecycle_micro(base_url: str, reps: int = 5) -> dict:
    """Split the per-job browser lifecycle into its individual Playwright calls.

    This complements the scenario phases (which only see the aggregate
    ``browser_setup`` / ``browser_close`` wrappers) so the report can attribute
    driver start vs Chromium launch vs browser close vs driver stop.
    """
    from playwright.sync_api import sync_playwright

    lifecycle_samples: list[dict] = []
    print(f"  browser lifecycle micro-split: {reps} browser launch/close cycles ...", flush=True)
    for _ in range(reps):
        sample: dict[str, float] = {}
        playwright = None
        browser = None
        context = None
        try:
            started = time.perf_counter()
            playwright = sync_playwright().start()
            sample["playwright_start_ms"] = (time.perf_counter() - started) * 1000.0

            started = time.perf_counter()
            browser = playwright.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
            )
            sample["chromium_launch_ms"] = (time.perf_counter() - started) * 1000.0

            started = time.perf_counter()
            context = browser.new_context(
                viewport={"width": 1440, "height": 960},
                locale="en-US",
                color_scheme="light",
            )
            page = context.new_page()
            page.goto(base_url + "/clean", wait_until="domcontentloaded", timeout=15000)
            sample["context_page_navigation_ms"] = (time.perf_counter() - started) * 1000.0

            started = time.perf_counter()
            context.close()
            sample["context_close_ms"] = (time.perf_counter() - started) * 1000.0

            started = time.perf_counter()
            browser.close()
            browser = None
            sample["browser_close_ms"] = (time.perf_counter() - started) * 1000.0

            started = time.perf_counter()
            playwright.stop()
            playwright = None
            sample["playwright_stop_ms"] = (time.perf_counter() - started) * 1000.0

            sample["total_ms"] = sum(sample.values())
            sample["derived_setup_ms"] = (
                sample["playwright_start_ms"]
                + sample["chromium_launch_ms"]
                + sample["context_page_navigation_ms"]
            )
            sample["derived_teardown_ms"] = (
                sample["context_close_ms"]
                + sample["browser_close_ms"]
                + sample["playwright_stop_ms"]
            )
            lifecycle_samples.append(sample)
        finally:
            for resource, method in ((context, "close"), (browser, "close"), (playwright, "stop")):
                if resource is not None:
                    try:
                        getattr(resource, method)()
                    except Exception:
                        pass

    keys = [
        "playwright_start_ms",
        "chromium_launch_ms",
        "context_page_navigation_ms",
        "context_close_ms",
        "browser_close_ms",
        "playwright_stop_ms",
        "derived_setup_ms",
        "derived_teardown_ms",
        "total_ms",
    ]
    summary = {
        key: _describe_ms([sample[key] for sample in lifecycle_samples]) for key in keys
    }
    return {
        "reps": reps,
        "note": (
            "One browser lifecycle per repetition, matching the per-scan-job lifecycle: "
            "playwright start -> chromium launch -> new context/page + goto(clean) -> context close -> "
            "browser close -> playwright stop."
        ),
        "summary_ms": summary,
        "samples": lifecycle_samples,
    }


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


def _package_versions() -> dict[str, str | None]:
    versions: dict[str, str | None] = {}
    for package in ("playwright", "sqlalchemy", "pydantic", "cloudinary"):
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = None
    return versions


def _git_info() -> dict:
    info: dict = {}
    try:
        info["commit"] = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
        info["branch"] = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout.strip()
    except Exception:
        pass
    return info


def _machine_info() -> dict:
    return {
        "hostname": platform.node(),
        "platform": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "processor": _windows_cpu_name() or platform.processor() or None,
        "cpu_logical": os.cpu_count(),
        "ram_total_gb": _total_ram_gb(),
        "python": sys.version,
        "python_executable": sys.executable,
        "packages": _package_versions(),
        "git": _git_info(),
    }


def _calibration() -> dict:
    """Small fixed-workload calibration to detect machine load drift."""

    def workload() -> float:
        started = time.perf_counter()
        accumulator = 0
        for index in range(200_000):
            accumulator = (accumulator + index * index) % 1_000_003
        return (time.perf_counter() - started) * 1000.0

    samples = [workload() for _ in range(5)]
    return {"workload": "200k modular accumulate iterations", **_describe_ms(samples)}


# ---------------------------------------------------------------------------
# Report printing
# ---------------------------------------------------------------------------


def _print_markdown_tables(baseline: dict) -> None:
    scenarios = baseline["scenarios"]
    print("\n### Scenario results (ms, after warm-up)\n")
    headers = [
        "scenario",
        "n",
        "median",
        "min",
        "p90",
        "mean",
        "stdev",
        "issues",
        "pages",
        "ms/page",
        "ms/issue",
    ]
    rows = []
    for scenario in scenarios:
        aggregates = scenario["aggregates"]
        stats = aggregates["duration_ms"]
        rows.append(
            [
                scenario["scenario_id"],
                str(stats["count"]),
                f"{stats['median_ms']:.1f}",
                f"{stats['min_ms']:.1f}",
                f"{stats['p90_ms']:.1f}",
                f"{stats['mean_ms']:.1f}",
                f"{stats['stdev_ms']:.1f}",
                str(int(aggregates["issue_counts"]["median"])),
                str(int(aggregates["pages_scanned"]["median"])),
                f"{aggregates['ms_per_page']:.1f}",
                f"{aggregates['ms_per_issue']:.1f}"
                if aggregates["ms_per_issue"] is not None
                else "n/a",
            ]
        )
    widths = [max(len(str(row[index])) for row in [headers, *rows]) for index in range(len(headers))]
    print("| " + " | ".join(str(headers[i]).ljust(widths[i]) for i in range(len(headers))) + " |")
    print("|" + "|".join("-" * (width + 2) for width in widths) + "|")
    for row in rows:
        print("| " + " | ".join(str(row[i]).ljust(widths[i]) for i in range(len(headers))) + " |")

    representative = [
        "single_issue_dense_screenshots",
        "multi_5_pages_delay_0",
        "single_raw_html_fallback",
    ]
    selected = [scenario for scenario in scenarios if scenario["scenario_id"] in representative]
    phases = [
        "browser_setup",
        "goto",
        "render_wait",
        "nested:networkidle_wait",
        "nested:fixed_settle_wait",
        "request_delay",
        "page_content",
        "parse_html",
        "build_issues",
        "axe_core",
        "nested:axe_script_fetch",
        "merge_issues",
        "screenshots_total",
        "nested:screenshot_capture",
        "nested:screenshot_store",
        "fetch_html",
        "context_close",
        "browser_close",
    ]
    print("\n### Phase share of measured scan duration (%, top-level phases)\n")
    header = ["phase"] + [scenario["scenario_id"] for scenario in selected] + ["notes"]
    print("| " + " | ".join(header) + " |")
    print("|" + "|".join(["---"] * len(header)) + "|")
    for phase in phases:
        row = [phase]
        for scenario in selected:
            value = scenario["aggregates"]["phases"].get(phase, {}).get("share_of_total_pct")
            row.append(f"{value:.1f}" if value is not None else "-")
        row.append(PHASE_NOTES.get(phase, ""))
        print("| " + " | ".join(row) + " |")

    print("\n### Derived comparisons\n")
    by_id = {scenario["scenario_id"]: scenario for scenario in scenarios}
    for label, left, right in [
        (
            "screenshot capture+store cost (single issue-dense, median delta)",
            "single_issue_dense_screenshots",
            "single_issue_dense_no_screenshots",
        ),
        (
            "request_delay_ms=250 cost (multi 5 pages, median delta)",
            "multi_5_pages_delay_250",
            "multi_5_pages_delay_0",
        ),
    ]:
        if left in by_id and right in by_id:
            delta = (
                by_id[left]["aggregates"]["duration_ms"]["median_ms"]
                - by_id[right]["aggregates"]["duration_ms"]["median_ms"]
            )
            print(f"- {label}: **{delta:.1f} ms**")
    cold = baseline.get("cold_process") or {}
    if cold.get("durations_ms"):
        print(
            "- fresh-process scan #1 / #2 / #3: "
            + " / ".join(f"{value:.1f}" for value in cold["durations_ms"])
            + " ms"
        )
    lifecycle = baseline.get("browser_lifecycle_micro") or {}
    lifecycle_summary = lifecycle.get("summary_ms") or {}
    if lifecycle_summary:
        print("\n### Browser lifecycle micro-split (ms, median)\n")
        for key in [
            "playwright_start_ms",
            "chromium_launch_ms",
            "context_page_navigation_ms",
            "context_close_ms",
            "browser_close_ms",
            "playwright_stop_ms",
            "derived_setup_ms",
            "derived_teardown_ms",
            "total_ms",
        ]:
            stats = lifecycle_summary.get(key)
            if stats:
                print(f"- {key}: **{stats['median_ms']:.1f}** (min {stats['min_ms']:.1f})")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def _parse_arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=7, help="measured iterations per scenario (>=5)")
    parser.add_argument("--cold-iterations", type=int, default=3, help="scans measured in the fresh cold process")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_PATH, help="output JSON path")
    parser.add_argument("--only", default="", help="comma-separated scenario ids to run")
    parser.add_argument("--skip-cold", action="store_true", help="skip the fresh-process cold measurement")
    parser.add_argument("--skip-axe-cache", action="store_true", help="skip the axe cache cold/warm section")
    parser.add_argument("--quick", action="store_true", help="smoke mode: tiny iteration counts")
    # Internal: fresh-subprocess mode.
    parser.add_argument("--cold-inner", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--base-url", default="", help=argparse.SUPPRESS)
    arguments = parser.parse_args(argv)
    if arguments.quick and "--iterations" not in (argv if argv is not None else sys.argv[1:]):
        arguments.iterations = 1
        arguments.cold_iterations = 2
    return arguments


def _scenarios_to_run(arguments: argparse.Namespace) -> list[Scenario]:
    if not arguments.only:
        return list(ALL_SCENARIOS)
    requested = [item.strip() for item in arguments.only.split(",") if item.strip()]
    known = {scenario.scenario_id: scenario for scenario in ALL_SCENARIOS}
    unknown = [item for item in requested if item not in known]
    if unknown:
        raise SystemExit(f"unknown scenario id(s): {', '.join(unknown)}; known: {', '.join(known)}")
    return [known[item] for item in requested]


def main(argv: list[str] | None = None) -> int:
    global _REC

    arguments = _parse_arguments(argv)
    _REC = PhaseRecorder()
    if arguments.cold_inner:
        if not arguments.base_url:
            raise SystemExit("--cold-inner requires --base-url")
        if arguments.iterations < 1:
            raise SystemExit("--iterations must be >= 1")
        return _cold_inner_main(arguments)

    if arguments.iterations < 5 and not arguments.quick:
        raise SystemExit("--iterations must be >= 5 (the baseline requires medians over >=5 runs)")

    started_at = datetime.now(UTC)
    machine = _machine_info()
    calibration_before = _calibration()

    print("AccessAudit scanner performance baseline")
    print(f"  repo: {REPO_ROOT}")
    print(f"  machine: {machine['processor']} | {machine['cpu_logical']} logical CPUs | {machine['ram_total_gb']} GB RAM")
    print(f"  python: {machine['python'].splitlines()[0]}")

    server, base_url = start_fixture_server()
    print(f"  fixture server: {base_url}")

    cold_result = None
    try:
        if not arguments.skip_cold:
            cold_result = _run_cold_child(base_url, arguments.cold_iterations)
            print(
                "  cold process scan durations (ms): "
                + ", ".join(f"{value:.1f}" for value in cold_result["durations_ms"])
            )

        import_seconds = _load_app()
        print(f"  scanner import in benchmark process: {import_seconds * 1000:.1f} ms")

        scenarios_to_run = _scenarios_to_run(arguments)
        results: list[dict] = []
        process_first_scan = None
        axe_cache_result = None
        browser_lifecycle = None

        with _install_instrumentation():
            print("  first scan in benchmark process (also warms axe-core cache) ...", flush=True)
            process_first_scan = _measure_once(base_url + "/clean", page_scanner.ScanOptions(**SINGLE_OPTIONS))
            print(f"  first scan: {process_first_scan['duration_ms']:.1f} ms")

            for scenario in scenarios_to_run:
                iterations = arguments.iterations if arguments.quick else scenario.iterations
                print(
                    f"  scenario {scenario.scenario_id}: warm-up + {iterations} measured iterations ...",
                    flush=True,
                )
                result = _run_scenario(scenario, base_url, iterations)
                results.append(result)
                stats = result["aggregates"]["duration_ms"]
                print(
                    f"    median {stats['median_ms']:.1f} ms | p90 {stats['p90_ms']:.1f} ms "
                    f"| issues {int(result['aggregates']['issue_counts']['median'])} "
                    f"| pages {int(result['aggregates']['pages_scanned']['median'])}",
                    flush=True,
                )

            if not arguments.skip_axe_cache:
                axe_cache_result = _measure_axe_cache_cold_vs_warm(base_url)

        if not arguments.skip_axe_cache:
            browser_lifecycle = _measure_browser_lifecycle_micro(
                base_url, reps=2 if arguments.quick else 5
            )
    finally:
        server.shutdown()
        server.server_close()

    calibration_after = _calibration()
    drift_ratio = calibration_after["median_ms"] / calibration_before["median_ms"]
    baseline = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "generated_by": "scripts/perf/bench_scan.py",
        "started_at_utc": started_at.isoformat(),
        "duration_seconds": round(
            (datetime.now(UTC) - started_at).total_seconds(), 1
        ),
        "machine": machine,
        "environment": {
            "process_python": REQUIRED_ENV,
            "playwright": _package_versions().get("playwright"),
            "chromium_version": _CHROMIUM_VERSION,
            "axe_script_bytes": _AXE_SCRIPT_BYTES,
            "cloudinary_configured": bool(os.getenv("CLOUDINARY_URL", "").strip()),
            "screenshot_storage_mode": (
                "cloudinary" if os.getenv("CLOUDINARY_URL", "").strip() else "inline-data-url"
            ),
            "scan_execution_context": "direct scanner import per job; no FastAPI, no database, no auth",
        },
        "host_calibration": {
            "before": calibration_before,
            "after": calibration_after,
            "median_drift_ratio": round(drift_ratio, 3),
            "contention_flag": drift_ratio > 1.15 or drift_ratio < 0.87,
        },
        "cold_process": cold_result,
        "process_first_scan": process_first_scan,
        "axe_script_cold_warm": axe_cache_result,
        "browser_lifecycle_micro": browser_lifecycle,
        "scenarios": results,
        "methodology": {
            "scenario_definition": (
                "one iteration = one full scan_page() job; per-call scenarios create and close a "
                "BrowserSession per job, worker-mode scenarios reuse one BrowserSession across all "
                "measured jobs (the optimized worker shape)"
            ),
            "scenario_modes": {
                "per_call": [
                    scenario.scenario_id
                    for scenario in ALL_SCENARIOS
                    if scenario.session_mode == "per_call"
                ],
                "worker": [
                    scenario.scenario_id
                    for scenario in ALL_SCENARIOS
                    if scenario.session_mode == "worker"
                ],
            },
            "warmups_per_scenario": 1,
            "iterations_note": "measured iterations exclude the warm-up; single-page scenarios use 7, multi-page scenarios use 5 (each multi iteration scans 5 pages)",
            "percentile_method": "linear interpolation between closest ranks (numpy/Excel PERCENTILE.INC)",
            "phases": {
                "top_level": TOP_LEVEL_PHASES,
                "nested_not_in_top_level": NESTED_PHASES,
            },
            "phase_notes": PHASE_NOTES,
            "fixtures": FIXTURE_DESCRIPTIONS,
            "important_notes": [
                "Per-call scenarios launch and close their own Playwright driver + Chromium browser per job (the baseline production lifecycle).",
                "Worker-mode scenarios use one BrowserSession across all measured scans; the strategy is recorded per scenario (native session injection when scan_page supports browser_session, otherwise an emulated shared-session factory for the baseline code).",
                "The browser_start cost of worker mode appears once in the warm-up sample (and in worker_session metadata), not in the measured samples.",
                "single_render_failure_fallback forces the rendered attempt to fail while the browser is available: this is the raw-HTML + browser-analysis fallback path affected by the fixed _run_playwright_analysis defect; before the fix it returned custom-check-only issues.",
                "Fixtures are served from 127.0.0.1 over plain HTTP so target-network latency is effectively zero; real-world URLs will be slower.",
                "axe-core script is cached in a module global after the first fetch; warm scenarios do not include the CDN download.",
                "CLOUDINARY_URL is unset for this run, so screenshots are stored as inline base64 data URLs (portable CPU cost); production with Cloudinary configured pays network upload cost instead.",
                "issue counts are recorded per scenario so timings can be interpreted as work done (ms/page, ms/issue).",
            ],
        },
    }

    output_path = Path(arguments.json_out).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(baseline, indent=2), encoding="utf-8")
    print(f"\nraw results written to: {output_path}")
    _print_markdown_tables(baseline)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
