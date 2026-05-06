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

type IssuePageOption = {
  url: string
  label: string
  issueCount: number
}

interface IssueFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  pageFilter: string
  onPageChange: (pageUrl: string) => void
  pageOptions: IssuePageOption[]
  severityFilter: string
  onSeverityChange: (severity: string) => void
  categoryFilter: string
  onCategoryChange: (category: string) => void
  categories: string[]
  sortBy: "severity" | "frequency" | "category"
  onSortChange: (sort: "severity" | "frequency" | "category") => void
}

export function IssueFilterBar({
  searchQuery,
  onSearchChange,
  pageFilter,
  onPageChange,
  pageOptions,
  severityFilter,
  onSeverityChange,
  categoryFilter,
  onCategoryChange,
  categories,
  sortBy,
  onSortChange,
}: IssueFilterBarProps) {
  const severityOptions = ["all", "high", "medium", "low"] as const
  const categoryOptions = ["all", ...categories]

  return (
    <div className="flex flex-col gap-2.5 border-b border-border bg-card p-3">
      {/* Search */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="6.5" cy="6.5" r="4" />
          <path d="M11 11l2.5 2.5" strokeLinecap="round" />
        </svg>
        <Input
          type="text"
          placeholder="Search issues..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* Scanned page selector */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">Page</span>
        <Select
          value={pageFilter}
          onValueChange={onPageChange}
          disabled={pageOptions.length === 0}
        >
          <SelectTrigger
            size="sm"
            className="h-8 min-w-0 flex-1 border bg-muted text-xs shadow-none"
          >
            <SelectValue placeholder="All scanned pages" />
          </SelectTrigger>
          <SelectContent className="max-w-[min(760px,calc(100vw-2rem))]">
            <SelectItem value="all">
              All scanned pages ({pageOptions.length})
            </SelectItem>
            {pageOptions.map((page) => (
              <SelectItem key={page.url} value={page.url}>
                {page.label} · {page.issueCount} issue
                {page.issueCount !== 1 ? "s" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Severity pills */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Severity</span>
        <div className="flex flex-wrap gap-1">
          {severityOptions.map((sev) => (
            <button
              key={sev}
              onClick={() => onSeverityChange(sev)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors cursor-pointer",
                severityFilter === sev
                  ? severityActiveStyle(sev)
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Category pills + sort */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Category</span>
        <div className="flex flex-wrap gap-1">
          {categoryOptions.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors cursor-pointer",
                categoryFilter === cat
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Select value={sortBy} onValueChange={(v) => onSortChange(v as "severity" | "frequency" | "category")}>
            <SelectTrigger size="sm" className="h-7 min-w-28 border bg-muted text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="severity">Sort: severity</SelectItem>
              <SelectItem value="frequency">Sort: frequency</SelectItem>
              <SelectItem value="category">Sort: category</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function severityActiveStyle(sev: string): string {
  switch (sev) {
    case "high":
      return "border-[var(--high)] bg-[var(--high)] text-white"
    case "medium":
      return "border-[var(--medium)] bg-[var(--medium)] text-white"
    case "low":
      return "border-[var(--low)] bg-[var(--low)] text-white"
    default:
      return "border-primary bg-primary text-primary-foreground"
  }
}
