import type { AppPreferences } from "@/lib/contexts/PreferencesContext"

/** Test helper: a complete AppPreferences object with optional overrides. */
export function makePreferences(
  overrides: Partial<AppPreferences> = {}
): AppPreferences {
  return {
    ai_provider: "openai",
    ai_model: "gpt-4o",
    active_suggestion_provider: "openai",
    auto_generate_suggestions: true,

    default_scan_mode: "multi",
    default_page_limit: 5,
    crawl_depth: 3,
    request_delay_ms: 250,
    page_timeout_ms: 15000,
    ignored_url_patterns: ["/logout"],
    stay_within_domain: true,
    respect_robots_txt: true,
    skip_previously_scanned_pages: true,

    wcag_standard: "wcag21aa",
    include_best_practices: true,
    fail_on_experimental: false,

    email_notifications: false,
    email_address: null,
    notify_on_scan_complete: true,
    notify_on_scan_failed: true,
    notify_on_high_severity: false,
    notify_score_threshold_enabled: true,
    notify_score_threshold: 70,
    notify_severities: ["high", "medium"],
    weekly_summary: false,

    theme: "light",
    reduced_motion: false,
    high_contrast: false,
    density: "comfortable",
    ...overrides,
  }
}
