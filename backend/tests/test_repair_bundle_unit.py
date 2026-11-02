import json
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.schemas.repair_suggestion import (
    RepairSuggestionGroupResponse,
    RepairSuggestionResponse,
)
from app.services.repair_bundle_service import (
    RepairBundleError,
    build_repair_bundle,
    normalize_bundle_format,
)

GENERATED_AT = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)


def _scan_run(**overrides):
    values = {
        "id": uuid4(),
        "requested_url": "https://example.com/",
        "final_url": "https://example.com/home",
        "status": "complete",
        "score": 87,
        "pages_scanned": 3,
        "pages_skipped": 1,
        "total_issues": 9,
        "high_count": 4,
        "medium_count": 3,
        "low_count": 2,
        "started_at": datetime(2026, 1, 2, 2, 0, 0, tzinfo=UTC),
        "completed_at": datetime(2026, 1, 2, 2, 5, 0, tzinfo=UTC),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _suggestion(**overrides):
    values = {
        "id": str(uuid4()),
        "group_key": "group-key",
        "provider": "openai",
        "model": "gpt-4o",
        "explanation": "Images convey meaning that is otherwise lost.",
        "impact": "Screen reader users miss the image purpose.",
        "recommended_fix": "Add descriptive alt text to informative images.",
        "before_code": "<img src='/hero.png'>",
        "after_code": "<img src='/hero.png' alt='Product dashboard overview'>",
        "confidence": "high",
        "limitations": "Decorative images should keep empty alt text.",
        "created_at": GENERATED_AT.isoformat(),
        "updated_at": GENERATED_AT.isoformat(),
    }
    values.update(overrides)
    return RepairSuggestionResponse(**values)


def _group(title, *, rule_id="image-alt", severity="high", suggestion=None, pages=None):
    pages = pages or ["https://example.com/", "https://example.com/home"]
    return RepairSuggestionGroupResponse(
        group_key=f"key-{rule_id}-{title}",
        rule_id=rule_id,
        title=title,
        severity=severity,
        recommendation="Add meaningful alternative text.",
        wcag_criteria=["WCAG 2.0 A", "WCAG 1.1.1"],
        affected_count=2,
        affected_pages=pages,
        examples=[],
        suggestion=suggestion,
    )


def test_bundle_envelope_counts_generated_and_missing_groups():
    scan_run = _scan_run()
    groups = [
        _group("Image is missing alternative text.", suggestion=_suggestion()),
        _group("Heading levels skip hierarchy.", rule_id="heading-order", suggestion=_suggestion(group_key="h")),
        _group("Document title is missing.", rule_id="document-title", suggestion=None),
    ]

    bundle = build_repair_bundle(scan_run, groups, generated_at=GENERATED_AT)

    scan_id = str(scan_run.id)
    assert bundle.scan_id == scan_id
    assert bundle.generated_at == "2026-01-02T03:04:05+00:00"
    assert bundle.filename == f"accessaudit-repair-bundle-{scan_id[:8]}.md"
    assert bundle.content_type == "text/markdown; charset=utf-8"
    assert bundle.group_count == 3
    assert bundle.generated_count == 2
    assert bundle.missing_count == 1


def test_markdown_bundle_orders_generated_groups_before_pending_section():
    scan_run = _scan_run()
    first_title = "Image is missing alternative text."
    second_title = "Heading levels skip hierarchy."
    missing_title = "Document title is missing."
    groups = [
        _group(first_title, suggestion=_suggestion()),
        _group(second_title, rule_id="heading-order", suggestion=_suggestion()),
        _group(missing_title, rule_id="document-title", suggestion=None),
    ]

    content = build_repair_bundle(scan_run, groups, generated_at=GENERATED_AT).content

    generated_heading = content.index("## Generated suggestions")
    first_index = content.index(f"### 1. {first_title}")
    second_index = content.index(f"### 2. {second_title}")
    pending_heading = content.index("## Not yet generated")
    missing_index = content.index(missing_title)
    assert generated_heading < first_index < second_index < pending_heading < missing_index
    assert str(scan_run.id) in content
    assert "https://example.com/home" in content
    assert "Status: complete" in content
    assert "Score: 87" in content
    assert "Provider: openai (gpt-4o)" in content
    assert "**Explanation**" in content
    assert "**Impact**" in content
    assert "**Recommended fix**" in content
    assert "```html" in content
    assert "**Limitations**" in content
    assert "2 with suggestions, 1 not yet generated" in content


def test_markdown_bundle_states_when_every_group_has_a_suggestion():
    scan_run = _scan_run()
    groups = [_group("Image is missing alternative text.", suggestion=_suggestion())]

    content = build_repair_bundle(scan_run, groups, generated_at=GENERATED_AT).content

    assert "## Not yet generated" in content
    assert "All issue groups in this scan have generated suggestions." in content


def test_json_bundle_covers_every_group_and_contains_no_secrets():
    scan_run = _scan_run()
    groups = [
        _group("Image is missing alternative text.", suggestion=_suggestion()),
        _group("Document title is missing.", rule_id="document-title", suggestion=None),
    ]

    bundle = build_repair_bundle(
        scan_run,
        groups,
        bundle_format="json",
        generated_at=GENERATED_AT,
    )

    payload = json.loads(bundle.content)
    assert bundle.filename == f"accessaudit-repair-bundle-{str(scan_run.id)[:8]}.json"
    assert bundle.content_type == "application/json; charset=utf-8"
    assert payload["scan"]["id"] == str(scan_run.id)
    assert payload["scan"]["score"] == 87
    assert payload["scan"]["summary"] == {
        "total_issues": 9,
        "high": 4,
        "medium": 3,
        "low": 2,
    }
    assert len(payload["groups"]) == 2
    assert payload["groups"][0]["suggestion"]["provider"] == "openai"
    assert payload["groups"][1]["suggestion"] is None
    lowered = bundle.content.lower()
    assert "api_key" not in lowered
    assert "sk-" not in bundle.content
    assert "encrypted" not in lowered


def test_unsupported_bundle_format_is_rejected():
    with pytest.raises(RepairBundleError):
        build_repair_bundle(_scan_run(), [], bundle_format="pdf")
    with pytest.raises(RepairBundleError):
        normalize_bundle_format("html")


def test_bundle_format_normalization_is_case_insensitive():
    assert normalize_bundle_format("MARKDOWN") == "markdown"
    assert normalize_bundle_format(None) == "markdown"
    assert normalize_bundle_format("Json") == "json"
