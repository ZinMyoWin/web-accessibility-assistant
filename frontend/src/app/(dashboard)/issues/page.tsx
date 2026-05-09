"use client"

import { useEffect, useMemo, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { IssueCountBar } from "@/components/issues/IssueCountBar"
import { IssueDetailPanel } from "@/components/issues/IssueDetailPanel"
import { IssueFilterBar } from "@/components/issues/IssueFilterBar"
import { IssueList } from "@/components/issues/IssueList"
import {
  fetchSavedScan,
  fetchSavedScans,
  mapSavedScanToIssueList,
  type IssueListItem,
  type SavedScanDetail,
  type SavedScanListItem,
} from "@/lib/saved-scans"
import { useAuth } from "@/lib/contexts/AuthContext"

const SEVERITY_ORDER: Record<IssueListItem["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export default function IssuesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <IssuesPageContent />
    </Suspense>
  )
}

function IssuesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedScanId = searchParams.get("scanId")
  const { token } = useAuth()

  const [scans, setScans] = useState<SavedScanListItem[]>([])
  const [activeScanId, setActiveScanId] = useState<string | null>(requestedScanId)
  const [activeScan, setActiveScan] = useState<SavedScanDetail | null>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [pageFilter, setPageFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"severity" | "frequency" | "category">(
    "severity"
  )
  const [loadingScans, setLoadingScans] = useState(true)
  const [loadingIssues, setLoadingIssues] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadSavedScans() {
      if (!token) {
        setLoadingScans(false)
        return
      }
      const authToken = token

      setLoadingScans(true)
      setError("")

      try {
        const response = await fetchSavedScans(authToken, { limit: 50, offset: 0 })

        if (cancelled) {
          return
        }

        setScans(response.items)

        const defaultScanId =
          requestedScanId && response.items.some((scan) => scan.id === requestedScanId)
            ? requestedScanId
            : response.items[0]?.id ?? null

        setActiveScanId(defaultScanId)
      } catch (loadError) {
        if (cancelled) {
          return
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load saved scans."
        )
        setScans([])
        setActiveScanId(null)
      } finally {
        if (!cancelled) {
          setLoadingScans(false)
        }
      }
    }

    void loadSavedScans()

    return () => {
      cancelled = true
    }
  }, [requestedScanId, token])

  useEffect(() => {
    if (!activeScanId || !token) {
      setActiveScan(null)
      return
    }

    const scanId = activeScanId
    const authToken = token
    let cancelled = false

    async function loadSavedScan() {
      setLoadingIssues(true)
      setError("")

      try {
        const response = await fetchSavedScan(scanId, authToken)

        if (cancelled) {
          return
        }

        setActiveScan(response)
      } catch (loadError) {
        if (cancelled) {
          return
        }

        setActiveScan(null)
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load saved scan."
        )
      } finally {
        if (!cancelled) {
          setLoadingIssues(false)
        }
      }
    }

    void loadSavedScan()

    return () => {
      cancelled = true
    }
  }, [activeScanId, token])

  const issues = useMemo(() => {
    return activeScan ? mapSavedScanToIssueList(activeScan) : []
  }, [activeScan])

  const categories = useMemo(() => {
    return Array.from(new Set(issues.map((issue) => issue.category))).sort()
  }, [issues])

  const pageOptions = useMemo(() => {
    const issueCountByPage = new Map<string, number>()

    issues.forEach((issue) => {
      issueCountByPage.set(issue.pageUrl, (issueCountByPage.get(issue.pageUrl) ?? 0) + 1)
    })

    const scannedPageUrls = activeScan?.scanned_page_urls ?? []
    const issuePageUrls = issues.map((issue) => issue.pageUrl)

    return uniqueUrls([...scannedPageUrls, ...issuePageUrls]).map((url) => ({
      url,
      label: formatPageOption(url),
      issueCount: issueCountByPage.get(url) ?? 0,
    }))
  }, [activeScan?.scanned_page_urls, issues])

  const filteredIssues = useMemo(() => {
    const result = [...issues]

    const normalizedSearch = searchQuery.trim().toLowerCase()

    const visibleIssues = result.filter((issue) => {
      const matchesPage = pageFilter === "all" || issue.pageUrl === pageFilter
      const matchesSeverity =
        severityFilter === "all" || issue.severity === severityFilter
      const matchesCategory =
        categoryFilter === "all" || issue.category === categoryFilter
      const matchesSearch =
        !normalizedSearch ||
        issue.title.toLowerCase().includes(normalizedSearch) ||
        issue.category.toLowerCase().includes(normalizedSearch) ||
        issue.selector.toLowerCase().includes(normalizedSearch) ||
        issue.wcag.toLowerCase().includes(normalizedSearch)

      return matchesPage && matchesSeverity && matchesCategory && matchesSearch
    })

    if (sortBy === "severity") {
      visibleIssues.sort(
        (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      )
    } else if (sortBy === "frequency") {
      visibleIssues.sort((a, b) => b.pages.length - a.pages.length)
    } else {
      visibleIssues.sort((a, b) => a.category.localeCompare(b.category))
    }

    return visibleIssues
  }, [categoryFilter, issues, pageFilter, searchQuery, severityFilter, sortBy])

  useEffect(() => {
    setPageFilter("all")
  }, [activeScanId])

  useEffect(() => {
    if (
      pageFilter !== "all" &&
      !pageOptions.some((page) => page.url === pageFilter)
    ) {
      setPageFilter("all")
    }
  }, [pageFilter, pageOptions])

  useEffect(() => {
    setSelectedIssueId((current) => {
      if (filteredIssues.length === 0) {
        return null
      }
      if (current && filteredIssues.some((issue) => issue.id === current)) {
        return current
      }
      return filteredIssues[0]?.id ?? null
    })
  }, [filteredIssues])

  const counts = useMemo(() => {
    return filteredIssues.reduce(
      (summary, issue) => {
        summary[issue.severity] += 1
        return summary
      },
      { high: 0, medium: 0, low: 0 }
    )
  }, [filteredIssues])

  const selectedIssue =
    selectedIssueId !== null
      ? filteredIssues.find((issue) => issue.id === selectedIssueId) ?? null
      : null

  const activeScanSummary = scans.find((scan) => scan.id === activeScanId) ?? null
  const headerSubtitle = activeScanSummary
    ? `${activeScanSummary.url} | ${formatScanTimestamp(activeScanSummary.started_at)}`
    : "Select a saved scan to inspect its issues."

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-3.5">
        <div>
          <h1 className="text-base font-medium text-foreground">Issues</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{headerSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={activeScanId ?? ""}
            onValueChange={(value) => {
              setActiveScanId(value)
              router.push(`/issues?scanId=${value}`)
            }}
            disabled={loadingScans || scans.length === 0}
          >
            <SelectTrigger
              size="sm"
              className="h-8 min-w-44 border bg-muted text-xs shadow-none"
            >
              <SelectValue placeholder="Select a scan" />
            </SelectTrigger>
            <SelectContent>
              {scans.map((scan) => (
                <SelectItem key={scan.id} value={scan.id}>
                  {formatScanOption(scan)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled>
            <svg className="size-3.5" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 10v3h10v-3M8 2v8M5 7l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!activeScanId}
            onClick={() => activeScanId && router.push(`/reports?scanId=${activeScanId}`)}
          >
            View Report
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_var(--width-detail-panel)]">
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-border">
          <IssueFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            pageFilter={pageFilter}
            onPageChange={setPageFilter}
            pageOptions={pageOptions}
            severityFilter={severityFilter}
            onSeverityChange={setSeverityFilter}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            categories={categories}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />

          <IssueCountBar total={filteredIssues.length} counts={counts} />

          {error ? (
            <div className="m-3 rounded-md border border-red-600/20 bg-[var(--high-bg)] px-4 py-3 text-[13px] text-[var(--high-text)]">
              {error}
            </div>
          ) : loadingScans || loadingIssues ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Loading saved issues...
            </div>
          ) : (
            <IssueList
              issues={filteredIssues}
              selectedId={selectedIssueId}
              onSelect={setSelectedIssueId}
              emptyMessage={
                pageFilter === "all"
                  ? "No issues match your filters."
                  : "No issues found for this scanned page."
              }
            />
          )}
        </div>

        <div className="hidden min-h-0 md:flex md:flex-col md:overflow-hidden">
          <IssueDetailPanel issue={selectedIssue} />
        </div>
      </div>
    </div>
  )
}


function formatScanTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatScanOption(scan: SavedScanListItem): string {
  return `${scan.url} | ${formatScanTimestamp(scan.started_at)}`
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)))
}

function formatPageOption(url: string): string {
  try {
    const parsed = new URL(url)
    const path = `${parsed.pathname}${parsed.search}` || "/"
    return path === "/" ? parsed.host : path
  } catch {
    return url
  }
}

