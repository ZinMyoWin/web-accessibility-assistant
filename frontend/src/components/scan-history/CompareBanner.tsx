"use client"

import { Button } from "@/components/ui/button"

interface CompareBannerProps {
  selectedCount: number
  onCompare: () => void
  onCancel: () => void
}

export function CompareBanner({
  selectedCount,
  onCompare,
  onCancel,
}: CompareBannerProps) {
  return (
    <div className="flex animate-in slide-in-from-top-1 items-center gap-3 rounded-md border border-accent-foreground/30 bg-secondary p-3 text-sm font-medium text-accent-foreground">
      <svg
        className="size-3.5 shrink-0"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 4h10M3 8h7M3 12h4" strokeLinecap="round" />
        <path d="M11 9l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs">
        Select 2 scans to compare issue trends across runs.{" "}
        <strong>{selectedCount} selected.</strong>
      </span>
      <div className="ml-auto flex gap-2">
        <Button
          size="sm"
          className="h-6 px-3 text-[11px]"
          disabled={selectedCount !== 2}
          onClick={onCompare}
        >
          Compare
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 border-accent-foreground/30 px-3 text-[11px] text-accent-foreground"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
