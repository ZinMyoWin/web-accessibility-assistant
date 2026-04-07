"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | "complete" | "error"
type ModeFilter = "all" | "single" | "multi"
type SortBy = "newest" | "oldest" | "most" | "fewest"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "complete", label: "Complete" },
  { value: "error", label: "Error" },
]

const MODE_OPTIONS: { value: ModeFilter; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "single", label: "Single page" },
  { value: "multi", label: "Multi-page" },
]

interface ScanHistoryFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  statusFilter: StatusFilter
  onStatusChange: (status: StatusFilter) => void
  modeFilter: ModeFilter
  onModeChange: (mode: ModeFilter) => void
  sortBy: SortBy
  onSortChange: (sort: SortBy) => void
}

export function ScanHistoryFilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  modeFilter,
  onModeChange,
  sortBy,
  onSortChange,
}: ScanHistoryFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border-[0.5px] border-border bg-card p-3">
      {/* Search */}
      <div className="relative min-w-[200px] max-w-[280px] flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="6.5" cy="6.5" r="4" />
          <path d="M10 10l3 3" strokeLinecap="round" />
        </svg>
        <Input
          type="text"
          placeholder="Search by URL or domain\u2026"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 bg-muted pl-8 text-xs"
        />
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Status pills */}
      <span className="text-[11px] text-muted-foreground">Status</span>
      <div className="flex gap-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onStatusChange(opt.value)}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              statusFilter === opt.value
                ? "border-accent-foreground/30 bg-secondary font-medium text-accent-foreground"
                : "border-border bg-transparent text-muted-foreground hover:border-accent-foreground/30 hover:text-accent-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Mode pills */}
      <span className="text-[11px] text-muted-foreground">Mode</span>
      <div className="flex gap-1">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onModeChange(opt.value)}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              modeFilter === opt.value
                ? "border-accent-foreground/30 bg-secondary font-medium text-accent-foreground"
                : "border-border bg-transparent text-muted-foreground hover:border-accent-foreground/30 hover:text-accent-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Sort select */}
      <Select
        value={sortBy}
        onValueChange={(v) => onSortChange(v as SortBy)}
      >
        <SelectTrigger
          size="sm"
          className="h-7 min-w-28 border bg-muted text-[11px] shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="oldest">Oldest first</SelectItem>
          <SelectItem value="most">Most issues</SelectItem>
          <SelectItem value="fewest">Fewest issues</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
