from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from urllib.request import urlopen

from app.schemas.scan import ScanIssue

logger = logging.getLogger(__name__)

AXE_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"
AXE_ASSET_PATH = Path(__file__).resolve().parent.parent / "assets" / "axe.min.js"
AXE_SCRIPT_PATH_ENV = "AXE_SCRIPT_PATH"

DEFAULT_WCAG_STANDARD = "wcag21aa"
BEST_PRACTICE_TAG = "best-practice"

# axe-core tag values are version + conformance-level (for example wcag21aa).
_WCAG_STANDARD_PATTERN = re.compile(r"^(2|21|22)(a{1,3})$")

AXE_IMPACT_TO_SEVERITY: dict[str, str] = {
    "critical": "high",
    "serious": "high",
    "moderate": "medium",
    "minor": "low",
}

# Mapping from axe-core rule IDs to our custom rule IDs for deduplication.
OVERLAP_AXE_TO_CUSTOM: dict[str, str] = {
    "document-title": "document-title",
    "html-has-lang": "html-lang",
    "html-lang-valid": "html-lang",
    "image-alt": "image-alt",
    "link-name": "link-name",
    "duplicate-id": "duplicate-id",
    "duplicate-id-active": "duplicate-id",
    "duplicate-id-aria": "duplicate-id",
    "heading-order": "heading-order",
}

_axe_script_cache: str | None = None


def _local_axe_script_paths() -> list[Path]:
    """Path candidates for the vendored axe-core asset, override first."""
    paths: list[Path] = []
    override = os.getenv(AXE_SCRIPT_PATH_ENV, "").strip()
    if override:
        paths.append(Path(override))
    paths.append(AXE_ASSET_PATH)
    return paths


def _read_local_axe_script() -> str | None:
    for path in _local_axe_script_paths():
        try:
            script = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if script.strip():
            return script
    return None


def _download_axe_script() -> str:
    logger.warning(
        "Vendored axe-core asset not found or unreadable; falling back to CDN %s",
        AXE_CDN_URL,
    )
    with urlopen(AXE_CDN_URL, timeout=15) as response:
        return response.read().decode("utf-8")


def _get_axe_script() -> str:
    """Load the axe-core script from the vendored asset, falling back to the CDN.

    The result is cached in memory for the lifetime of the process, so the
    first scan in a worker pays any load cost and every later scan is free.
    """
    global _axe_script_cache
    if _axe_script_cache is None:
        script = _read_local_axe_script()
        if script is None:
            script = _download_axe_script()
        _axe_script_cache = script
    return _axe_script_cache


def warm_axe_cache() -> bool:
    """Preload the axe-core script so the first user scan does not pay for it."""
    try:
        _get_axe_script()
    except Exception:
        logger.warning("Could not warm the axe-core script cache", exc_info=True)
        return False
    return True


def _parse_wcag_standard(wcag_standard: str) -> tuple[str, str] | None:
    normalized = (wcag_standard or "").strip().lower().replace("wcag", "").replace(".", "")
    match = _WCAG_STANDARD_PATTERN.fullmatch(normalized)
    if match is None:
        return None
    return match.group(1), match.group(2)


def build_axe_tag_values(
    wcag_standard: str = DEFAULT_WCAG_STANDARD,
    include_best_practices: bool = True,
) -> list[str]:
    """Translate a saved WCAG preference into axe-core ``runOnly`` tag values.

    Base coverage is WCAG 2.0 A/AA. Selecting a newer standard adds that
    version's A/AA tags, AAA selections add the matching AAA tags, and A-only
    selections omit every AA tag. The ``best-practice`` tag is opt-out.
    Unknown values fall back to the default standard.
    """
    version_level = _parse_wcag_standard(wcag_standard) or _parse_wcag_standard(
        DEFAULT_WCAG_STANDARD
    )
    version, level = version_level or ("21", "aa")

    tags = ["wcag2a"]
    if level in {"aa", "aaa"}:
        tags.append("wcag2aa")
    if level == "aaa":
        tags.append("wcag2aaa")

    if version in {"21", "22"}:
        tags.append(f"wcag{version}a")
        if level in {"aa", "aaa"}:
            tags.append(f"wcag{version}aa")
        if level == "aaa":
            tags.append(f"wcag{version}aaa")

    if include_best_practices:
        tags.append(BEST_PRACTICE_TAG)

    return tags


def run_axe_core(
    page,
    *,
    wcag_standard: str = DEFAULT_WCAG_STANDARD,
    include_best_practices: bool = True,
) -> list[ScanIssue]:
    """Inject axe-core into a Playwright page and return detected issues."""
    script = _get_axe_script()
    page.evaluate(script)

    tag_values = build_axe_tag_values(wcag_standard, include_best_practices)
    tag_values_json = json.dumps(tag_values)
    raw_results = page.evaluate(
        f"""
        () => axe.run(document, {{
            runOnly: {{
                type: 'tag',
                values: {tag_values_json}
            }}
        }})
        """
    )

    return _map_axe_results(raw_results)


def _map_axe_results(raw_results: dict) -> list[ScanIssue]:
    """Convert axe-core violation results into ScanIssue objects."""
    issues: list[ScanIssue] = []

    for violation in raw_results.get("violations", []):
        rule_id = violation["id"]
        impact = violation.get("impact", "minor") or "minor"
        severity = AXE_IMPACT_TO_SEVERITY.get(impact, "low")
        help_text = violation.get("help", "")
        help_url = violation.get("helpUrl", "")
        tags = violation.get("tags", [])
        wcag_tags = _extract_wcag_criteria(tags)

        for node in violation.get("nodes", []):
            html_snippet = node.get("html", "")
            if len(html_snippet) > 200:
                html_snippet = html_snippet[:197] + "..."

            target_selectors = node.get("target", [])
            dom_path = target_selectors[0] if target_selectors else None

            recommendation = _build_recommendation(node, help_url)

            issues.append(
                ScanIssue(
                    rule_id=rule_id,
                    severity=severity,
                    element=html_snippet,
                    message=help_text,
                    recommendation=recommendation,
                    dom_path=dom_path,
                    wcag_criteria=wcag_tags or None,
                    source="axe-core",
                )
            )

    return issues


def _build_recommendation(node: dict, help_url: str) -> str:
    """Build a recommendation string from axe-core node data."""
    parts: list[str] = []

    any_checks = node.get("any", [])
    all_checks = node.get("all", [])
    none_checks = node.get("none", [])

    for check in [*all_checks, *any_checks]:
        message = check.get("message", "").strip()
        if message and check.get("impact"):
            parts.append(message)

    for check in none_checks:
        message = check.get("message", "").strip()
        if message and check.get("impact"):
            parts.append(message)

    if not parts and help_url:
        return f"See guidance: {help_url}"

    if help_url:
        parts.append(f"More info: {help_url}")

    return " ".join(parts) if parts else "Review this element for accessibility."


def _extract_wcag_criteria(tags: list[str]) -> list[str]:
    """Extract and format WCAG success criteria from axe-core tags."""
    criteria: list[str] = []

    for tag in tags:
        if tag.startswith("wcag") and any(char.isdigit() for char in tag[4:]):
            formatted = _format_wcag_tag(tag)
            if formatted and formatted not in criteria:
                criteria.append(formatted)
        elif tag == "best-practice" and "Best Practice" not in criteria:
            criteria.append("Best Practice")

    return criteria


def _format_wcag_tag(tag: str) -> str | None:
    """Format an axe-core WCAG tag into a readable label.

    Examples:
        wcag2a     -> WCAG 2.0 A
        wcag2aa    -> WCAG 2.0 AA
        wcag21a    -> WCAG 2.1 A
        wcag21aa   -> WCAG 2.1 AA
        wcag111    -> WCAG 1.1.1
        wcag412    -> WCAG 4.1.2
    """
    body = tag[4:]

    if body in ("2a", "2aa", "2aaa"):
        return f"WCAG 2.0 {body[1:].upper()}"
    if body in ("21a", "21aa", "21aaa"):
        return f"WCAG 2.1 {body[2:].upper()}"
    if body in ("22a", "22aa", "22aaa"):
        return f"WCAG 2.2 {body[2:].upper()}"

    if body.isdigit() and len(body) >= 3:
        return f"WCAG {body[0]}.{body[1]}.{body[2:]}"

    return None


def merge_issues(
    custom_issues: list[ScanIssue],
    axe_issues: list[ScanIssue],
) -> list[ScanIssue]:
    """Merge custom and axe-core issues, deduplicating overlapping rules.

    For overlapping rules, the custom issue is kept (it has line/column info)
    and enriched with WCAG criteria from axe-core. Axe-only rules are appended.
    """
    overlapping_custom_ids = set(OVERLAP_AXE_TO_CUSTOM.values())
    overlapping_axe_ids = set(OVERLAP_AXE_TO_CUSTOM.keys())

    axe_wcag_by_rule: dict[str, list[str]] = {}
    for issue in axe_issues:
        custom_id = OVERLAP_AXE_TO_CUSTOM.get(issue.rule_id)
        if custom_id and issue.wcag_criteria:
            existing = axe_wcag_by_rule.get(custom_id, [])
            for tag in issue.wcag_criteria:
                if tag not in existing:
                    existing.append(tag)
            axe_wcag_by_rule[custom_id] = existing

    merged: list[ScanIssue] = []

    for issue in custom_issues:
        if issue.rule_id in overlapping_custom_ids:
            wcag = axe_wcag_by_rule.get(issue.rule_id)
            issue.wcag_criteria = wcag if wcag else issue.wcag_criteria
            issue.source = "both" if wcag else "custom"
        else:
            issue.source = "custom"
        merged.append(issue)

    for issue in axe_issues:
        if issue.rule_id not in overlapping_axe_ids:
            merged.append(issue)

    return merged
