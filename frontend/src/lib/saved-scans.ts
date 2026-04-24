import { API_BASE_URL } from "@/lib/api"

export type SavedScanStatus = "complete" | "error"
export type SavedScanMode = "single" | "multi"
export type IssueSeverity = "high" | "medium" | "low"

export type SavedScanSummary = {
  total_issues: number
  high: number
  medium: number
  low: number
}

export type SavedScanListItem = {
  id: string
  url: string
  requested_url: string
  final_url: string | null
  status: SavedScanStatus
  mode: SavedScanMode
  page_limit: number | null
  pages_scanned: number
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  summary: SavedScanSummary
  score: number | null
  error_message: string | null
}

export type SavedScanListResponse = {
  total: number
  limit: number
  offset: number
  items: SavedScanListItem[]
}

export type SavedScanIssue = {
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
  wcag_criteria: string[] | null
  source: string | null
}

export type SavedScanDetail = SavedScanListItem & {
  issues: SavedScanIssue[]
}

type SavedScanQuery = {
  limit?: number
  offset?: number
  status?: SavedScanStatus
  mode?: SavedScanMode
  q?: string
}

type ApiErrorBody = {
  detail?: string
}

export type IssueListItem = {
  id: string
  severity: IssueSeverity
  category: string
  title: string
  selector: string
  pages: string[]
  wcag: string
  level: string
  impact: string
  fix: string
  element: string
  source: string | null
  line: number | null
  column: number | null
  sourceHint: string | null
  domPath: string | null
  textPreview: string | null
}

export async function fetchSavedScans(
  query: SavedScanQuery = {}
): Promise<SavedScanListResponse> {
  const url = new URL("/scans", API_BASE_URL)

  if (query.limit != null) {
    url.searchParams.set("limit", String(query.limit))
  }
  if (query.offset != null) {
    url.searchParams.set("offset", String(query.offset))
  }
  if (query.status) {
    url.searchParams.set("status", query.status)
  }
  if (query.mode) {
    url.searchParams.set("mode", query.mode)
  }
  if (query.q) {
    url.searchParams.set("q", query.q)
  }

  const response = await fetch(url.toString(), { cache: "no-store" })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as SavedScanListResponse
}

export async function fetchSavedScan(scanId: string): Promise<SavedScanDetail> {
  const response = await fetch(`${API_BASE_URL}/scans/${scanId}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as SavedScanDetail
}

async function getApiErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.detail || "Request failed."
  } catch {
    return "Request failed."
  }
}

export function getSavedScanTotalIssues(scan: SavedScanListItem): number {
  return scan.summary.total_issues
}

export function getSavedScanDomain(scan: SavedScanListItem): string {
  try {
    return new URL(scan.url).hostname
  } catch {
    return scan.url.split("/")[0] || scan.url
  }
}

export function mapSavedScanToIssueList(scan: SavedScanDetail): IssueListItem[] {
  const pageUrl = scan.final_url || scan.requested_url

  return scan.issues.map((issue, index) => {
    const selector = issue.dom_path || issue.source_hint || issue.element
    const wcagList = issue.wcag_criteria ?? []

    return {
      id: `${scan.id}-${index + 1}`,
      severity: issue.severity,
      category: deriveIssueCategory(issue),
      title: issue.message,
      selector,
      pages: [pageUrl],
      wcag: getIssueWcagReference(wcagList),
      level: getIssueWcagLevel(wcagList),
      impact: issue.message,
      fix: issue.recommendation,
      element: issue.element,
      source: issue.source,
      line: issue.line,
      column: issue.column,
      sourceHint: issue.source_hint,
      domPath: issue.dom_path,
      textPreview: issue.text_preview,
    }
  })
}

function deriveIssueCategory(issue: SavedScanIssue): string {
  if (issue.rule_id.includes("image") || issue.rule_id.includes("alt")) {
    return "Images"
  }
  if (
    issue.rule_id.includes("label") ||
    issue.rule_id.includes("button") ||
    issue.rule_id.includes("input") ||
    issue.element.includes("input") ||
    issue.element.includes("button") ||
    issue.element.includes("select")
  ) {
    return "Forms"
  }
  if (issue.rule_id.includes("link") || issue.element.includes("<a")) {
    return "Links"
  }
  if (issue.rule_id.includes("contrast")) {
    return "Contrast"
  }
  if (issue.rule_id.includes("landmark") || issue.rule_id.includes("region")) {
    return "Landmarks"
  }
  return "Structure"
}

function getIssueWcagReference(criteria: string[]): string {
  const numberedCriterion = criteria.find((criterion) =>
    /\d+\.\d+(\.\d+)?/.test(criterion)
  )

  return numberedCriterion ?? "Not specified"
}

function getIssueWcagLevel(criteria: string[]): string {
  if (criteria.some((criterion) => criterion.includes("AAA"))) {
    return "AAA"
  }
  if (criteria.some((criterion) => criterion.includes("AA"))) {
    return "AA"
  }
  if (criteria.some((criterion) => criterion.includes(" A"))) {
    return "A"
  }
  return "Not specified"
}
