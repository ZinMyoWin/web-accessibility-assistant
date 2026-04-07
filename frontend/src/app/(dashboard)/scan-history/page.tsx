"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScanHistoryMetrics } from "@/components/scan-history/ScanHistoryMetrics"
import { ScanHistoryFilterBar } from "@/components/scan-history/ScanHistoryFilterBar"
import { CompareBanner } from "@/components/scan-history/CompareBanner"
import { ScanHistoryList } from "@/components/scan-history/ScanHistoryList"
import { MOCK_SCANS, type Scan } from "@/lib/mock-scans"

type StatusFilter = "all" | "complete" | "error"
type ModeFilter = "all" | "single" | "multi"
type SortBy = "newest" | "oldest" | "most" | "fewest"

function totalIssues(scan: Scan): number {
  return (
    scan.issues.critical +
    scan.issues.serious +
    scan.issues.moderate +
    scan.issues.minor
  )
}

export default function ScanHistoryPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all")
  const [sortBy, setSortBy] = useState<SortBy>("newest")
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])

  const filteredScans = useMemo(() => {
    let result = [...MOCK_SCANS]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((s) => s.url.toLowerCase().includes(q))
    }

    if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter)
    }

    if (modeFilter !== "all") {
      result = result.filter((s) => s.mode === modeFilter)
    }

    switch (sortBy) {
      case "newest":
        result.sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        )
        break
      case "oldest":
        result.sort(
          (a, b) =>
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        )
        break
      case "most":
        result.sort((a, b) => totalIssues(b) - totalIssues(a))
        break
      case "fewest":
        result.sort((a, b) => totalIssues(a) - totalIssues(b))
        break
    }

    return result
  }, [searchQuery, statusFilter, modeFilter, sortBy])

  const handleCompareToggle = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id)
      if (prev.length >= 2) return prev
      return [...prev, id]
    })
  }

  const cancelCompare = () => {
    setCompareMode(false)
    setCompareIds([])
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Topbar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3">
        <Input
          type="text"
          placeholder="https://example.com"
          className="h-8 max-w-[420px] flex-1 bg-muted text-xs"
        />
        <Select defaultValue="single">
          <SelectTrigger size="sm" className="h-8 border bg-muted text-xs shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single page</SelectItem>
            <SelectItem value="multi">Multi-page</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder="Pages"
          defaultValue={20}
          className="h-8 w-20 bg-muted text-xs"
        />
        <Button size="sm" className="gap-2 text-xs">
          <svg
            className="size-3.5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="8" cy="8" r="5.5" />
            <path
              d="M6.5 5.5L10.5 8L6.5 10.5V5.5Z"
              fill="currentColor"
              stroke="none"
            />
          </svg>
          New Scan
        </Button>
      </header>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Scan History
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              All previous scans across{" "}
              {new Set(MOCK_SCANS.map((s) => s.url.split("/")[0])).size} domains
              &mdash; click any row to view results
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <svg
                className="size-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  d="M3 8h10M8 3l5 5-5 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export all
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => {
                if (compareMode) {
                  cancelCompare()
                } else {
                  setCompareMode(true)
                }
              }}
            >
              <svg
                className="size-3.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 4h10M3 8h7M3 12h4" strokeLinecap="round" />
                <path
                  d="M11 9l2 2-2 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Compare mode
            </Button>
          </div>
        </div>

        {/* Metric cards */}
        <ScanHistoryMetrics scans={MOCK_SCANS} />

        {/* Compare banner */}
        {compareMode && (
          <CompareBanner
            selectedCount={compareIds.length}
            onCompare={() => {
              /* Compare view would open here */
            }}
            onCancel={cancelCompare}
          />
        )}

        {/* Filter bar */}
        <ScanHistoryFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          modeFilter={modeFilter}
          onModeChange={setModeFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Count bar */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-muted-foreground">
            Showing <strong className="text-foreground">{filteredScans.length}</strong> of{" "}
            {MOCK_SCANS.length} scans
          </span>
          <span className="text-[11px] text-muted-foreground">Page 1 of 3</span>
        </div>

        {/* Scan list */}
        <ScanHistoryList
          scans={filteredScans}
          selectedScanId={selectedScanId}
          compareMode={compareMode}
          compareIds={compareIds}
          onSelect={setSelectedScanId}
          onCompareToggle={handleCompareToggle}
        />

        {/* Pagination */}
        <div className="flex items-center justify-center gap-2 py-3">
          <PaginationButton disabled>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </PaginationButton>
          <PaginationButton active>1</PaginationButton>
          <PaginationButton>2</PaginationButton>
          <PaginationButton>3</PaginationButton>
          <span className="px-1 text-xs text-muted-foreground">&hellip;</span>
          <PaginationButton>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </PaginationButton>
        </div>
      </div>
    </div>
  )
}

function PaginationButton({
  children,
  active,
  disabled,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`flex size-[30px] items-center justify-center rounded-sm border-[0.5px] border-border text-xs font-medium transition-all ${
        active
          ? "border-primary bg-primary text-white"
          : "bg-card text-muted-foreground hover:border-accent-foreground/30 hover:text-accent-foreground"
      } ${disabled ? "pointer-events-none opacity-35" : "cursor-pointer"}`}
      disabled={disabled}
    >
      {typeof children === "string" ? (
        children
      ) : (
        <svg className="size-3">{children}</svg>
      )}
    </button>
  )
}
