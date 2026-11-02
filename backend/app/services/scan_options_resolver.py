"""Resolve scan execution options from saved user preferences and request overrides.

The scan API accepts a fully optional request body. Omitted fields inherit the
user's saved ``app_preferences`` values so a user's crawl defaults apply without
the frontend re-sending them, while explicitly provided request values always
win. The resolved options are persisted on the scan run so the queued worker
reconstructs exactly the same configuration.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas.scan import ScanPageRequest

# Dashboard crawls stay bounded at five pages, matching the synchronous path.
SYNC_CRAWL_PAGE_LIMIT = 5

DEFAULT_MODE = "single"
DEFAULT_PAGE_LIMIT = 5
DEFAULT_CRAWL_DEPTH = 3
DEFAULT_REQUEST_DELAY_MS = 250
DEFAULT_PAGE_TIMEOUT_MS = 15000
DEFAULT_WCAG_STANDARD = "wcag21aa"
DEFAULT_INCLUDE_BEST_PRACTICES = True
VALID_MODES = ("single", "multi")


@dataclass(frozen=True)
class ResolvedScanSettings:
    """Scan settings after merging request overrides over preference defaults."""

    mode: str
    page_limit: int | None
    crawl_depth: int
    request_delay_ms: int
    page_timeout_ms: int
    ignored_url_patterns: tuple[str, ...]
    stay_within_domain: bool
    respect_robots_txt: bool
    skip_previously_scanned_pages: bool
    wcag_standard: str
    include_best_practices: bool


def resolve_scan_settings(
    request: ScanPageRequest,
    preferences,
) -> ResolvedScanSettings:
    """Merge explicit request values over preference defaults.

    ``preferences`` is duck-typed (any object with the ``AppPreferences``
    attribute names) so tests and callers can pass a lightweight stub.
    """
    explicit = request.model_fields_set

    mode = _pick_mode(request, explicit, preferences)
    page_limit = _pick_int(request, explicit, "page_limit", preferences, "default_page_limit", DEFAULT_PAGE_LIMIT)
    if mode == "multi":
        page_limit = min(page_limit, SYNC_CRAWL_PAGE_LIMIT)
    else:
        page_limit = None

    ignored_url_patterns = _pick_patterns(request, explicit, preferences)

    return ResolvedScanSettings(
        mode=mode,
        page_limit=page_limit,
        crawl_depth=_pick_int(
            request, explicit, "crawl_depth", preferences, "crawl_depth", DEFAULT_CRAWL_DEPTH
        ),
        request_delay_ms=_pick_int(
            request,
            explicit,
            "request_delay_ms",
            preferences,
            "request_delay_ms",
            DEFAULT_REQUEST_DELAY_MS,
        ),
        page_timeout_ms=_pick_int(
            request,
            explicit,
            "page_timeout_ms",
            preferences,
            "page_timeout_ms",
            DEFAULT_PAGE_TIMEOUT_MS,
        ),
        ignored_url_patterns=ignored_url_patterns,
        stay_within_domain=_pick_bool(
            request, explicit, "stay_within_domain", preferences, True
        ),
        respect_robots_txt=_pick_bool(
            request, explicit, "respect_robots_txt", preferences, True
        ),
        skip_previously_scanned_pages=_pick_bool(
            request, explicit, "skip_previously_scanned_pages", preferences, True
        ),
        wcag_standard=_pick_wcag_standard(request, explicit, preferences),
        include_best_practices=_pick_include_best_practices(request, explicit, preferences),
    )


def _is_explicit(request: ScanPageRequest, explicit: set[str], name: str) -> bool:
    return name in explicit and getattr(request, name) is not None


def _pref_value(preferences, name: str):
    return getattr(preferences, name, None) if preferences is not None else None


def _pick_mode(request: ScanPageRequest, explicit: set[str], preferences) -> str:
    if _is_explicit(request, explicit, "mode"):
        return str(request.mode)
    candidate = str(_pref_value(preferences, "default_scan_mode") or "").strip().lower()
    return candidate if candidate in VALID_MODES else DEFAULT_MODE


def _pick_int(
    request: ScanPageRequest,
    explicit: set[str],
    name: str,
    preferences,
    preference_name: str,
    default: int,
) -> int:
    if _is_explicit(request, explicit, name):
        return int(getattr(request, name))
    preference_value = _pref_value(preferences, preference_name)
    if preference_value is None:
        return default
    return int(preference_value)


def _pick_bool(
    request: ScanPageRequest,
    explicit: set[str],
    name: str,
    preferences,
    default: bool,
) -> bool:
    if _is_explicit(request, explicit, name):
        return bool(getattr(request, name))
    preference_value = _pref_value(preferences, name)
    if preference_value is None:
        return default
    return bool(preference_value)


def _pick_patterns(
    request: ScanPageRequest,
    explicit: set[str],
    preferences,
) -> tuple[str, ...]:
    if _is_explicit(request, explicit, "ignored_url_patterns"):
        return tuple(str(pattern) for pattern in (request.ignored_url_patterns or []))
    preference_value = _pref_value(preferences, "ignored_url_patterns")
    if not preference_value:
        return ()
    return tuple(str(pattern) for pattern in preference_value)


def _pick_wcag_standard(
    request: ScanPageRequest,
    explicit: set[str],
    preferences,
) -> str:
    if _is_explicit(request, explicit, "wcag_standard"):
        candidate = str(request.wcag_standard)
    else:
        candidate = str(_pref_value(preferences, "wcag_standard") or "")
    normalized = candidate.strip().lower()
    return normalized or DEFAULT_WCAG_STANDARD


def _pick_include_best_practices(
    request: ScanPageRequest,
    explicit: set[str],
    preferences,
) -> bool:
    if _is_explicit(request, explicit, "include_best_practices"):
        return bool(request.include_best_practices)
    preference_value = _pref_value(preferences, "include_best_practices")
    if preference_value is None:
        return DEFAULT_INCLUDE_BEST_PRACTICES
    return bool(preference_value)
