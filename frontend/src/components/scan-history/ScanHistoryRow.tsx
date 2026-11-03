"use client"

import Link from "next/link"
import { ArrowUpRight, Clock3, FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SavedScanListItem } from "@/lib/saved-scans"

export interface ScanHistoryRowProps {
  scan: SavedScanListItem
  isSelected: boolean
  compareMode: boolean
  isCompareSelected: boolean
  onSelect: (id: string) => void
  onCompareToggle: (id: string) => void
  onViewReport: (id: string) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export function ScanHistoryRow({ scan, isSelected, compareMode, isCompareSelected, onCompareToggle, onViewReport }: ScanHistoryRowProps) {
  const modeLabel = scan.mode === "multi" ? "Multi-page" : "Single page"
  const scoreColor = scan.score != null && scan.score >= 80
    ? "text-primary"
    : scan.score != null && scan.score >= 65
      ? "text-severity-serious-text"
      : "text-severity-critical-text"

  return (
    <article className={cn(
      "min-w-0 rounded-[18px] border border-border bg-card p-5 transition-colors sm:p-6",
      (isSelected || isCompareSelected) && "border-primary/40 bg-secondary/30",
    )}>
      <div className="flex min-w-0 items-start gap-4">
        {compareMode && (
          <input type="checkbox" checked={isCompareSelected} onChange={() => onCompareToggle(scan.id)} aria-label={`Compare ${scan.url}`} className="mt-1 size-5 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant={scan.status === "complete" ? "minor" : scan.status === "error" ? "critical" : "outline"} className="capitalize">{scan.status}</Badge>
            <span className="text-xs text-muted-foreground">{modeLabel}</span>
          </div>
          <Link href={`/issues?scanId=${scan.id}`} className="mt-3 inline-block max-w-full break-all rounded-sm text-[15px] font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{scan.url}</Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Clock3 aria-hidden="true" className="size-3.5" />{formatDate(scan.started_at)}{scan.duration_seconds != null ? ` · ${Math.floor(scan.duration_seconds / 60)}m ${scan.duration_seconds % 60}s` : ""}</span>
            <span className="flex items-center gap-1.5"><FileText aria-hidden="true" className="size-3.5" />{scan.pages_scanned} pages scanned{scan.pages_skipped > 0 ? ` · ${scan.pages_skipped} skipped` : ""}</span>
          </div>
          {scan.error_message && <p className="mt-3 text-sm text-severity-critical-text">{scan.error_message}</p>}
          {(scan.status === "queued" || scan.status === "running") && <p className="mt-3 text-sm text-muted-foreground">{scan.status === "queued" ? "Queued for scan worker" : "Scan in progress"} · Results pending</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {scan.status === "complete" && <>
              <Badge variant="high">{scan.summary.high} high</Badge>
              <Badge variant="medium">{scan.summary.medium} medium</Badge>
              <Badge variant="low">{scan.summary.low} low</Badge>
            </>}
            {scan.status === "cancelled" && <span className="text-sm text-muted-foreground">No results · Scan cancelled</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("text-[28px] font-semibold leading-tight tracking-tight", scan.status === "complete" ? scoreColor : "text-muted-foreground")}>{scan.status === "complete" ? scan.score ?? "—" : "—"}</div>
          <div className="mt-1 text-xs text-muted-foreground">/ 100</div>
        </div>
      </div>
      {scan.status === "complete" && <div className="mt-5 flex justify-end border-t border-border pt-4">
        <Button variant="outline" size="sm" onClick={() => onViewReport(scan.id)} className="gap-2">View report<ArrowUpRight aria-hidden="true" className="size-4" /></Button>
      </div>}
    </article>
  )
}
