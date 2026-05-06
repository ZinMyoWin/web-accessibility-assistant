export type IssueSeverity = "high" | "medium" | "low"

export type ProgressState = "idle" | "active" | "done" | "error"

export type ScanIssue = {
  rule_id: string
  severity: IssueSeverity
  element: string
  message: string
  recommendation: string
  line: number | null
  column: number | null
  source_hint: string | null
  dom_path: string | null
  text_preview: string | null
  screenshot_data_url: string | null
  wcag_criteria: string[] | null
  source: string | null
  page_url: string | null
}

export type ScanSummary = {
  total_issues: number
  high: number
  medium: number
  low: number
}

export type ScanResponse = {
  scan_id?: string | null
  status?: "queued" | "running" | "complete" | "error"
  url: string
  scanned_at: string
  mode: "single" | "multi"
  pages_scanned: number
  pages_skipped: number
  scanned_page_urls: string[]
  skipped_page_urls: string[]
  queued_page_urls: string[]
  excluded_page_urls: string[]
  current_page_url: string | null
  worker_attempts: number
  max_worker_attempts: number
  last_error: string | null
  summary: ScanSummary
  issues: ScanIssue[]
}
