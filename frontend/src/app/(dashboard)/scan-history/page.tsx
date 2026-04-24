"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CompareBanner } from "@/components/scan-history/CompareBanner"
import { ScanHistoryFilterBar } from "@/components/scan-history/ScanHistoryFilterBar"
import { ScanHistoryList } from "@/components/scan-history/ScanHistoryList"
import { ScanHistoryMetrics } from "@/components/scan-history/ScanHistoryMetrics"
import {
  fetchSavedScans,
  getSavedScanDomain,
  getSavedScanTotalIssues,
  type SavedScanListItem,
} from "@/lib/saved-scans"

type StatusFilter = "all" | "complete" | "error"
type ModeFilter = "all" | "single" | "multi"
type SortBy = "newest" | "oldest" | "most" | "fewest"

const PAGE_SIZE = 10

export default function ScanHistoryPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all")
  const [sortBy, setSortBy] = useState<SortBy>("newest")
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [scans, setScans] = useState<SavedScanListItem[]>([])
  const [totalScans, setTotalScans] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const deferredSearchQuery = useDeferredValue(searchQuery)

  useEffect(() => {
    setCurrentPage(1)
  }, [deferredSearchQuery, statusFilter, modeFilter])

  useEffect(() => {
    let cancelled = false

    async function loadScans() {
      setLoading(true)
      setError("")

      try {
        const response = await fetchSavedScans({
          limit: PAGE_SIZE,
          offset: (currentPage - 1) * PAGE_SIZE,
          status: statusFilter === "all" ? undefined : statusFilter,
          mode: modeFilter === "all" ? undefined : modeFilter,
          q: deferredSearchQuery.trim() || undefined,
        })

        if (cancelled) {
          return
        }

        setScans(response.items)
        setTotalScans(response.total)
        setSelectedScanId((current) => {
          if (response.items.length === 0) {
            return null
          }
          if (current && response.items.some((scan) => scan.id === current)) {
            return current
          }
          return response.items[0]?.id ?? null
        })
      } catch (loadError) {
        if (cancelled) {
          return
        }

        setScans([])
        setTotalScans(0)
        setSelectedScanId(null)
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load saved scans."
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadScans()

    return () => {
      cancelled = true
    }
  }, [currentPage, deferredSearchQuery, modeFilter, statusFilter])

  const filteredScans = useMemo(() => {
    const result = [...scans]

    switch (sortBy) {
      case "newest":
        result.sort(
          (a, b) =>
            new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        )
        break
      case "oldest":
        result.sort(
          (a, b) =>
            new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        )
        break
      case "most":
        result.sort(
          (a, b) => getSavedScanTotalIssues(b) - getSavedScanTotalIssues(a)
        )
        break
      case "fewest":
        result.sort(
          (a, b) => getSavedScanTotalIssues(a) - getSavedScanTotalIssues(b)
        )
        break
    }

    return result
  }, [scans, sortBy])

  const totalPages = Math.max(1, Math.ceil(totalScans / PAGE_SIZE))
  const selectedCount = compareIds.length
  const domainCount = new Set(filteredScans.map((scan) => getSavedScanDomain(scan)))
    .size

  const handleCompareToggle = (id: string) => {
    setCompareIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((item) => item !== id)
      }
      if (previous.length >= 2) {
        return previous
      }
      return [...previous, id]
    })
  }

  const handleSelect = (id: string) => {
    setSelectedScanId(id)
    router.push(`/issues?scanId=${id}`)
  }

  const cancelCompare = () => {
    setCompareMode(false)
    setCompareIds([])
  }

  const goToPreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1))
  }

  const goToNextPage = () => {
    setCurrentPage((page) => Math.min(totalPages, page + 1))
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3">
        <Input
          type="text"
          placeholder="https://example.com"
          className="h-8 max-w-[420px] flex-1 bg-muted text-xs"
          readOnly
        />
        <Select defaultValue="single">
          <SelectTrigger size="sm" className="h-8 border bg-muted text-xs shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single page</SelectItem>
            <SelectItem value="multi" disabled>
              Multi-page
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder="Pages"
          defaultValue={20}
          className="h-8 w-20 bg-muted text-xs"
          readOnly
        />
        <Button
          size="sm"
          className="gap-2 text-xs"
          onClick={() => router.push("/")}
        >
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

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Scan History
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Saved scan runs from {domainCount || 0} domain
              {domainCount === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 text-xs" disabled>
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

        <ScanHistoryMetrics scans={filteredScans} />

        {compareMode && (
          <CompareBanner
            selectedCount={selectedCount}
            onCompare={() => {
              /* Comparison view is not implemented yet. */
            }}
            onCancel={cancelCompare}
          />
        )}

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

        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-muted-foreground">
            Showing{" "}
            <strong className="text-foreground">{filteredScans.length}</strong> of{" "}
            {totalScans} scans
          </span>
          <span className="text-[11px] text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {error ? (
          <div className="rounded-md border border-red-600/20 bg-[var(--high-bg)] px-4 py-3 text-[13px] text-[var(--high-text)]">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            Loading saved scans...
          </div>
        ) : (
          <ScanHistoryList
            scans={filteredScans}
            selectedScanId={selectedScanId}
            compareMode={compareMode}
            compareIds={compareIds}
            onSelect={handleSelect}
            onCompareToggle={handleCompareToggle}
          />
        )}

        <div className="flex items-center justify-center gap-2 py-3">
          <PaginationButton disabled={currentPage === 1} onClick={goToPreviousPage}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </PaginationButton>
          <PaginationButton active>{String(currentPage)}</PaginationButton>
          <PaginationButton
            disabled={currentPage === totalPages}
            onClick={goToNextPage}
          >
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
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={`flex size-[30px] items-center justify-center rounded-sm border-[0.5px] border-border text-xs font-medium transition-all ${
        active
          ? "border-primary bg-primary text-white"
          : "bg-card text-muted-foreground hover:border-accent-foreground/30 hover:text-accent-foreground"
      } ${disabled ? "pointer-events-none opacity-35" : "cursor-pointer"}`}
      disabled={disabled}
      onClick={onClick}
    >
      {typeof children === "string" ? (
        children
      ) : (
        <svg className="size-3">{children}</svg>
      )}
    </button>
  )
}
