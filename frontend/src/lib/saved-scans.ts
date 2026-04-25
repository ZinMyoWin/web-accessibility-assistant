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

export type ReportSeverityKey = "critical" | "serious" | "moderate" | "minor"

export type ReportMeta = {
  url: string
  scanDate: string
  scanMode: string
  totalIssues: number
  wcagLevel: string
  status: string
  score: number | null
  pagesScanned: number
  scanDuration: string
  breadcrumb: { label: string; href: string }[]
}

export type ReportSeverityBreakdownItem = {
  key: ReportSeverityKey
  label: string
  count: number
  fraction: number
}

export type ReportWcagPrincipleItem = {
  name: string
  issues: number
  desc: string
}

export type ReportPageIssue = {
  element: string
  issue: string
  severity: ReportSeverityKey
  wcag: string
}

export type ReportPageRow = {
  url: string
  status: "pass" | "fail"
  issues: number
  critical: number
  serious: number
  moderate: number
  minor: number
  elements: ReportPageIssue[]
}

export type ReportCategoryGroup = {
  name: string
  critical: number
  serious: number
  moderate: number
  minor: number
  total: number
}

export type ReportAiSuggestion = {
  title: string
  severity: ReportSeverityKey
  wcag: string
  pages: number
  confidence: "High" | "Medium" | "Low"
  explanation: string
  file: string
  line: number
  removed: string
  added: string
}

export type ReportViewData = {
  meta: ReportMeta
  severityBreakdown: ReportSeverityBreakdownItem[]
  wcagPrinciples: ReportWcagPrincipleItem[]
  pagesData: ReportPageRow[]
  categoriesData: ReportCategoryGroup[]
  aiSuggestions: ReportAiSuggestion[]
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

export function mapSavedScanToReportData(scan: SavedScanDetail): ReportViewData {
  const pageUrl = scan.final_url || scan.requested_url
  const total = scan.summary.total_issues

  const criticalCount = scan.summary.high
  const seriousCount = scan.summary.medium
  const moderateCount = 0
  const minorCount = scan.summary.low

  const severityBreakdown: ReportSeverityBreakdownItem[] = [
    {
      key: "critical",
      label: "Critical",
      count: criticalCount,
      fraction: total > 0 ? criticalCount / total : 0,
    },
    {
      key: "serious",
      label: "Serious",
      count: seriousCount,
      fraction: total > 0 ? seriousCount / total : 0,
    },
    {
      key: "moderate",
      label: "Moderate",
      count: moderateCount,
      fraction: total > 0 ? moderateCount / total : 0,
    },
    {
      key: "minor",
      label: "Minor",
      count: minorCount,
      fraction: total > 0 ? minorCount / total : 0,
    },
  ]

  const pageIssues: ReportPageIssue[] = scan.issues.map((issue) => ({
    element: issue.element,
    issue: issue.message,
    severity: toReportSeverity(issue.severity),
    wcag: getIssueWcagReference(issue.wcag_criteria ?? []),
  }))

  const pagesData: ReportPageRow[] = [
    {
      url: pageUrl,
      status: total === 0 ? "pass" : "fail",
      issues: total,
      critical: criticalCount,
      serious: seriousCount,
      moderate: moderateCount,
      minor: minorCount,
      elements: pageIssues,
    },
  ]

  const wcagPrinciples = buildWcagPrinciples(scan.issues)
  const categoriesData = buildCategories(scan.issues)

  return {
    meta: {
      url: pageUrl,
      scanDate: formatReportDate(scan.started_at),
      scanMode: scan.mode === "multi" ? "Multi-page" : "Single page",
      totalIssues: total,
      wcagLevel: "WCAG 2.1 AA",
      status: scan.status === "error" ? "Scan failed" : total > 0 ? "Action needed" : "Pass",
      score: scan.score,
      pagesScanned: scan.pages_scanned,
      scanDuration: formatDuration(scan.duration_seconds),
      breadcrumb: [
        { label: "Dashboard", href: "/" },
        { label: "Scan History", href: "/scan-history" },
        { label: "Report", href: "#" },
      ],
    },
    severityBreakdown,
    wcagPrinciples,
    pagesData,
    categoriesData,
    aiSuggestions: [],
  }
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

function toReportSeverity(severity: IssueSeverity): ReportSeverityKey {
  if (severity === "high") {
    return "critical"
  }
  if (severity === "medium") {
    return "serious"
  }
  return "minor"
}

function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  })
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) {
    return "-"
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`
}

function buildWcagPrinciples(issues: SavedScanIssue[]): ReportWcagPrincipleItem[] {
  const count = {
    perceivable: 0,
    operable: 0,
    understandable: 0,
    robust: 0,
  }

  for (const issue of issues) {
    const criteria = issue.wcag_criteria ?? []
    const digits = criteria.map((criterion) => criterion.match(/(\d)\./)?.[1]).filter(Boolean) as string[]

    if (digits.includes("1")) {
      count.perceivable += 1
    } else if (digits.includes("2")) {
      count.operable += 1
    } else if (digits.includes("3")) {
      count.understandable += 1
    } else if (digits.includes("4")) {
      count.robust += 1
    } else {
      count.robust += 1
    }
  }

  return [
    { name: "Perceivable", issues: count.perceivable, desc: "Content adaptable and distinguishable" },
    { name: "Operable", issues: count.operable, desc: "Keyboard, timing, seizures, navigation" },
    { name: "Understandable", issues: count.understandable, desc: "Readable, predictable, input assistance" },
    { name: "Robust", issues: count.robust, desc: "Compatible with assistive technologies" },
  ]
}

function buildCategories(issues: SavedScanIssue[]): ReportCategoryGroup[] {
  const categoryMap = new Map<string, ReportCategoryGroup>()

  for (const issue of issues) {
    const name = deriveIssueCategory(issue)
    const existing =
      categoryMap.get(name) ??
      {
        name,
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        total: 0,
      }

    const severity = toReportSeverity(issue.severity)
    existing[severity] += 1
    existing.total += 1
    categoryMap.set(name, existing)
  }

  return Array.from(categoryMap.values()).sort((a, b) => b.total - a.total)
}
