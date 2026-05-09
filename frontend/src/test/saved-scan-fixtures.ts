import type { SavedScanDetail, SavedScanIssue } from "@/lib/saved-scans"

const baseIssue: SavedScanIssue = {
  rule_id: "image-alt",
  severity: "high",
  element: "<img src=\"/hero.png\">",
  message: "Image is missing alternative text.",
  recommendation: "Add meaningful alt text.",
  line: 12,
  column: 4,
  source_hint: "<img src=\"/hero.png\">",
  dom_path: "html > body > main > img:nth-of-type(1)",
  text_preview: "hero.png",
  wcag_criteria: ["WCAG 1.1.1 A"],
  source: "custom",
  page_url: "https://example.com",
}

export function makeSavedScanDetail(
  overrides: Partial<SavedScanDetail> = {}
): SavedScanDetail {
  return {
    id: "scan-1",
    url: "https://example.com",
    requested_url: "https://example.com",
    final_url: "https://example.com",
    status: "complete",
    mode: "multi",
    page_limit: 5,
    pages_scanned: 2,
    pages_skipped: 1,
    scanned_page_urls: ["https://example.com", "https://example.com/contact"],
    skipped_page_urls: ["https://example.com/about"],
    queued_page_urls: [],
    excluded_page_urls: [],
    current_page_url: null,
    worker_attempts: 1,
    max_worker_attempts: 3,
    last_error: null,
    started_at: "2026-05-09T08:00:00.000Z",
    completed_at: "2026-05-09T08:01:00.000Z",
    duration_seconds: 60,
    summary: {
      total_issues: 2,
      high: 1,
      medium: 1,
      low: 0,
    },
    score: 92,
    error_message: null,
    issues: [
      baseIssue,
      {
        ...baseIssue,
        rule_id: "link-name",
        severity: "medium",
        element: "<a href=\"/contact\">click here</a>",
        message: "Link text is vague.",
        recommendation: "Use descriptive link text.",
        dom_path: "html > body > main > a:nth-of-type(1)",
        text_preview: "click here",
        page_url: "https://example.com/contact",
        wcag_criteria: ["WCAG 2.4.4 A"],
      },
    ],
    ...overrides,
  }
}
