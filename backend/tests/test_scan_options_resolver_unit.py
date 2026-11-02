from types import SimpleNamespace

from app import scan_worker
from app.main import serialize_scan_options
from app.schemas.scan import ScanPageRequest
from app.services import axe_scanner
from app.services.page_scanner import ScanOptions
from app.services.scan_options_resolver import resolve_scan_settings


def _prefs(**overrides):
    values = {
        "default_scan_mode": "multi",
        "default_page_limit": 8,
        "crawl_depth": 4,
        "request_delay_ms": 500,
        "page_timeout_ms": 20000,
        "ignored_url_patterns": ["/logout"],
        "stay_within_domain": False,
        "respect_robots_txt": False,
        "skip_previously_scanned_pages": False,
        "wcag_standard": "wcag21aa",
        "include_best_practices": False,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_omitted_request_fields_inherit_saved_preferences():
    request = ScanPageRequest.model_validate({"url": "https://example.com"})

    settings = resolve_scan_settings(request, _prefs())

    assert settings.mode == "multi"
    assert settings.page_limit == 5  # preference value 8 is capped at the crawl limit
    assert settings.crawl_depth == 4
    assert settings.request_delay_ms == 500
    assert settings.page_timeout_ms == 20000
    assert settings.ignored_url_patterns == ("/logout",)
    assert settings.stay_within_domain is False
    assert settings.respect_robots_txt is False
    assert settings.skip_previously_scanned_pages is False
    assert settings.wcag_standard == "wcag21aa"
    assert settings.include_best_practices is False


def test_explicit_request_values_override_preferences():
    request = ScanPageRequest.model_validate(
        {
            "url": "https://example.com",
            "mode": "single",
            "page_limit": 3,
            "crawl_depth": 1,
            "request_delay_ms": 0,
            "page_timeout_ms": 4000,
            "ignored_url_patterns": [],
            "stay_within_domain": True,
            "respect_robots_txt": True,
            "skip_previously_scanned_pages": True,
            "wcag_standard": "wcag22aa",
            "include_best_practices": True,
        }
    )

    settings = resolve_scan_settings(request, _prefs())

    assert settings.mode == "single"
    assert settings.page_limit is None  # single-page scans persist no page limit
    assert settings.crawl_depth == 1
    assert settings.request_delay_ms == 0
    assert settings.page_timeout_ms == 4000
    assert settings.ignored_url_patterns == ()
    assert settings.stay_within_domain is True
    assert settings.respect_robots_txt is True
    assert settings.skip_previously_scanned_pages is True
    assert settings.wcag_standard == "wcag22aa"
    assert settings.include_best_practices is True


def test_multi_page_request_page_limit_is_capped_to_dashboard_bound():
    request = ScanPageRequest.model_validate(
        {"url": "https://example.com", "mode": "multi", "page_limit": 500}
    )

    settings = resolve_scan_settings(request, _prefs())

    assert settings.page_limit == 5


def test_unknown_saved_scan_mode_falls_back_to_single():
    request = ScanPageRequest.model_validate({"url": "https://example.com"})

    settings = resolve_scan_settings(request, _prefs(default_scan_mode="bogus"))

    assert settings.mode == "single"


def test_missing_preferences_uses_resolver_defaults():
    request = ScanPageRequest.model_validate({"url": "https://example.com"})

    settings = resolve_scan_settings(request, SimpleNamespace())

    assert settings.mode == "single"
    assert settings.page_limit is None
    assert settings.crawl_depth == 3
    assert settings.request_delay_ms == 250
    assert settings.page_timeout_ms == 15000
    assert settings.ignored_url_patterns == ()
    assert settings.stay_within_domain is True
    assert settings.respect_robots_txt is True
    assert settings.skip_previously_scanned_pages is True
    assert settings.wcag_standard == "wcag21aa"
    assert settings.include_best_practices is True


def test_axe_tags_for_wcag21aa():
    assert axe_scanner.build_axe_tag_values("wcag21aa") == [
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "best-practice",
    ]


def test_axe_tags_for_wcag22aa():
    assert axe_scanner.build_axe_tag_values("wcag22aa") == [
        "wcag2a",
        "wcag2aa",
        "wcag22a",
        "wcag22aa",
        "best-practice",
    ]


def test_axe_tags_for_wcag22aaa_include_all_aaa_tags():
    assert axe_scanner.build_axe_tag_values("wcag22aaa") == [
        "wcag2a",
        "wcag2aa",
        "wcag2aaa",
        "wcag22a",
        "wcag22aa",
        "wcag22aaa",
        "best-practice",
    ]


def test_axe_tags_for_a_only_standards_exclude_aa_tags():
    assert axe_scanner.build_axe_tag_values("wcag2a") == ["wcag2a", "best-practice"]
    assert axe_scanner.build_axe_tag_values("wcag21a") == [
        "wcag2a",
        "wcag21a",
        "best-practice",
    ]
    assert axe_scanner.build_axe_tag_values("wcag22a") == [
        "wcag2a",
        "wcag22a",
        "best-practice",
    ]


def test_axe_tags_drop_best_practices_when_disabled():
    tags = axe_scanner.build_axe_tag_values(
        "wcag21aa", include_best_practices=False
    )

    assert tags == ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
    assert axe_scanner.build_axe_tag_values("wcag2aa", include_best_practices=False) == [
        "wcag2a",
        "wcag2aa",
    ]


def test_axe_tags_default_standard_preserves_wcag21_coverage():
    assert axe_scanner.build_axe_tag_values() == [
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "best-practice",
    ]


def test_unknown_wcag_standard_falls_back_to_default_coverage():
    assert axe_scanner.build_axe_tag_values("wcag9zz") == [
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "best-practice",
    ]


def test_explicit_wcag2aa_request_still_maps_to_wcag20_tags():
    request = ScanPageRequest.model_validate(
        {"url": "https://example.com", "wcag_standard": "wcag2aa"}
    )

    settings = resolve_scan_settings(request, _prefs())

    assert settings.wcag_standard == "wcag2aa"
    assert axe_scanner.build_axe_tag_values(settings.wcag_standard) == [
        "wcag2a",
        "wcag2aa",
        "best-practice",
    ]


def test_saved_wcag2aa_preference_still_maps_to_wcag20_tags():
    request = ScanPageRequest.model_validate({"url": "https://example.com"})

    settings = resolve_scan_settings(request, _prefs(wcag_standard="wcag2aa"))

    assert settings.wcag_standard == "wcag2aa"
    assert axe_scanner.build_axe_tag_values(settings.wcag_standard) == [
        "wcag2a",
        "wcag2aa",
        "best-practice",
    ]


def test_run_axe_core_forwards_standard_tags_to_axe(monkeypatch):
    evaluated_scripts: list[str] = []

    class FakePage:
        def evaluate(self, script):
            evaluated_scripts.append(script)
            return {"violations": []}

    monkeypatch.setattr(axe_scanner, "_get_axe_script", lambda: "/* axe-core */")

    axe_scanner.run_axe_core(
        FakePage(),
        wcag_standard="wcag22aa",
        include_best_practices=False,
    )

    axe_run_script = evaluated_scripts[1]
    assert '"wcag2a"' in axe_run_script
    assert '"wcag2aa"' in axe_run_script
    assert '"wcag22a"' in axe_run_script
    assert '"wcag22aa"' in axe_run_script
    assert '"wcag21aa"' not in axe_run_script
    assert "best-practice" not in axe_run_script


def test_scan_options_default_wcag_fields_preserve_current_behaviour():
    options = ScanOptions()

    assert options.wcag_standard == "wcag21aa"
    assert options.include_best_practices is True


def test_scan_options_serialization_carries_wcag_preferences():
    options = ScanOptions(
        mode="multi",
        page_limit=5,
        wcag_standard="wcag22aaa",
        include_best_practices=False,
    )

    payload = serialize_scan_options(options)

    assert payload["wcag_standard"] == "wcag22aaa"
    assert payload["include_best_practices"] is False


def test_worker_reconstructs_wcag_preferences_from_payload():
    options = scan_worker._scan_options_from_payload(
        {
            "mode": "multi",
            "wcag_standard": "wcag22aaa",
            "include_best_practices": False,
        }
    )

    assert options.wcag_standard == "wcag22aaa"
    assert options.include_best_practices is False


def test_worker_payload_defaults_to_current_wcag_behaviour():
    options = scan_worker._scan_options_from_payload({"mode": "multi"})

    assert options.wcag_standard == "wcag21aa"
    assert options.include_best_practices is True
