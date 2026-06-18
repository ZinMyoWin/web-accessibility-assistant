from __future__ import annotations

import json

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.repositories.repair_suggestion_repository import (
    RepairSuggestionDraft,
    RepairSuggestionGroup,
)


class RepairSuggestionGenerationError(Exception):
    pass


DEFAULT_REPAIR_SUGGESTION_MODELS = {
    "openai": "gpt-4o",
    "deepseek": "deepseek-v4-flash",
}
OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses"
DEEPSEEK_CHAT_COMPLETIONS_API_URL = "https://api.deepseek.com/chat/completions"


class RepairSuggestionAiOutput(BaseModel):
    explanation: str = Field(min_length=1)
    impact: str = Field(min_length=1)
    recommended_fix: str = Field(min_length=1)
    before_code: str | None = None
    after_code: str | None = None
    confidence: str = "medium"
    limitations: str | None = None


REPAIR_SUGGESTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "explanation": {"type": "string"},
        "impact": {"type": "string"},
        "recommended_fix": {"type": "string"},
        "before_code": {"type": "string"},
        "after_code": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "limitations": {"type": "string"},
    },
    "required": [
        "explanation",
        "impact",
        "recommended_fix",
        "before_code",
        "after_code",
        "confidence",
        "limitations",
    ],
}


def generate_grouped_repair_suggestion(
    *,
    provider: str,
    model: str,
    api_key: str,
    group: RepairSuggestionGroup,
) -> RepairSuggestionDraft:
    normalized_provider = normalize_repair_suggestion_provider(provider)
    normalized_model = resolve_repair_suggestion_model(normalized_provider, model)

    if normalized_provider == "openai":
        return _generate_with_openai(model=normalized_model, api_key=api_key, group=group)
    if normalized_provider == "deepseek":
        return _generate_with_deepseek(model=normalized_model, api_key=api_key, group=group)

    raise RepairSuggestionGenerationError(
        f"AI provider '{provider}' is not supported yet."
    )


def normalize_repair_suggestion_provider(provider: str | None) -> str:
    return (provider or "openai").strip().lower()


def resolve_repair_suggestion_model(provider: str, model: str | None) -> str:
    candidate = (model or "").strip()
    if provider == "deepseek":
        return (
            candidate
            if candidate.startswith("deepseek-")
            else DEFAULT_REPAIR_SUGGESTION_MODELS["deepseek"]
        )
    if provider == "openai":
        return (
            candidate
            if candidate and not candidate.startswith("deepseek-")
            else DEFAULT_REPAIR_SUGGESTION_MODELS["openai"]
        )
    return candidate or DEFAULT_REPAIR_SUGGESTION_MODELS["openai"]


def _generate_with_openai(
    *,
    model: str,
    api_key: str,
    group: RepairSuggestionGroup,
) -> RepairSuggestionDraft:
    payload = {
        "model": model,
        "instructions": _system_instructions(),
        "input": _build_prompt(group),
        "text": {
            "format": {
                "type": "json_schema",
                "name": "accessibility_repair_suggestion",
                "strict": True,
                "schema": REPAIR_SUGGESTION_SCHEMA,
            }
        },
        "max_output_tokens": 1200,
    }

    response_body = _post_ai_request(
        url=OPENAI_RESPONSES_API_URL,
        api_key=api_key,
        payload=payload,
    )
    return _draft_from_output_text(_extract_openai_output_text(response_body))


def _generate_with_deepseek(
    *,
    model: str,
    api_key: str,
    group: RepairSuggestionGroup,
) -> RepairSuggestionDraft:
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    f"{_system_instructions()} Return only valid JSON. "
                    "Do not wrap the JSON in Markdown fences."
                ),
            },
            {"role": "user", "content": _build_prompt(group)},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 1200,
        "temperature": 0.2,
        "stream": False,
    }
    if model in {"deepseek-v4-flash", "deepseek-v4-pro"}:
        payload["thinking"] = {"type": "disabled"}

    response_body = _post_ai_request(
        url=DEEPSEEK_CHAT_COMPLETIONS_API_URL,
        api_key=api_key,
        payload=payload,
    )
    return _draft_from_output_text(_extract_chat_completion_output_text(response_body))


def _post_ai_request(*, url: str, api_key: str, payload: dict) -> dict:
    try:
        response = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=45,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = _extract_provider_error(exc.response)
        raise RepairSuggestionGenerationError(detail) from exc
    except httpx.HTTPError as exc:
        raise RepairSuggestionGenerationError(
            "Could not reach the AI provider. Try again later."
        ) from exc
    return response.json()


def _draft_from_output_text(output_text: str | None) -> RepairSuggestionDraft:
    if not output_text:
        raise RepairSuggestionGenerationError("The AI provider returned an empty response.")

    try:
        parsed = RepairSuggestionAiOutput.model_validate_json(_strip_json_fence(output_text))
    except ValidationError as exc:
        raise RepairSuggestionGenerationError(
            "The AI provider returned an invalid repair suggestion."
        ) from exc

    return RepairSuggestionDraft(
        explanation=parsed.explanation,
        impact=parsed.impact,
        recommended_fix=parsed.recommended_fix,
        before_code=_blank_to_none(parsed.before_code),
        after_code=_blank_to_none(parsed.after_code),
        confidence=parsed.confidence,
        limitations=_blank_to_none(parsed.limitations),
    )


def _system_instructions() -> str:
    return (
        "You are an accessibility repair assistant for developers. "
        "Generate one reusable repair suggestion for a recurring WCAG issue pattern. "
        "Do not mention domains, websites, page names, brand names, article types, or scan-specific context. "
        "Use generic language that can apply to future scans with the same issue pattern. "
        "Use the provided representative markup examples only. Do not invent file paths. "
        "Keep the output concise, practical, and reviewable."
    )


def _build_prompt(group: RepairSuggestionGroup) -> str:
    context = {
        "group": {
            "rule_id": group.rule_id,
            "severity": group.severity,
            "title": group.title,
            "recommendation": group.recommendation,
            "wcag_criteria": group.wcag_criteria,
            "affected_count": len(group.issues),
        },
        "representative_examples": [
            {
                "element": example.element,
                "source_hint": example.source_hint,
                "dom_path": example.dom_path,
                "text_preview": example.text_preview,
            }
            for example in group.examples
        ],
    }
    return (
        "Generate one grouped repair suggestion for this accessibility issue pattern.\n"
        "Return JSON matching this shape exactly:\n"
        "{\n"
        '  "explanation": "string",\n'
        '  "impact": "string",\n'
        '  "recommended_fix": "string",\n'
        '  "before_code": "string",\n'
        '  "after_code": "string",\n'
        '  "confidence": "high | medium | low",\n'
        '  "limitations": "string"\n'
        "}\n"
        "Use empty strings for before_code, after_code, or limitations when not applicable.\n\n"
        "Do not include any domain, URL, website, brand, or page-specific wording in the JSON values.\n"
        "Write the suggestion as a reusable fix pattern for future scans with the same issue.\n\n"
        f"{json.dumps(context, indent=2)}"
    )


def _extract_openai_output_text(response_body: dict) -> str | None:
    output_items = response_body.get("output", [])
    for item in output_items:
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                return content.get("text")
    return None


def _extract_chat_completion_output_text(response_body: dict) -> str | None:
    choices = response_body.get("choices", [])
    if not choices:
        return None
    message = choices[0].get("message", {})
    content = message.get("content")
    return content if isinstance(content, str) else None


def _extract_provider_error(response: httpx.Response) -> str:
    try:
        body = response.json()
        message = body.get("error", {}).get("message")
        if message:
            return str(message)
    except ValueError:
        pass
    return "The AI provider rejected the repair suggestion request."


def _strip_json_fence(value: str) -> str:
    stripped = value.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1]).strip()
    return stripped


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
