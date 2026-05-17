import { API_BASE_URL, authHeaders } from "@/lib/api"

export type SavedScanStatus = "queued" | "running" | "complete" | "error"
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
  pages_skipped: number
  scanned_page_urls: string[]
  skipped_page_urls: string[]
  queued_page_urls: string[]
  excluded_page_urls: string[]
  current_page_url: string | null
  worker_attempts: number
  max_worker_attempts: number
  last_error: string | null
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
  page_url: string | null
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
  pageUrl: string
  finderHint: string
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
  pagesSkipped: number
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
  selector: string
  line: number | null
  column: number | null
  sourceHint: string | null
  domPath: string | null
  textPreview: string | null
  finderHint: string
}

export type ReportPageRow = {
  url: string
  status: "pass" | "issues" | "skipped"
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

export type RepairSuggestion = {
  id: string
  group_key: string
  provider: string
  model: string
  explanation: string
  impact: string
  recommended_fix: string
  before_code: string | null
  after_code: string | null
  confidence: "high" | "medium" | "low" | string
  limitations: string | null
  created_at: string
  updated_at: string
}

export type RepairSuggestionExample = {
  element: string
  page_url: string | null
  source_hint: string | null
  dom_path: string | null
  text_preview: string | null
}

export type RepairSuggestionGroup = {
  group_key: string
  rule_id: string
  title: string
  severity: IssueSeverity
  recommendation: string
  wcag_criteria: string[]
  affected_count: number
  affected_pages: string[]
  examples: RepairSuggestionExample[]
  suggestion: RepairSuggestion | null
}

export type RepairSuggestionGroupsResponse = {
  scan_id: string
  groups: RepairSuggestionGroup[]
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
  token: string,
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

  const response = await fetch(url.toString(), {
    headers: authHeaders(token),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as SavedScanListResponse
}

export async function fetchSavedScan(
  scanId: string,
  token: string
): Promise<SavedScanDetail> {
  const response = await fetch(`${API_BASE_URL}/scans/${scanId}`, {
    headers: authHeaders(token),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as SavedScanDetail
}

export async function fetchRepairSuggestionGroups(
  scanId: string,
  token: string
): Promise<RepairSuggestionGroupsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/scans/${scanId}/repair-suggestion-groups`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as RepairSuggestionGroupsResponse
}

export async function generateRepairSuggestionGroup(
  scanId: string,
  groupKey: string,
  token: string,
  options: { force?: boolean } = {}
): Promise<RepairSuggestion> {
  const response = await fetch(
    `${API_BASE_URL}/scans/${scanId}/repair-suggestion-groups/${groupKey}/generate`,
    {
      method: "POST",
      headers: authHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ force: options.force ?? false }),
    }
  )

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as RepairSuggestion
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
    const issuePageUrl = issue.page_url || pageUrl
    const selector = issue.dom_path || issue.source_hint || issue.element
    const wcagList = issue.wcag_criteria ?? []

    return {
      id: `${scan.id}-${index + 1}`,
      severity: issue.severity,
      category: deriveIssueCategory(issue),
      title: issue.message,
      selector,
      pages: [issuePageUrl],
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
      pageUrl: issuePageUrl,
      finderHint: buildFinderHint(issue, issuePageUrl),
    }
  })
}

export async function removeScanQueuePage(
  scanId: string,
  pageUrl: string,
  token: string
): Promise<SavedScanDetail> {
  return updateScanQueue(scanId, "remove", pageUrl, token)
}

export async function prioritizeScanQueuePage(
  scanId: string,
  pageUrl: string,
  token: string
): Promise<SavedScanDetail> {
  return updateScanQueue(scanId, "prioritize", pageUrl, token)
}

async function updateScanQueue(
  scanId: string,
  action: "remove" | "prioritize",
  pageUrl: string,
  token: string
): Promise<SavedScanDetail> {
  const response = await fetch(`${API_BASE_URL}/scans/${scanId}/queue/${action}`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ url: pageUrl }),
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as SavedScanDetail
}

export function mapSavedScanToReportData(scan: SavedScanDetail): ReportViewData {
  const pageUrl = scan.final_url || scan.requested_url
  const total = scan.summary.total_issues
  const score = scan.score ?? calculateAccessibilityScore(scan)

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

  const issuesByPage = new Map<string, typeof scan.issues>()
  for (const issue of scan.issues) {
    const issuePageUrl = issue.page_url || pageUrl
    const existingIssues = issuesByPage.get(issuePageUrl) ?? []
    existingIssues.push(issue)
    issuesByPage.set(issuePageUrl, existingIssues)
  }

  const scannedPageUrls = uniqueUrls(
    (scan.scanned_page_urls?.length ? scan.scanned_page_urls : [pageUrl]).concat(
      Array.from(issuesByPage.keys())
    )
  )
  const skippedPageUrls = uniqueUrls(scan.skipped_page_urls ?? []).filter(
    (url) => !scannedPageUrls.includes(url)
  )

  const pagesData: ReportPageRow[] = [
    ...scannedPageUrls.map((issuePageUrl) => {
      const pageIssues = issuesByPage.get(issuePageUrl) ?? []
      const pageCritical = pageIssues.filter((issue) => issue.severity === "high").length
      const pageSerious = pageIssues.filter((issue) => issue.severity === "medium").length
      const pageMinor = pageIssues.filter((issue) => issue.severity === "low").length

      return {
        url: issuePageUrl,
        status: pageIssues.length === 0 ? ("pass" as const) : ("issues" as const),
        issues: pageIssues.length,
        critical: pageCritical,
        serious: pageSerious,
        moderate: 0,
        minor: pageMinor,
        elements: pageIssues.map((issue) => ({
          element: issue.element,
          issue: issue.message,
          severity: toReportSeverity(issue.severity),
          wcag: getIssueWcagReference(issue.wcag_criteria ?? []),
          selector: issue.dom_path || issue.source_hint || issue.element,
          line: issue.line,
          column: issue.column,
          sourceHint: issue.source_hint,
          domPath: issue.dom_path,
          textPreview: issue.text_preview,
          finderHint: buildFinderHint(issue, issuePageUrl),
        })),
      }
    }),
    ...skippedPageUrls.map((skippedUrl) => ({
      url: skippedUrl,
      status: "skipped" as const,
      issues: 0,
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      elements: [],
    })),
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
      score,
      pagesScanned: scan.pages_scanned,
      pagesSkipped: scan.pages_skipped,
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

function calculateAccessibilityScore(scan: SavedScanDetail): number | null {
  if (scan.status === "error") {
    return null
  }

  const pagesScanned = Math.max(scan.pages_scanned, 1)
  const issuePenalty =
    scan.summary.high * 12 + scan.summary.medium * 4 + scan.summary.low * 1
  const normalizedPenalty = issuePenalty / pagesScanned

  return Math.max(0, Math.min(100, Math.round(100 - normalizedPenalty)))
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  return urls.filter((url) => {
    if (!url || seen.has(url)) {
      return false
    }
    seen.add(url)
    return true
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

function buildFinderHint(issue: SavedScanIssue, pageUrl: string): string {
  const location =
    issue.line != null
      ? `line ${issue.line}${issue.column != null ? `, column ${issue.column}` : ""}`
      : null

  if (issue.rule_id === "link-name") {
    const searchText = issue.text_preview || issue.source_hint || issue.element
    return `Open ${pageUrl}, then search for the link text or href: ${searchText}. ${location ? `Source location: ${location}.` : ""}`
  }

  if (issue.rule_id === "image-alt") {
    const searchText = issue.text_preview || issue.source_hint || issue.element
    return `Open ${pageUrl}, then search for the image filename, src, or nearby image element: ${searchText}. ${location ? `Source location: ${location}.` : ""}`
  }

  if (issue.dom_path) {
    return `Open ${pageUrl}, inspect the page, and use this DOM path: ${issue.dom_path}. ${location ? `Source location: ${location}.` : ""}`
  }

  if (location) {
    return `Open ${pageUrl}, then check the fetched HTML around ${location}.`
  }

  return `Open ${pageUrl}, then search for ${issue.text_preview || issue.source_hint || issue.element}.`
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
