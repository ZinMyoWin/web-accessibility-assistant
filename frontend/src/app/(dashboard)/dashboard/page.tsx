"use client"

import { useEffect, useMemo, useState } from "react"
import { EMPTY_SUMMARY } from "@/components/home/constants"
import { IssuesSection } from "@/components/home/IssuesSection"
import { MetricsGrid } from "@/components/home/MetricsGrid"
import { OverviewPanels } from "@/components/home/OverviewPanels"
import { ProgressPanel } from "@/components/home/ProgressPanel"
import { QueuePanel } from "@/components/home/QueuePanel"
import { ScanNotifications } from "@/components/home/ScanNotifications"
import { ScanToolbar } from "@/components/home/ScanToolbar"
import type { IssueSeverity } from "@/components/home/types"
import { getTopRuleCounts } from "@/components/home/utils"
import { useDashboardScan } from "@/hooks/useDashboardScan"
import { usePreferences } from "@/lib/contexts/PreferencesContext"

type SeverityFilter = "all" | IssueSeverity
type ScanMode = "single" | "multi"

export default function DashboardPage() {
  const {
    url,
    setUrl,
    result,
    error,
    isScanning,
    isCancelling,
    canCancel,
    progress,
    progressText,
    progressState,
    activeScan,
    queueActionUrl,
    notifications,
    handleScan,
    cancelScan,
    dismissNotification,
    removeQueuedPage,
    prioritizeQueuedPage,
  } = useDashboardScan()

  const [filter, setFilter] = useState<SeverityFilter>("all")
  const [scanMode, setScanMode] = useState<ScanMode>("single")
  const { preferences } = usePreferences()

  useEffect(() => {
    const preferredMode =
      preferences.default_scan_mode === "multi" ? "multi" : "single"
    setScanMode(preferredMode)
  }, [preferences.default_scan_mode])

  const counts = result?.summary ?? EMPTY_SUMMARY
  const maxSeverityCount = Math.max(counts.high, counts.medium, counts.low, 1)

  const filteredIssues = useMemo(() => {
    return (
      result?.issues.filter((issue) => {
        return filter === "all" || issue.severity === filter
      }) ?? []
    )
  }, [filter, result])

  const categories = useMemo(() => getTopRuleCounts(result), [result])

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-1"><h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">Accessibility overview</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">Understand what needs attention. Build a web that everyone can use.</p></header>
      <ScanToolbar
        url={url}
        scanMode={scanMode}
        isScanning={isScanning}
        canCancel={canCancel}
        isCancelling={isCancelling}
        onUrlChange={setUrl}
        onScanModeChange={setScanMode}
        onScan={() => handleScan(scanMode, preferences)}
        onCancel={() => void cancelScan()}
      />

      <div className="flex flex-1 flex-col gap-6">
        {error && (
          <div role="alert" className="rounded-xl border border-red-600/20 bg-[var(--high-bg)] px-5 py-4 text-sm text-[var(--high-text)]">
            {error}
          </div>
        )}

        <ScanNotifications
          notifications={notifications}
          onDismiss={dismissNotification}
          animate={!preferences.reduced_motion}
        />

        <ProgressPanel
          progress={progress}
          progressText={progressText}
          progressState={progressState}
        />

        <QueuePanel
          activeScan={activeScan}
          queueActionUrl={queueActionUrl}
          onRemovePage={removeQueuedPage}
          onPrioritizePage={prioritizeQueuedPage}
        />

        <MetricsGrid counts={counts} />

        <OverviewPanels
          counts={counts}
          maxSeverityCount={maxSeverityCount}
          categories={categories}
          result={result}
        />

        <IssuesSection
          filter={filter}
          result={result}
          issues={filteredIssues}
          onFilterChange={setFilter}
        />
      </div>
    </div>
  )
}
