"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ExportBar } from "@/components/reports/ExportBar"
import { ReportHeader } from "@/components/reports/ReportHeader"
import { SummaryGrid } from "@/components/reports/SummaryGrid"
import { PagesTab } from "@/components/reports/PagesTab"
import { AiSuggestionsTab } from "@/components/reports/AiSuggestionsTab"
import {
  fetchSavedScan,
  fetchSavedScans,
  mapSavedScanToReportData,
  type ReportViewData,
} from "@/lib/saved-scans"
import { useAuth } from "@/lib/contexts/AuthContext"

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[360px] items-center justify-center px-4 text-sm text-muted-foreground">Loading report...</div>}>
      <ReportsPageContent />
    </Suspense>
  )
}

function ReportsPageContent() {
  const [toast, setToast] = useState<string | null>(null)
  const [report, setReport] = useState<ReportViewData | null>(null)
  const [activeScanId, setActiveScanId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchParams = useSearchParams()
  const requestedScanId = searchParams.get("scanId")
  const { token } = useAuth()

  useEffect(() => {
    let cancelled = false

    async function loadReport() {
      if (!token) {
        setLoading(false)
        return
      }
      const authToken = token

      setLoading(true)
      setError("")

      try {
        let scanId = requestedScanId
        if (!scanId) {
          const latest = await fetchSavedScans(authToken, { limit: 1, offset: 0 })
          scanId = latest.items[0]?.id ?? null
        }

        if (!scanId) {
          if (!cancelled) {
            setReport(null)
            setError("No saved scans are available for reports yet.")
          }
          return
        }

        const scan = await fetchSavedScan(scanId, authToken)
        if (!cancelled) {
          setActiveScanId(scanId)
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
          setActiveScanId(null)
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
  }, [requestedScanId, token])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center px-4 text-sm text-muted-foreground">
        Loading report...
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="m-4 rounded-[18px] border border-border bg-card px-6 py-10 sm:m-6 lg:m-8">
        <h1 className="text-[28px] font-semibold tracking-tight">Your accessibility report</h1>
        <p role="alert" className="mt-3 text-sm leading-relaxed text-muted-foreground">{error || "Report data is unavailable."}</p>
        <Button asChild className="mt-6"><Link href="/dashboard">Run a scan</Link></Button>
      </div>
    )
  }

  const totalCriticalSerious =
    (report.severityBreakdown.find((item) => item.key === "critical")?.count ?? 0) +
    (report.severityBreakdown.find((item) => item.key === "serious")?.count ?? 0)

  return (
    <div className="min-w-0 space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-9 print:space-y-4 print:p-0">
      <header className="flex min-w-0 flex-col justify-between gap-5 xl:flex-row xl:items-start">
        <ReportHeader reportMeta={report.meta} />
        <ExportBar report={report} onToast={showToast} />
      </header>
      <SummaryGrid
        reportMeta={report.meta}
        severityBreakdown={report.severityBreakdown}
        wcagPrinciples={report.wcagPrinciples}
      />

      <Tabs
        defaultValue="pages"
        className="min-w-0 overflow-hidden rounded-[18px] border border-border bg-card print:rounded-none print:border-0"
      >
        <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none border-b border-border bg-card px-3 py-3 print:hidden">
          <TabsTrigger value="pages" className="shrink-0 gap-2 rounded-[10px] px-4 py-3 text-sm">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
              <rect x="3" y="2" width="10" height="12" rx="1.5" /><path d="M5 6h6M5 9h4" strokeLinecap="round" />
            </svg>
            Pages Crawled
          </TabsTrigger>
          <TabsTrigger value="ai" className="shrink-0 gap-2 rounded-[10px] px-4 py-3 text-sm">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
              <path d="M3 8a5 5 0 0110 0M8 3v1M8 12v1M12.2 5.2l-.7.7M4.5 10.5l-.7.7" strokeLinecap="round" />
            </svg>
            AI Repair Suggestions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="min-w-0">
          <PagesTab pagesData={report.pagesData} />
        </TabsContent>
        <TabsContent value="ai" className="min-w-0">
          <AiSuggestionsTab
            scanId={activeScanId}
            totalCriticalSerious={totalCriticalSerious}
          />
        </TabsContent>
      </Tabs>


      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-[200] flex items-center gap-2 rounded-[10px] bg-foreground px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-250 print:hidden ${
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
          <path d="M3 8l4 4 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {toast}
      </div>
    </div>
  )
}
