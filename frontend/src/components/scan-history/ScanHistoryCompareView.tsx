"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fetchSavedScan, type SavedScanDetail, type SavedScanIssue } from "@/lib/saved-scans"
import { cn } from "@/lib/utils"

interface ScanHistoryCompareViewProps {
  compareIds: string[]
  onBack: () => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getIssueKey(issue: SavedScanIssue) {
  return `${issue.rule_id}-${issue.element}`
}

export function ScanHistoryCompareView({ compareIds, onBack }: ScanHistoryCompareViewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [scans, setScans] = useState<[SavedScanDetail, SavedScanDetail] | null>(null)

  useEffect(() => {
    async function load() {
      if (compareIds.length !== 2) {
        setError("Please select exactly 2 scans to compare.")
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const [scan1, scan2] = await Promise.all([
          fetchSavedScan(compareIds[0]),
          fetchSavedScan(compareIds[1]),
        ])

        // Sort older first, newer second
        const sorted = [scan1, scan2].sort(
          (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        ) as [SavedScanDetail, SavedScanDetail]

        setScans(sorted)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load scans for comparison.")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [compareIds])

  if (loading) {
    return (
      <div className="flex animate-in fade-in flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card py-20 text-muted-foreground">
        <svg className="size-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
        <p className="text-sm">Analyzing scan differences...</p>
      </div>
    )
  }

  if (error || !scans) {
    return (
      <div className="rounded-xl border border-red-600/20 bg-[var(--severity-critical-bg)] p-6">
        <p className="text-sm text-[var(--severity-critical-text)]">{error || "Could not compare scans."}</p>
        <Button variant="outline" size="sm" onClick={onBack} className="mt-4">
          Go back
        </Button>
      </div>
    )
  }

  const [oldScan, newScan] = scans

  // Calculate issue diffs
  const oldIssuesMap = new Map(oldScan.issues.map((i) => [getIssueKey(i), i]))
  const newIssuesMap = new Map(newScan.issues.map((i) => [getIssueKey(i), i]))

  const resolvedIssues: SavedScanIssue[] = []
  const newIssues: SavedScanIssue[] = []
  const persistentIssues: SavedScanIssue[] = []

  // Check what was resolved or persisted
  for (const [key, oldIssue] of oldIssuesMap) {
    if (newIssuesMap.has(key)) {
      persistentIssues.push(oldIssue)
    } else {
      resolvedIssues.push(oldIssue)
    }
  }

  // Check what is new
  for (const [key, newIssue] of newIssuesMap) {
    if (!oldIssuesMap.has(key)) {
      newIssues.push(newIssue)
    }
  }

  const scoreDiff = (newScan.score || 0) - (oldScan.score || 0)
  const totalDiff = newScan.summary.total_issues - oldScan.summary.total_issues
  const highDiff = newScan.summary.high - oldScan.summary.high

  return (
    <div className="flex animate-in fade-in flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onBack} className="h-7 px-2 text-xs text-muted-foreground">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-1 size-3">
                <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </Button>
            <h2 className="text-lg font-semibold tracking-tight">Scan Comparison</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Comparing <strong className="text-foreground">{formatDate(oldScan.started_at)}</strong> against{" "}
            <strong className="text-foreground">{formatDate(newScan.started_at)}</strong>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <DiffCard
          title="Score"
          oldValue={oldScan.score || 0}
          newValue={newScan.score || 0}
          diff={scoreDiff}
          invertColors // Positive diff is good
        />
        <DiffCard
          title="Total Issues"
          oldValue={oldScan.summary.total_issues}
          newValue={newScan.summary.total_issues}
          diff={totalDiff}
        />
        <DiffCard
          title="High Severity Issues"
          oldValue={oldScan.summary.high}
          newValue={newScan.summary.high}
          diff={highDiff}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border-[0.5px] border-border bg-card p-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="font-medium text-severity-minor-text">Resolved ({resolvedIssues.length})</h3>
          </div>
          <div className="mt-3 flex max-h-[400px] flex-col gap-3 overflow-y-auto pr-2">
            {resolvedIssues.length === 0 ? (
              <p className="text-xs text-muted-foreground">No issues resolved.</p>
            ) : (
              resolvedIssues.map((i, idx) => (
                <IssueCard key={idx} issue={i} />
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border-[0.5px] border-border bg-card p-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="font-medium text-severity-critical-text">New Issues ({newIssues.length})</h3>
          </div>
          <div className="mt-3 flex max-h-[400px] flex-col gap-3 overflow-y-auto pr-2">
            {newIssues.length === 0 ? (
              <p className="text-xs text-muted-foreground">No new issues introduced.</p>
            ) : (
              newIssues.map((i, idx) => (
                <IssueCard key={idx} issue={i} />
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border-[0.5px] border-border bg-card p-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="font-medium text-muted-foreground">Persistent ({persistentIssues.length})</h3>
          </div>
          <div className="mt-3 flex max-h-[400px] flex-col gap-3 overflow-y-auto pr-2">
            {persistentIssues.length === 0 ? (
              <p className="text-xs text-muted-foreground">No persistent issues.</p>
            ) : (
              persistentIssues.map((i, idx) => (
                <IssueCard key={idx} issue={i} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DiffCard({ title, oldValue, newValue, diff, invertColors = false }: { title: string, oldValue: number, newValue: number, diff: number, invertColors?: boolean }) {
  const isPositive = diff > 0
  const isZero = diff === 0

  const colorClass = isZero
    ? "text-muted-foreground bg-muted"
    : (isPositive && !invertColors) || (!isPositive && invertColors)
    ? "text-severity-critical-text bg-[var(--severity-critical-bg)]"
    : "text-severity-minor-text bg-[var(--severity-minor-bg)]"

  return (
    <div className="rounded-xl border-[0.5px] border-border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-2xl font-semibold tracking-tight">{newValue}</span>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="line-through opacity-70">{oldValue}</span>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3 opacity-50">
            <path d="M4 8h8M8 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", colorClass)}>
            {diff > 0 ? "+" : ""}{diff}
          </span>
        </div>
      </div>
    </div>
  )
}

function IssueCard({ issue }: { issue: SavedScanIssue }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border-[0.5px] border-border/50 bg-muted/30 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-xs font-medium text-foreground">{issue.message}</span>
        <Badge variant={issue.severity} className="shrink-0 px-1.5 py-0 text-[9px] uppercase">
          {issue.severity}
        </Badge>
      </div>
      <code className="line-clamp-1 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
        {issue.element}
      </code>
    </div>
  )
}
