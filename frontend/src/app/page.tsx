"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { EMPTY_SUMMARY } from "@/components/home/constants"
import { IssuesSection } from "@/components/home/IssuesSection"
import { MetricsGrid } from "@/components/home/MetricsGrid"
import { OverviewPanels } from "@/components/home/OverviewPanels"
import { ProgressPanel } from "@/components/home/ProgressPanel"
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
    setTestUrl,
    result,
    error,
    isScanning,
    progress,
    progressText,
    progressState,
    handleScan,
  } = useDashboardScan()

  const [filter, setFilter] = useState<SeverityFilter>("all")
  const [scanMode, setScanMode] = useState<ScanMode>("single")
  const { preferences } = usePreferences()

  useEffect(() => {
    const preferredMode = preferences.default_scan_mode === "multi" ? "multi" : "single"
    setScanMode(preferredMode)
  }, [preferences.default_scan_mode])

  const counts = result?.summary ?? EMPTY_SUMMARY
  const maxSeverityCount = Math.max(counts.high, counts.medium, counts.low, 1)

  const filteredIssues = useMemo(() => {
    return result?.issues.filter((issue) => {
      return filter === "all" || issue.severity === filter
    }) ?? []
  }, [filter, result])

  const categories = useMemo(() => getTopRuleCounts(result), [result])

  return (
    <DashboardShell>
      <div className="flex min-h-full flex-col">
        <ScanToolbar
          url={url}
          scanMode={scanMode}
          isScanning={isScanning}
          onUrlChange={setUrl}
          onScanModeChange={setScanMode}
          onUseTestPage={setTestUrl}
          onScan={handleScan}
        />

        <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
          {error && (
            <div className="rounded-md border border-red-600/20 bg-[var(--high-bg)] px-4 py-3 text-[13px] text-[var(--high-text)]">
              {error}
            </div>
          )}

          <ProgressPanel
            progress={progress}
            progressText={progressText}
            progressState={progressState}
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
        </main>
      </div>
    </DashboardShell>
  )
}
