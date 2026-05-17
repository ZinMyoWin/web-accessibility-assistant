import json
from types import SimpleNamespace

import httpx

from app.repositories.repair_suggestion_repository import RepairSuggestionGroup
from app.services import repair_suggestion_service


def _group() -> RepairSuggestionGroup:
    return RepairSuggestionGroup(
        group_key="group-1",
        rule_id="image-alt",
        title="Image is missing alternative text.",
        severity="high",
        recommendation="Add meaningful alt text to informative images.",
        wcag_criteria=["1.1.1"],
        issues=[
            SimpleNamespace(
                element="<img src='/hero.png'>",
                page_url="https://example.com",
                source_hint="img",
                dom_path="html > body > img",
                text_preview="",
            )
        ],
    )


def _ai_payload() -> str:
    return json.dumps(
        {
            "explanation": "The images need text alternatives.",
            "impact": "Screen reader users miss the image purpose.",
            "recommended_fix": "Add concise alt text to each informative image.",
            "before_code": "<img src='/hero.png'>",
            "after_code": "<img src='/hero.png' alt='Dashboard overview'>",
            "confidence": "high",
            "limitations": "",
        }
    )


def test_deepseek_generation_uses_chat_completions_json_mode(monkeypatch):
    captured: dict[str, object] = {}

    def fake_post(url, *, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["payload"] = json
        captured["timeout"] = timeout
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            request=request,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": _ai_payload(),
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(repair_suggestion_service.httpx, "post", fake_post)

    draft = repair_suggestion_service.generate_grouped_repair_suggestion(
        provider="deepseek",
        model="deepseek-v4-flash",
        api_key="sk-deepseek",
        group=_group(),
    )

    payload = captured["payload"]
    assert captured["url"] == "https://api.deepseek.com/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer sk-deepseek"
    assert payload["model"] == "deepseek-v4-flash"
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["thinking"] == {"type": "disabled"}
    assert "JSON" in payload["messages"][0]["content"]
    assert draft.confidence == "high"
    assert draft.limitations is None


def test_repair_prompt_avoids_page_specific_context():
    prompt = repair_suggestion_service._build_prompt(_group())

    assert "https://example.com" not in prompt
    assert "Do not include any domain, URL, website, brand, or page-specific wording" in prompt


def test_deepseek_provider_uses_deepseek_default_when_saved_model_is_openai():
    model = repair_suggestion_service.resolve_repair_suggestion_model(
        "deepseek",
        "gpt-4o",
    )

    assert model == "deepseek-v4-flash"


def test_openai_provider_uses_openai_default_when_saved_model_is_deepseek():
    model = repair_suggestion_service.resolve_repair_suggestion_model(
        "openai",
        "deepseek-v4-pro",
    )

    assert model == "gpt-4o"
