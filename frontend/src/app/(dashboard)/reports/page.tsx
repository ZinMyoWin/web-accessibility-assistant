"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ExportBar } from "@/components/reports/ExportBar"
import { ReportHeader } from "@/components/reports/ReportHeader"
import { SummaryGrid } from "@/components/reports/SummaryGrid"
import { PagesTab } from "@/components/reports/PagesTab"
import { CategoriesTab } from "@/components/reports/CategoriesTab"
import { AiSuggestionsTab } from "@/components/reports/AiSuggestionsTab"
import {
  fetchSavedScan,
  fetchSavedScans,
  mapSavedScanToReportData,
  type ReportViewData,
} from "@/lib/saved-scans"

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading report...</div>}>
      <ReportsPageContent />
    </Suspense>
  )
}

function ReportsPageContent() {
  const [toast, setToast] = useState<string | null>(null)
  const [report, setReport] = useState<ReportViewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchParams = useSearchParams()
  const requestedScanId = searchParams.get("scanId")

  useEffect(() => {
    let cancelled = false

    async function loadReport() {
      setLoading(true)
      setError("")

      try {
        let scanId = requestedScanId
        if (!scanId) {
          const latest = await fetchSavedScans({ limit: 1, offset: 0 })
          scanId = latest.items[0]?.id ?? null
        }

        if (!scanId) {
          if (!cancelled) {
            setReport(null)
            setError("No saved scans are available for reports yet.")
          }
          return
        }

        const scan = await fetchSavedScan(scanId)
        if (!cancelled) {
          setReport(mapSavedScanToReportData(scan))
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load report data."
          )
          setReport(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadReport()

    return () => {
      cancelled = true
    }
  }, [requestedScanId])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading report...
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="m-6 rounded-md border border-red-600/20 bg-[var(--high-bg)] px-4 py-3 text-[13px] text-[var(--high-text)]">
        {error || "Report data is unavailable."}
      </div>
    )
  }

  const totalCriticalSerious =
    report.severityBreakdown.find((item) => item.key === "critical")?.count ?? 0 +
    (report.severityBreakdown.find((item) => item.key === "serious")?.count ?? 0)

  return (
    <div className="flex min-h-screen flex-col">
      <ExportBar report={report} onToast={showToast} />
      <ReportHeader reportMeta={report.meta} />
      <SummaryGrid
        reportMeta={report.meta}
        severityBreakdown={report.severityBreakdown}
        wcagPrinciples={report.wcagPrinciples}
      />

      <Tabs
        defaultValue="pages"
        className="mx-6 mt-5 flex-1 overflow-hidden rounded-xl border-[0.5px] border-border bg-card print:mx-0 print:mt-2 print:rounded-none print:border-0"
      >
        <TabsList className="gap-0 border-b border-border bg-card px-0 print:hidden">
          <TabsTrigger value="pages" className="gap-1.5">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
              <rect x="3" y="2" width="10" height="12" rx="1.5" /><path d="M5 6h6M5 9h4" strokeLinecap="round" />
            </svg>
            Pages Crawled
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
              <path d="M2 4h12M2 8h8M2 12h5" strokeLinecap="round" />
            </svg>
            Issues by Category
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
              <path d="M3 8a5 5 0 0110 0M8 3v1M8 12v1M12.2 5.2l-.7.7M4.5 10.5l-.7.7" strokeLinecap="round" />
            </svg>
            AI Repair Suggestions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pages">
          <PagesTab pagesData={report.pagesData} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab categoriesData={report.categoriesData} />
        </TabsContent>
        <TabsContent value="ai">
          <AiSuggestionsTab
            aiSuggestions={report.aiSuggestions}
            totalCriticalSerious={totalCriticalSerious}
          />
        </TabsContent>
      </Tabs>

      <div className="h-6 print:hidden" />

      <div
        className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2 rounded-md bg-[#04342C] px-4 py-3 text-xs font-medium text-white shadow-lg transition-all duration-250 print:hidden ${
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="#5DCAA5" strokeWidth="2" className="size-3.5">
          <path d="M3 8l4 4 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {toast}
      </div>
    </div>
  )
}
