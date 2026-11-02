"""Render a downloadable bundle of every repair suggestion for a scan.

The bundle is a single document (Markdown by default, JSON on request) that
covers every issue group of the scan: groups that already have a generated
suggestion carry the full AI output, and groups that do not are listed in a
"Not yet generated" section so the export is never silently incomplete.

Nothing secret is included: only suggestion content, provider/model names, and
scan metadata are rendered.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.schemas.repair_suggestion import (
    RepairSuggestionBundleResponse,
    RepairSuggestionGroupResponse,
    RepairSuggestionResponse,
)

BUNDLE_FORMAT_MARKDOWN = "markdown"
BUNDLE_FORMAT_JSON = "json"
BUNDLE_FORMATS = (BUNDLE_FORMAT_MARKDOWN, BUNDLE_FORMAT_JSON)
MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8"
JSON_CONTENT_TYPE = "application/json; charset=utf-8"
BUNDLE_FILENAME_PREFIX = "accessaudit-repair-bundle"


class RepairBundleError(ValueError):
    """Raised when the requested bundle format is not supported."""


def normalize_bundle_format(value: str | None) -> str:
    normalized = (value or BUNDLE_FORMAT_MARKDOWN).strip().lower()
    if normalized not in BUNDLE_FORMATS:
        raise RepairBundleError(
            "Unsupported bundle format. Use 'markdown' or 'json'."
        )
    return normalized


def build_repair_bundle(
    scan_run,
    groups: list[RepairSuggestionGroupResponse],
    *,
    bundle_format: str = BUNDLE_FORMAT_MARKDOWN,
    generated_at: datetime | None = None,
) -> RepairSuggestionBundleResponse:
    """Build the export envelope plus its rendered content."""
    resolved_format = normalize_bundle_format(bundle_format)
    resolved_generated_at = generated_at or datetime.now(UTC)

    generated_groups = [group for group in groups if group.suggestion is not None]
    missing_groups = [group for group in groups if group.suggestion is None]

    if resolved_format == BUNDLE_FORMAT_JSON:
        content = _render_json(
            scan_run=scan_run,
            groups=groups,
            generated_at=resolved_generated_at,
        )
        content_type = JSON_CONTENT_TYPE
        extension = "json"
    else:
        content = _render_markdown(
            scan_run=scan_run,
            generated_groups=generated_groups,
            missing_groups=missing_groups,
            group_count=len(groups),
            generated_at=resolved_generated_at,
        )
        content_type = MARKDOWN_CONTENT_TYPE
        extension = "md"

    scan_id = str(scan_run.id)
    return RepairSuggestionBundleResponse(
        scan_id=scan_id,
        generated_at=resolved_generated_at.isoformat(),
        filename=f"{BUNDLE_FILENAME_PREFIX}-{scan_id[:8]}.{extension}",
        content_type=content_type,
        group_count=len(groups),
        generated_count=len(generated_groups),
        missing_count=len(missing_groups),
        content=content,
    )


def _scan_url(scan_run) -> str:
    return scan_run.final_url or scan_run.requested_url


def _scan_date(scan_run) -> str:
    completed_at = getattr(scan_run, "completed_at", None)
    started_at = getattr(scan_run, "started_at", None)
    if completed_at is not None:
        return completed_at.isoformat()
    if started_at is not None:
        return started_at.isoformat()
    return "unknown"


def _format_score(scan_run) -> str:
    score = getattr(scan_run, "score", None)
    return "n/a" if score is None else str(score)


def _render_markdown(
    *,
    scan_run,
    generated_groups: list[RepairSuggestionGroupResponse],
    missing_groups: list[RepairSuggestionGroupResponse],
    group_count: int,
    generated_at: datetime,
) -> str:
    lines: list[str] = [
        "# Accessibility repair bundle",
        "",
        f"- Scan ID: {scan_run.id}",
        f"- URL: {_scan_url(scan_run)}",
        f"- Date: {_scan_date(scan_run)}",
        f"- Status: {scan_run.status}",
        f"- Score: {_format_score(scan_run)}",
        f"- Pages scanned: {getattr(scan_run, 'pages_scanned', 0)}",
        (
            f"- Issue groups: {group_count} "
            f"({len(generated_groups)} with suggestions, "
            f"{len(missing_groups)} not yet generated)"
        ),
        f"- Bundle generated at: {generated_at.isoformat()}",
        "",
        "## Generated suggestions",
        "",
    ]

    if not generated_groups:
        lines.extend(
            [
                "No repair suggestions have been generated for this scan yet.",
                "",
            ]
        )

    for index, group in enumerate(generated_groups, start=1):
        lines.extend(_render_markdown_group(index, group))
        lines.append("")

    lines.extend(["## Not yet generated", ""])
    if not missing_groups:
        lines.extend(["All issue groups in this scan have generated suggestions.", ""])
    else:
        for group in missing_groups:
            wcag = ", ".join(group.wcag_criteria) if group.wcag_criteria else "none"
            lines.append(
                f"- {group.title} (`{group.rule_id}`, severity {group.severity}, "
                f"{group.affected_count} occurrence(s), WCAG: {wcag})"
            )
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def _render_markdown_group(
    index: int,
    group: RepairSuggestionGroupResponse,
) -> list[str]:
    suggestion: RepairSuggestionResponse = group.suggestion
    lines: list[str] = [
        f"### {index}. {group.title}",
        "",
        f"- Rule: {group.rule_id}",
        f"- Severity: {group.severity}",
        f"- Affected elements: {group.affected_count}",
        f"- Affected pages ({len(group.affected_pages)}): "
        + (", ".join(group.affected_pages) if group.affected_pages else "none"),
        f"- WCAG: " + (", ".join(group.wcag_criteria) if group.wcag_criteria else "none"),
        f"- Provider: {suggestion.provider} ({suggestion.model})",
        f"- Confidence: {suggestion.confidence}",
        "",
        "**Explanation**",
        "",
        suggestion.explanation,
        "",
        "**Impact**",
        "",
        suggestion.impact,
        "",
        "**Recommended fix**",
        "",
        suggestion.recommended_fix,
        "",
    ]

    if suggestion.before_code:
        lines.extend(["**Before**", "", "```html", suggestion.before_code, "```", ""])
    if suggestion.after_code:
        lines.extend(["**After**", "", "```html", suggestion.after_code, "```", ""])
    if suggestion.limitations:
        lines.extend(["**Limitations**", "", suggestion.limitations, ""])

    return lines


def _render_json(
    *,
    scan_run,
    groups: list[RepairSuggestionGroupResponse],
    generated_at: datetime,
) -> str:
    payload = {
        "scan": {
            "id": str(scan_run.id),
            "url": _scan_url(scan_run),
            "requested_url": scan_run.requested_url,
            "final_url": getattr(scan_run, "final_url", None),
            "status": scan_run.status,
            "date": _scan_date(scan_run),
            "score": getattr(scan_run, "score", None),
            "pages_scanned": getattr(scan_run, "pages_scanned", 0),
            "pages_skipped": getattr(scan_run, "pages_skipped", 0),
            "summary": {
                "total_issues": getattr(scan_run, "total_issues", 0),
                "high": getattr(scan_run, "high_count", 0),
                "medium": getattr(scan_run, "medium_count", 0),
                "low": getattr(scan_run, "low_count", 0),
            },
        },
        "generated_at": generated_at.isoformat(),
        "groups": [
            {
                "group_key": group.group_key,
                "rule_id": group.rule_id,
                "title": group.title,
                "severity": group.severity,
                "recommendation": group.recommendation,
                "wcag_criteria": group.wcag_criteria,
                "affected_count": group.affected_count,
                "affected_pages": group.affected_pages,
                "suggestion": (
                    _suggestion_payload(group.suggestion)
                    if group.suggestion is not None
                    else None
                ),
            }
            for group in groups
        ],
    }
    return json.dumps(payload, indent=2)


def _suggestion_payload(suggestion: RepairSuggestionResponse) -> dict:
    return {
        "provider": suggestion.provider,
        "model": suggestion.model,
        "explanation": suggestion.explanation,
        "impact": suggestion.impact,
        "recommended_fix": suggestion.recommended_fix,
        "before_code": suggestion.before_code,
        "after_code": suggestion.after_code,
        "confidence": suggestion.confidence,
        "limitations": suggestion.limitations,
    }
