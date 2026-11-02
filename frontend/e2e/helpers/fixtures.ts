/**
 * Deterministic API payloads used by the E2E specs. The shapes mirror the
 * backend contracts consumed by `frontend/src/lib/saved-scans.ts` and
 * `frontend/src/hooks/useDashboardScan.ts`; keeping them here means the specs
 * never need a live FastAPI/PostgreSQL process.
 */

export const E2E_SCAN_URL = "https://example.com"

export const e2eSummary = {
  total_issues: 2,
  high: 1,
  medium: 1,
  low: 0,
}

export const e2eIssues = [
  {
    rule_id: "image-alt",
    severity: "high",
    element: "<img src=\"/hero.png\">",
    message: "Image is missing alternative text.",
    recommendation: "Add meaningful alt text to informative images.",
    line: 12,
    column: 4,
    source_hint: "<img src=\"/hero.png\">",
    dom_path: "html > body > main > img:nth-of-type(1)",
    text_preview: "hero.png",
    screenshot_data_url: null,
    wcag_criteria: ["WCAG 1.1.1 A"],
    source: "custom",
    page_url: E2E_SCAN_URL,
  },
  {
    rule_id: "link-name",
    severity: "medium",
    element: "<a href=\"/contact\">click here</a>",
    message: "Link text is vague.",
    recommendation: "Use descriptive link text.",
    line: 18,
    column: 6,
    source_hint: "<a href=\"/contact\">click here</a>",
    dom_path: "html > body > main > a:nth-of-type(1)",
    text_preview: "click here",
    screenshot_data_url: null,
    wcag_criteria: ["WCAG 2.4.4 A"],
    source: "custom",
    page_url: E2E_SCAN_URL,
  },
]

/** Preferences returned by the stubbed `GET /preferences` call. */
export const preferencesFixture = {
  ai_provider: "openai",
  ai_model: "gpt-4o",
  active_suggestion_provider: "openai",
  auto_generate_suggestions: true,

  default_scan_mode: "single",
  default_page_limit: 5,
  crawl_depth: 3,
  request_delay_ms: 0,
  page_timeout_ms: 15000,
  ignored_url_patterns: ["/logout", "/admin", "*.pdf"],
  stay_within_domain: true,
  respect_robots_txt: true,
  skip_previously_scanned_pages: true,

  wcag_standard: "wcag2aa",
  include_best_practices: true,
  fail_on_experimental: false,

  email_notifications: false,
  email_address: null,
  notify_on_scan_complete: true,
  notify_on_scan_failed: true,
  notify_on_high_severity: false,
  weekly_summary: false,
  // Added by the notification-preference workstream; harmless for older UI.
  notify_score_threshold_enabled: false,
  notify_score_threshold: 70,
  notify_severities: ["high"],

  theme: "light",
  reduced_motion: false,
  high_contrast: false,
  density: "comfortable",

  has_api_key: false,
}

/** Synchronous (non-worker) `POST /scan/page` response. */
export const completedScanFixture = {
  scan_id: "scan-e2e-complete",
  status: "complete",
  url: E2E_SCAN_URL,
  scanned_at: "2026-01-01T00:00:05Z",
  mode: "single",
  pages_scanned: 1,
  pages_skipped: 0,
  scanned_page_urls: [E2E_SCAN_URL],
  skipped_page_urls: [],
  queued_page_urls: [],
  excluded_page_urls: [],
  current_page_url: null,
  worker_attempts: 1,
  max_worker_attempts: 3,
  last_error: null,
  summary: e2eSummary,
  issues: e2eIssues,
}

/** `POST /scan/page` response for a queued multi-page (worker) scan. */
export const queuedScanFixture = {
  ...completedScanFixture,
  scan_id: "scan-e2e-queued",
  status: "queued",
  mode: "multi",
  pages_scanned: 0,
  pages_skipped: 0,
  scanned_page_urls: [],
  summary: { total_issues: 0, high: 0, medium: 0, low: 0 },
  issues: [],
}

/** `GET /scans/{scanId}` poll response while the scan worker is running. */
export const runningSavedScanFixture = {
  id: "scan-e2e-queued",
  url: E2E_SCAN_URL,
  requested_url: E2E_SCAN_URL,
  final_url: E2E_SCAN_URL,
  status: "running",
  mode: "multi",
  page_limit: 5,
  pages_scanned: 1,
  pages_skipped: 0,
  scanned_page_urls: [E2E_SCAN_URL],
  skipped_page_urls: [],
  queued_page_urls: ["https://example.com/about"],
  excluded_page_urls: [],
  current_page_url: E2E_SCAN_URL,
  worker_attempts: 1,
  max_worker_attempts: 3,
  last_error: null,
  started_at: "2026-01-01T00:00:00Z",
  completed_at: null,
  duration_seconds: null,
  summary: e2eSummary,
  score: null,
  error_message: null,
  issues: e2eIssues,
}

/** `POST /scans/{scanId}/cancel` response after a successful cancel request. */
export const cancelledSavedScanFixture = {
  ...runningSavedScanFixture,
  status: "cancelled",
  completed_at: "2026-01-01T00:00:20Z",
  duration_seconds: 20,
  queued_page_urls: [],
  current_page_url: null,
  error_message: "Cancelled by user",
}
