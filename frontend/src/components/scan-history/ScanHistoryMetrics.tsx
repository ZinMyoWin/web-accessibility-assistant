import {
  getSavedScanDomain,
  getSavedScanTotalIssues,
  type SavedScanListItem,
} from "@/lib/saved-scans"

interface ScanHistoryMetricsProps {
  scans: SavedScanListItem[]
}

export function ScanHistoryMetrics({ scans }: ScanHistoryMetricsProps) {
  const totalScans = scans.length
  const domains = new Set(scans.map((scan) => getSavedScanDomain(scan))).size

  const completedScans = scans.filter((s) => s.status === "complete")
  const avgIssues =
    completedScans.length > 0
      ? Math.round(
          completedScans.reduce((sum, scan) => sum + getSavedScanTotalIssues(scan), 0) /
            completedScans.length
        )
      : 0

  const totalPages = scans.reduce((sum, scan) => sum + scan.pages_scanned, 0)

  const thisWeekCount = scans.filter((s) => {
    const d = new Date(s.started_at)
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    return d >= weekAgo
  }).length

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-md border-[0.5px] border-border bg-card p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          Total scans
        </div>
        <div className="mt-1 text-[22px] font-medium leading-tight text-foreground">
          {totalScans}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          &uarr; {thisWeekCount} this week
        </div>
      </div>

      <div className="rounded-md border-[0.5px] border-border bg-card p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          Domains scanned
        </div>
        <div className="mt-1 text-[22px] font-medium leading-tight text-foreground">
          {domains}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Unique domains
        </div>
      </div>

      <div className="rounded-md border-[0.5px] border-border bg-card p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          Avg. issues / scan
        </div>
        <div className="mt-1 text-[22px] font-medium leading-tight text-foreground">
          {avgIssues}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Completed scans only
        </div>
      </div>

      <div className="rounded-md border-[0.5px] border-border bg-card p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          Pages analysed
        </div>
        <div className="mt-1 text-[22px] font-medium leading-tight text-foreground">
          {totalPages}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Across all scans
        </div>
      </div>
    </div>
  )
}
