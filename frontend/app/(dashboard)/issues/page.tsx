"use client"

import { useState, useMemo } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { IssueFilterBar } from "@/components/issues/IssueFilterBar"
import { IssueCountBar } from "@/components/issues/IssueCountBar"
import { IssueList } from "@/components/issues/IssueList"
import { IssueDetailPanel } from "@/components/issues/IssueDetailPanel"
import { MOCK_ISSUES, type Issue } from "@/lib/mock-issues"

const SEV_ORDER: Record<Issue["severity"], number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
}

export default function IssuesPage() {
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null)
  const [severityFilter, setSeverityFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"severity" | "frequency" | "category">(
    "severity"
  )

  const filteredIssues = useMemo(() => {
    let result = [...MOCK_ISSUES]

    if (severityFilter !== "all") {
      result = result.filter((i) => i.severity === severityFilter)
    }
    if (categoryFilter !== "all") {
      result = result.filter((i) => i.category === categoryFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.selector.toLowerCase().includes(q)
      )
    }

    if (sortBy === "severity") {
      result.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
    } else if (sortBy === "frequency") {
      result.sort((a, b) => b.pages.length - a.pages.length)
    } else {
      result.sort((a, b) => a.category.localeCompare(b.category))
    }

    return result
  }, [severityFilter, categoryFilter, searchQuery, sortBy])

  const counts = useMemo(() => {
    const c = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    filteredIssues.forEach((i) => c[i.severity]++)
    return c
  }, [filteredIssues])

  const selectedIssue = selectedIssueId !== null
    ? MOCK_ISSUES.find((i) => i.id === selectedIssueId) ?? null
    : null

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-3.5">
        <div>
          <h1 className="text-base font-medium text-foreground">Issues</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            example.com &middot; scanned 2 min ago
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select defaultValue="scan-4">
            <SelectTrigger
              size="sm"
              className="h-8 min-w-36 border bg-muted text-xs shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scan-4">Scan #4 &mdash; today</SelectItem>
              <SelectItem value="scan-3">Scan #3 &mdash; yesterday</SelectItem>
              <SelectItem value="scan-2">Scan #2 &mdash; 3 days ago</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <svg
              className="size-3.5"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M3 10v3h10v-3M8 2v8M5 7l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export
          </Button>
        </div>
      </header>

      {/* Body: issue list (1fr) + detail panel (340px) */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_var(--width-detail-panel)]">
        {/* Left column */}
        <div className="flex flex-col overflow-hidden border-r border-border">
          <IssueFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            severityFilter={severityFilter}
            onSeverityChange={setSeverityFilter}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />
          <IssueCountBar total={filteredIssues.length} counts={counts} />
          <IssueList
            issues={filteredIssues}
            selectedId={selectedIssueId}
            onSelect={setSelectedIssueId}
          />
        </div>

        {/* Right column — detail panel */}
        <div className="hidden md:flex md:flex-col md:overflow-hidden">
          <IssueDetailPanel issue={selectedIssue} />
        </div>
      </div>
    </div>
  )
}
