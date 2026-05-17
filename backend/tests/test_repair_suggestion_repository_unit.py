from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import User
from app.models.repair_suggestion import RepairSuggestion
from app.models.scan import ScanIssueRecord, ScanRun
from app.repositories.repair_suggestion_repository import (
    RepairSuggestionDraft,
    build_repair_suggestion_groups,
    list_repair_suggestion_groups,
    save_repair_suggestion,
)


def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    User.__table__.create(engine)
    ScanRun.__table__.create(engine)
    ScanIssueRecord.__table__.create(engine)
    RepairSuggestion.__table__.create(engine)
    return sessionmaker(bind=engine)()


def _scan_run(**overrides):
    values = {
        "id": uuid4(),
        "user_id": uuid4(),
        "requested_url": "https://example.com",
        "final_url": "https://example.com",
        "status": "complete",
        "mode": "multi",
        "page_limit": 5,
        "pages_scanned": 2,
        "pages_skipped": 0,
        "scanned_page_urls": ["https://example.com", "https://example.com/about"],
        "skipped_page_urls": [],
        "queued_page_urls": [],
        "excluded_page_urls": [],
        "started_at": datetime.now(UTC),
        "completed_at": datetime.now(UTC),
        "total_issues": 0,
        "high_count": 0,
        "medium_count": 0,
        "low_count": 0,
    }
    values.update(overrides)
    return ScanRun(**values)


def _issue(position: int, page_url: str, **overrides):
    values = {
        "position": position,
        "rule_id": "image-alt",
        "severity": "high",
        "element": f"<img src='/hero-{position}.png'>",
        "message": "Image is missing alternative text.",
        "recommendation": "Add meaningful alt text to informative images.",
        "line": None,
        "column": None,
        "source_hint": "img",
        "dom_path": f"html > body > img:nth-child({position})",
        "text_preview": "",
        "page_url": page_url,
        "wcag_criteria": ["1.1.1"],
        "source": "custom",
    }
    values.update(overrides)
    return ScanIssueRecord(**values)


def test_groups_similar_issues_without_page_or_dom_path_in_key():
    scan_run = _scan_run()
    scan_run.issues = [
        _issue(0, "https://example.com"),
        _issue(1, "https://example.com/about"),
        _issue(
            2,
            "https://example.com/contact",
            rule_id="form-label",
            message="Form control is missing a label.",
            recommendation="Associate a visible label with the form control.",
            wcag_criteria=["1.3.1", "4.1.2"],
            source_hint="input",
        ),
    ]

    groups = build_repair_suggestion_groups(scan_run)

    assert len(groups) == 2
    image_alt_group = groups[0]
    assert image_alt_group.rule_id == "image-alt"
    assert len(image_alt_group.issues) == 2
    assert image_alt_group.affected_pages == [
        "https://example.com",
        "https://example.com/about",
    ]
    assert len(image_alt_group.examples) == 2


def test_groups_duplicate_id_issues_with_different_counts():
    scan_run = _scan_run()
    scan_run.issues = [
        _issue(
            0,
            "https://example.com/business",
            rule_id="duplicate-id",
            severity="medium",
            element="id='popover-wrapper'",
            message="Duplicate id found 11 times.",
            recommendation="Use unique id values for each element on the page.",
            wcag_criteria=["4.1.1"],
            source="custom",
        ),
        _issue(
            1,
            "https://example.com",
            rule_id="duplicate-id",
            severity="medium",
            element="id='popover-trigger'",
            message="Duplicate id found 18 times.",
            recommendation="Use unique id values for each element on the page.",
            wcag_criteria=["4.1.1"],
            source="custom",
        ),
    ]

    groups = build_repair_suggestion_groups(scan_run)

    assert len(groups) == 1
    assert groups[0].title == "Duplicate id found multiple times."
    assert len(groups[0].issues) == 2


def test_groups_color_contrast_issues_with_different_ratio_details():
    scan_run = _scan_run()
    scan_run.issues = [
        _issue(
            0,
            "https://example.com",
            rule_id="color-contrast",
            severity="high",
            element="<p class='card-description'>Example text</p>",
            message="Elements must meet minimum color contrast ratio thresholds",
            recommendation=(
                "Element has insufficient color contrast of 2.42 "
                "(foreground color: #535557, background color: #141618, font size: 10.5pt (14px), font weight: normal). "
                "Expected contrast ratio of 4.5:1 More info: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI"
            ),
            wcag_criteria=["1.4.3"],
            source="axe",
        ),
        _issue(
            1,
            "https://example.com/news",
            rule_id="color-contrast",
            severity="high",
            element="<p class='card-description'>Another text</p>",
            message="Elements must meet minimum color contrast ratio thresholds",
            recommendation=(
                "Element has insufficient color contrast of 1.88 "
                "(foreground color: #434547, background color: #141618, font size: 9.0pt (12px), font weight: normal). "
                "Expected contrast ratio of 4.5:1 More info: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI"
            ),
            wcag_criteria=["1.4.3"],
            source="axe",
        ),
    ]

    groups = build_repair_suggestion_groups(scan_run)

    assert len(groups) == 1
    assert len(groups[0].issues) == 2
    assert groups[0].recommendation == (
        "Increase foreground and background contrast until the text meets the required WCAG contrast threshold."
    )


def test_reuses_one_suggestion_per_user_and_group_across_scans():
    session = _session()
    user_id = uuid4()
    scan_run = _scan_run()
    scan_run.user_id = user_id
    scan_run.issues = [
        _issue(0, "https://example.com"),
        _issue(1, "https://example.com/about"),
    ]
    later_scan_run = _scan_run(
        user_id=user_id,
        requested_url="https://another.test",
        final_url="https://another.test",
        scanned_page_urls=["https://another.test"],
    )
    later_scan_run.issues = [_issue(0, "https://another.test")]
    session.add_all([scan_run, later_scan_run])
    session.commit()

    group = build_repair_suggestion_groups(scan_run)[0]
    suggestion = save_repair_suggestion(
        session,
        scan_run=scan_run,
        group=group,
        provider="openai",
        model="gpt-4o",
        draft=RepairSuggestionDraft(
            explanation="These images need useful alternatives.",
            impact="Screen reader users miss the image purpose.",
            recommended_fix="Write concise alt text for each informative image.",
            before_code="<img src='/hero.png'>",
            after_code="<img src='/hero.png' alt='Product dashboard overview'>",
            confidence="high",
            limitations=None,
        ),
    )

    response_groups = list_repair_suggestion_groups(session, later_scan_run)

    assert suggestion.user_id == scan_run.user_id
    assert suggestion.scan_run_id == scan_run.id
    assert suggestion.affected_count == 2
    assert response_groups[0].suggestion is not None
    assert response_groups[0].suggestion.id == str(suggestion.id)
