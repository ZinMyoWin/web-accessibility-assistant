"use client"

import { Badge } from "@/components/ui/badge"
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} min ${String(s).padStart(2, "0")} s`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const oneDay = 24 * 60 * 60 * 1000

  if (diff < oneDay && d.getDate() === now.getDate()) {
    return `Today ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
  }
  if (diff < 2 * oneDay) {
    const yesterday = new Date(now.getTime() - oneDay)
    if (d.getDate() === yesterday.getDate()) {
      return `Yesterday ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
    }
  }
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
}

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-primary"
  if (score >= 65) return "text-severity-serious-text"
  return "text-severity-critical-text"
}

const clockIcon = (
  <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5V8L9.5 9.5" strokeLinecap="round" />
  </svg>
)

const pageIcon = (
  <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M5 7h6M5 10h4" strokeLinecap="round" />
  </svg>
)

export function ScanHistoryRow({
  scan,
  isSelected,
  compareMode,
  isCompareSelected,
  onSelect,
  onCompareToggle,
  onViewReport,
}: ScanHistoryRowProps) {
  const handleClick = () => {
    if (compareMode) {
      onCompareToggle(scan.id)
    } else {
      onSelect(scan.id)
    }
  }

  const totalIssues = scan.summary.total_issues

  const modeLabel =
    scan.mode === "multi"
      ? `Multi-page \u00b7 ${
          scan.page_limit ? `up to ${scan.page_limit}` : scan.pages_scanned
        } pages`
      : "Single page"

  return (
    <div
      className={cn(
        "group cursor-pointer rounded-md border-[0.5px] border-border bg-card p-4 transition-all hover:border-accent-foreground/30 hover:shadow-sm",
        isSelected && "border-l-2 border-l-primary bg-secondary/30",
      )}
      onClick={handleClick}
    >
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4">
        {/* Status dot or checkbox */}
        <div className="flex items-center justify-center">
          {compareMode ? (
            <div
              className={cn(
                "flex size-4 items-center justify-center rounded border-[1.5px] transition-all",
                isCompareSelected
                  ? "border-primary bg-primary"
                  : "border-border bg-card"
              )}
            >
              {isCompareSelected && (
                <svg className="size-2.5 text-white" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "size-2 rounded-full",
                scan.status === "complete" && "bg-primary",
                scan.status === "error" && "bg-severity-critical-text",
              )}
            />
          )}
        </div>

        {/* Main info */}
        <div className="min-w-0">
          <div className="max-w-[380px] truncate text-[13px] font-medium text-foreground">
            {scan.url}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            {scan.status === "error" ? (
              <span className="flex items-center gap-1 text-[11px] text-severity-critical-text">
                <svg className="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="5.5" />
                  <path d="M8 5v3M8 11h.01" strokeLinecap="round" />
                </svg>
                Failed &mdash; {scan.error_message}
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {clockIcon}
                  {`${formatDate(scan.started_at)}${
                    scan.duration_seconds != null
                      ? ` \u00b7 ${formatDuration(scan.duration_seconds)}`
                      : ""
                  }`}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {pageIcon}
                  {modeLabel}
                </span>
              </>
            )}
            {scan.status === "error" && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {clockIcon}
                {formatDate(scan.started_at)}
              </span>
            )}
          </div>
        </div>

        {/* Issue breakdown */}
        <div className="flex items-center gap-2">
          {scan.status === "complete" && totalIssues > 0 && (
            <>
              <Badge variant="high" className="gap-1 px-2 py-0 text-[11px]">
                <span className="inline-block size-[5px] rounded-full bg-current" />
                {scan.summary.high}
              </Badge>
              <Badge variant="medium" className="gap-1 px-2 py-0 text-[11px]">
                <span className="inline-block size-[5px] rounded-full bg-current" />
                {scan.summary.medium}
              </Badge>
              <Badge variant="low" className="gap-1 px-2 py-0 text-[11px]">
                <span className="inline-block size-[5px] rounded-full bg-current" />
                {scan.summary.low}
              </Badge>
            </>
          )}
          {scan.status === "error" && (
            <span className="text-[11px] text-muted-foreground">
              No results &mdash; scan failed
            </span>
          )}
        </div>

        {/* Score */}
        <div className="min-w-[70px] text-right">
          {scan.status === "complete" && scan.score != null ? (
            <>
              <div className={cn("text-lg font-semibold", scoreColorClass(scan.score))}>
                {scan.score}
              </div>
              <div className="text-[11px] text-muted-foreground">/ 100</div>
            </>
          ) : scan.status === "error" ? (
            <>
              <div className="text-lg font-semibold text-muted-foreground">&mdash;</div>
              <div className="text-[11px] text-muted-foreground">/ 100</div>
            </>
          ) : null}
        </div>

        {/* Row actions */}
        <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {scan.status === "complete" && (
            <>
              <IconButton
                tooltip="Export"
                onClick={(e) => e.stopPropagation()}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 8h10M8 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </IconButton>
              <IconButton
                tooltip="View report"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewReport(scan.id)
                }}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11 2l3 3-8 8H3v-3L11 2z" strokeLinejoin="round" />
                </svg>
              </IconButton>
            </>
          )}
          {scan.status === "error" && (
            <IconButton
              tooltip="Retry scan"
              onClick={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 3v6M8 13h.01M13 8a5 5 0 11-10 0 5 5 0 0110 0z" />
              </svg>
            </IconButton>
          )}
          <IconButton
            tooltip="Delete"
            danger
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 4h10l-1 9H4L3 4zM6 4V3h4v1M6 7v4M10 7v4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
      </div>
    </div>
  )
}

function IconButton({
  children,
  tooltip,
  danger,
  onClick,
}: {
  children: React.ReactNode
  tooltip: string
  danger?: boolean
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <div className="group/tip relative inline-flex">
      <button
        className={cn(
          "flex items-center justify-center rounded-sm border-[0.5px] border-border bg-muted p-1 text-muted-foreground transition-all",
          danger
            ? "hover:border-severity-critical-text/30 hover:bg-severity-critical-bg hover:text-severity-critical-text"
            : "hover:border-accent-foreground/30 hover:bg-secondary hover:text-accent-foreground"
        )}
        onClick={onClick}
      >
        <svg className="size-3.5">{children}</svg>
      </button>
      <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-foreground px-2 py-0.5 text-[11px] text-card opacity-0 transition-opacity group-hover/tip:opacity-100">
        {tooltip}
      </span>
    </div>
  )
}
