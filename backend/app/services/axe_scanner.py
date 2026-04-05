from __future__ import annotations

import json
from urllib.request import urlopen

from app.schemas.scan import ScanIssue

AXE_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"

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


def _get_axe_script() -> str:
    """Download and cache the axe-core script in memory."""
    global _axe_script_cache
    if _axe_script_cache is None:
        with urlopen(AXE_CDN_URL, timeout=15) as response:
            _axe_script_cache = response.read().decode("utf-8")
    return _axe_script_cache


def run_axe_core(page) -> list[ScanIssue]:
    """Inject axe-core into a Playwright page and return detected issues."""
    script = _get_axe_script()
    page.evaluate(script)

    raw_results = page.evaluate(
        """
        () => axe.run(document, {
            runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']
            }
        })
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
