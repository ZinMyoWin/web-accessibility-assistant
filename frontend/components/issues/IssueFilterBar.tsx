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

const SEVERITIES = ["all", "critical", "serious", "moderate", "minor"] as const
const CATEGORIES = [
  "all",
  "Images",
  "Forms",
  "Links",
  "Contrast",
  "Structure",
  "Landmarks",
] as const

interface IssueFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  severityFilter: string
  onSeverityChange: (severity: string) => void
  categoryFilter: string
  onCategoryChange: (category: string) => void
  sortBy: "severity" | "frequency" | "category"
  onSortChange: (sort: "severity" | "frequency" | "category") => void
}

export function IssueFilterBar({
  searchQuery,
  onSearchChange,
  severityFilter,
  onSeverityChange,
  categoryFilter,
  onCategoryChange,
  sortBy,
  onSortChange,
}: IssueFilterBarProps) {
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
          placeholder="Search issues\u2026"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* Severity pills */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Severity</span>
        <div className="flex flex-wrap gap-1">
          {SEVERITIES.map((sev) => (
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
          {CATEGORIES.map((cat) => (
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
    case "critical":
      return "border-severity-critical bg-severity-critical-text text-white"
    case "serious":
      return "border-severity-serious bg-severity-serious-text text-white"
    case "moderate":
      return "border-severity-moderate bg-severity-moderate-text text-white"
    case "minor":
      return "border-severity-minor bg-severity-minor-text text-white"
    default:
      return "border-primary bg-primary text-primary-foreground"
  }
}
