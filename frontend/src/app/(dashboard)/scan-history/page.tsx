"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft, ArrowRight, GitCompareArrows, Plus } from "lucide-react"
import { CompareBanner } from "@/components/scan-history/CompareBanner"
import { ScanHistoryFilterBar } from "@/components/scan-history/ScanHistoryFilterBar"
import { ScanHistoryList } from "@/components/scan-history/ScanHistoryList"
import { ScanHistoryMetrics } from "@/components/scan-history/ScanHistoryMetrics"
import { ScanHistoryCompareView } from "@/components/scan-history/ScanHistoryCompareView"
import {
  fetchSavedScans,
  getSavedScanDomain,
  getSavedScanTotalIssues,
  type SavedScanListItem,
} from "@/lib/saved-scans"
import { useAuth } from "@/lib/contexts/AuthContext"

type StatusFilter =
  | "all"
  | "queued"
  | "running"
  | "complete"
  | "error"
  | "cancelled"
type ModeFilter = "all" | "single" | "multi"
type SortBy = "newest" | "oldest" | "most" | "fewest"

const PAGE_SIZE = 10

export default function ScanHistoryPage() {
  const router = useRouter()
  const { token } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all")
  const [sortBy, setSortBy] = useState<SortBy>("newest")
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [isComparing, setIsComparing] = useState(false)
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
      if (!token) {
        setLoading(false)
        return
      }
      const authToken = token

      setLoading(true)
      setError("")

      try {
        const response = await fetchSavedScans(authToken, {
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
  }, [currentPage, deferredSearchQuery, modeFilter, statusFilter, token])

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

  const handleViewReport = (id: string) => {
    router.push(`/reports?scanId=${id}`)
  }

  const cancelCompare = () => {
    setCompareMode(false)
    setIsComparing(false)
    setCompareIds([])
  }

  const goToPreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1))
  }

  const goToNextPage = () => {
    setCurrentPage((page) => Math.min(totalPages, page + 1))
  }

  return (
    <div className="min-w-0 space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground sm:text-[32px]">Scan history</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Review saved scans, revisit findings, and follow progress across your websites.</p>
          <p className="mt-2 text-xs text-muted-foreground">{domainCount} domain{domainCount === 1 ? "" : "s"} in the current results</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={() => compareMode ? cancelCompare() : setCompareMode(true)} aria-pressed={compareMode} className="gap-2"><GitCompareArrows aria-hidden="true" className="size-4" />Compare scans</Button>
          <Button asChild className="gap-2"><Link href="/dashboard"><Plus aria-hidden="true" className="size-4" />New scan</Link></Button>
        </div>
      </header>
      <ScanHistoryMetrics scans={filteredScans} />
      {compareMode && !isComparing && <CompareBanner selectedCount={selectedCount} onCompare={() => setIsComparing(true)} onCancel={cancelCompare} />}
      {isComparing ? <ScanHistoryCompareView compareIds={compareIds} onBack={() => setIsComparing(false)} /> : <>
        <ScanHistoryFilterBar searchQuery={searchQuery} onSearchChange={setSearchQuery} statusFilter={statusFilter} onStatusChange={setStatusFilter} modeFilter={modeFilter} onModeChange={setModeFilter} sortBy={sortBy} onSortChange={setSortBy} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
          <span>Showing <strong className="font-semibold text-foreground">{filteredScans.length}</strong> of {totalScans} scans</span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>
        {error ? <div role="alert" className="rounded-[18px] border border-destructive/20 bg-[var(--high-bg)] px-5 py-4 text-sm text-[var(--high-text)]">{error}</div> : loading ? <div role="status" className="rounded-[18px] border border-border bg-card px-5 py-16 text-center text-sm text-muted-foreground">Loading saved scans...</div> : <ScanHistoryList scans={filteredScans} selectedScanId={selectedScanId} compareMode={compareMode} compareIds={compareIds} onSelect={handleSelect} onCompareToggle={handleCompareToggle} onViewReport={handleViewReport} />}
        <nav aria-label="Scan history pagination" className="flex items-center justify-center gap-4 py-2">
          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={goToPreviousPage} className="gap-2"><ArrowLeft aria-hidden="true" className="size-4" />Previous</Button>
          <span aria-current="page" className="text-sm font-medium">{currentPage} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={goToNextPage} className="gap-2">Next<ArrowRight aria-hidden="true" className="size-4" /></Button>
        </nav>
      </>}
    </div>
  )
}
