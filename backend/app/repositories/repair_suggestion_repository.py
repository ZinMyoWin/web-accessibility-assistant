from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.repair_suggestion import RepairSuggestion
from app.models.scan import ScanIssueRecord, ScanRun
from app.schemas.repair_suggestion import (
    RepairSuggestionExample,
    RepairSuggestionGroupResponse,
    RepairSuggestionResponse,
)


@dataclass(frozen=True)
class RepairSuggestionDraft:
    explanation: str
    impact: str
    recommended_fix: str
    before_code: str | None = None
    after_code: str | None = None
    confidence: str = "medium"
    limitations: str | None = None


@dataclass(frozen=True)
class RepairSuggestionGroup:
    group_key: str
    rule_id: str
    title: str
    severity: str
    recommendation: str
    wcag_criteria: list[str]
    issues: list[ScanIssueRecord]

    @property
    def affected_pages(self) -> list[str]:
        return _unique_values(issue.page_url for issue in self.issues if issue.page_url)

    @property
    def examples(self) -> list[RepairSuggestionExample]:
        return [
            RepairSuggestionExample(
                element=issue.element,
                page_url=issue.page_url,
                source_hint=issue.source_hint,
                dom_path=issue.dom_path,
                text_preview=issue.text_preview,
            )
            for issue in self.issues[:5]
        ]


def list_repair_suggestion_groups(
    session: Session,
    scan_run: ScanRun,
) -> list[RepairSuggestionGroupResponse]:
    suggestions = _suggestions_by_group_key(session, scan_run.user_id)
    return [
        _to_group_response(group, suggestions.get(group.group_key))
        for group in build_repair_suggestion_groups(scan_run)
    ]


def get_repair_suggestion_group(
    scan_run: ScanRun,
    group_key: str,
) -> RepairSuggestionGroup | None:
    for group in build_repair_suggestion_groups(scan_run):
        if group.group_key == group_key:
            return group
    return None


def get_existing_suggestion(
    session: Session,
    *,
    user_id: UUID,
    group_key: str,
) -> RepairSuggestion | None:
    return session.scalar(
        select(RepairSuggestion).where(
            RepairSuggestion.user_id == user_id,
            RepairSuggestion.group_key == group_key,
        )
    )


def save_repair_suggestion(
    session: Session,
    *,
    scan_run: ScanRun,
    group: RepairSuggestionGroup,
    provider: str,
    model: str,
    draft: RepairSuggestionDraft,
) -> RepairSuggestion:
    existing = get_existing_suggestion(
        session,
        user_id=scan_run.user_id,
        group_key=group.group_key,
    )
    suggestion = existing or RepairSuggestion(
        user_id=scan_run.user_id,
        scan_run_id=scan_run.id,
        group_key=group.group_key,
    )

    suggestion.rule_id = group.rule_id
    suggestion.scan_run_id = scan_run.id
    suggestion.title = group.title
    suggestion.severity = group.severity
    suggestion.affected_count = len(group.issues)
    suggestion.affected_pages = group.affected_pages
    suggestion.provider = provider
    suggestion.model = model
    suggestion.explanation = draft.explanation
    suggestion.impact = draft.impact
    suggestion.recommended_fix = draft.recommended_fix
    suggestion.before_code = draft.before_code
    suggestion.after_code = draft.after_code
    suggestion.confidence = draft.confidence
    suggestion.limitations = draft.limitations

    session.add(suggestion)
    session.commit()
    session.refresh(suggestion)
    return suggestion


def build_repair_suggestion_groups(scan_run: ScanRun) -> list[RepairSuggestionGroup]:
    grouped: dict[str, list[ScanIssueRecord]] = {}
    for issue in scan_run.issues:
        grouped.setdefault(_group_key(issue), []).append(issue)

    groups = []
    for group_key, issues in grouped.items():
        first_issue = issues[0]
        groups.append(
            RepairSuggestionGroup(
                group_key=group_key,
                rule_id=first_issue.rule_id,
                title=_group_title(first_issue),
                severity=first_issue.severity,
                recommendation=_group_recommendation(first_issue),
                wcag_criteria=sorted(set(first_issue.wcag_criteria or [])),
                issues=issues,
            )
        )

    return sorted(groups, key=lambda group: (-len(group.issues), group.severity, group.title))


def to_repair_suggestion_response(
    suggestion: RepairSuggestion,
) -> RepairSuggestionResponse:
    return RepairSuggestionResponse(
        id=str(suggestion.id),
        group_key=suggestion.group_key,
        provider=suggestion.provider,
        model=suggestion.model,
        explanation=suggestion.explanation,
        impact=suggestion.impact,
        recommended_fix=suggestion.recommended_fix,
        before_code=suggestion.before_code,
        after_code=suggestion.after_code,
        confidence=suggestion.confidence,
        limitations=suggestion.limitations,
        created_at=suggestion.created_at.isoformat(),
        updated_at=suggestion.updated_at.isoformat(),
    )


def _suggestions_by_group_key(
    session: Session,
    user_id: UUID,
) -> dict[str, RepairSuggestion]:
    suggestions = session.scalars(
        select(RepairSuggestion).where(
            RepairSuggestion.user_id == user_id,
        )
    ).all()
    return {suggestion.group_key: suggestion for suggestion in suggestions}


def _to_group_response(
    group: RepairSuggestionGroup,
    suggestion: RepairSuggestion | None,
) -> RepairSuggestionGroupResponse:
    return RepairSuggestionGroupResponse(
        group_key=group.group_key,
        rule_id=group.rule_id,
        title=group.title,
        severity=group.severity,
        recommendation=group.recommendation,
        wcag_criteria=group.wcag_criteria,
        affected_count=len(group.issues),
        affected_pages=group.affected_pages,
        examples=group.examples,
        suggestion=to_repair_suggestion_response(suggestion) if suggestion else None,
    )


def _group_key(issue: ScanIssueRecord) -> str:
    wcag = ",".join(sorted(issue.wcag_criteria or []))
    raw_key = "|".join(
        [
            issue.rule_id.strip().lower(),
            issue.severity.strip().lower(),
            _normalize_group_text(issue.message),
            wcag.lower(),
            (issue.source or "").strip().lower(),
        ]
    )
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:32]


def _group_title(issue: ScanIssueRecord) -> str:
    message = issue.message.strip()
    if re.search(r"\bfound\s+\d+\s+times\b", message, flags=re.IGNORECASE):
        return re.sub(
            r"\bfound\s+\d+\s+times\b",
            "found multiple times",
            message,
            flags=re.IGNORECASE,
        )
    return message


def _group_recommendation(issue: ScanIssueRecord) -> str:
    rule_id = issue.rule_id.strip().lower()
    if "color-contrast" in rule_id:
        return "Increase foreground and background contrast until the text meets the required WCAG contrast threshold."
    return issue.recommendation


def _normalize_group_text(value: str) -> str:
    normalized = value.strip().lower()
    normalized = re.sub(r"https?://\S+", " ", normalized)
    normalized = re.sub(r"#[0-9a-f]{3,8}\b", " ", normalized)
    normalized = re.sub(r"\b\d+(?:\.\d+)?\b", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _unique_values(values) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique
