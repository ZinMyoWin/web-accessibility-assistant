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

type StatusFilter =
  | "all"
  | "queued"
  | "running"
  | "complete"
  | "error"
  | "cancelled"
type ModeFilter = "all" | "single" | "multi"
type SortBy = "newest" | "oldest" | "most" | "fewest"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "complete", label: "Complete" },
  { value: "error", label: "Error" },
  { value: "cancelled", label: "Cancelled" },
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
    <div className="flex min-w-0 flex-col gap-5 rounded-[18px] border border-border bg-card p-5">
      {/* Search */}
      <div className="relative min-w-0 w-full">
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
          type="search"
          aria-label="Search scans by URL or domain"
          placeholder="Search by URL or domain\u2026"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-11 bg-background pl-10 text-sm"
        />
      </div>

      {/* Status pills */}
      <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Scan status"><span className="mr-2 text-sm font-medium">Status</span>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onStatusChange(opt.value)}
            aria-pressed={statusFilter === opt.value}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-[10px] border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              statusFilter === opt.value
                ? "border-accent-foreground/30 bg-secondary font-medium text-accent-foreground"
                : "border-border bg-transparent text-muted-foreground hover:border-accent-foreground/30 hover:text-accent-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Mode pills */}
      <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Scan mode"><span className="mr-2 text-sm font-medium">Mode</span>
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onModeChange(opt.value)}
            aria-pressed={modeFilter === opt.value}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-[10px] border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              modeFilter === opt.value
                ? "border-accent-foreground/30 bg-secondary font-medium text-accent-foreground"
                : "border-border bg-transparent text-muted-foreground hover:border-accent-foreground/30 hover:text-accent-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sort select */}
      <Select
        value={sortBy}
        onValueChange={(v) => onSortChange(v as SortBy)}
      >
        <SelectTrigger
          aria-label="Sort saved scans"
          className="h-10 w-full border bg-background text-sm shadow-none sm:w-44"
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
