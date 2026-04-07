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
}

export type ScanSummary = {
  total_issues: number
  high: number
  medium: number
  low: number
}

export type ScanResponse = {
  url: string
  scanned_at: string
  summary: ScanSummary
  issues: ScanIssue[]
}
