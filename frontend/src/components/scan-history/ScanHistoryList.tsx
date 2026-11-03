"use client"

import { ScanHistoryRow } from "@/components/scan-history/ScanHistoryRow"
import type { SavedScanListItem } from "@/lib/saved-scans"

interface ScanHistoryListProps {
  scans: SavedScanListItem[]
  selectedScanId: string | null
  compareMode: boolean
  compareIds: string[]
  onSelect: (id: string) => void
  onCompareToggle: (id: string) => void
  onViewReport: (id: string) => void
}

export function ScanHistoryList({
  scans,
  selectedScanId,
  compareMode,
  compareIds,
  onSelect,
  onCompareToggle,
  onViewReport,
}: ScanHistoryListProps) {
  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-[18px] border border-dashed border-border bg-card px-5 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
          <svg
            className="size-6 text-muted-foreground"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="6.5" cy="6.5" r="4" />
            <path d="M10 10l3 3" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-sm font-medium text-foreground">No scans found</div>
        <div className="max-w-[280px] text-sm text-muted-foreground">
          Try adjusting your filters or start a new scan to see results here.
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-3">
        {scans.map((scan) => (
          <ScanHistoryRow
            key={scan.id}
            scan={scan}
            isSelected={selectedScanId === scan.id}
            compareMode={compareMode}
            isCompareSelected={compareIds.includes(scan.id)}
            onSelect={onSelect}
            onCompareToggle={onCompareToggle}
            onViewReport={onViewReport}
          />
        ))}
      </div>
    </div>
  )
}
