"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

type IssuePageOption = { url: string; label: string; issueCount: number }
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

export function IssueFilterBar({ searchQuery, onSearchChange, pageFilter, onPageChange, pageOptions, severityFilter, onSeverityChange, categoryFilter, onCategoryChange, categories, sortBy, onSortChange }: IssueFilterBarProps) {
  return <div className="flex flex-col gap-4 border-b border-border p-5">
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input aria-label="Search issues" type="search" placeholder="Search issues, selectors or WCAG references" value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} className="h-11 bg-background/50 pl-10 text-sm" />
    </div>
    <Select value={pageFilter} onValueChange={onPageChange} disabled={pageOptions.length === 0}>
      <SelectTrigger aria-label="Filter by scanned page" className="h-11 min-w-0 w-full bg-card text-sm"><SelectValue placeholder="All scanned pages" /></SelectTrigger>
      <SelectContent className="max-w-[min(760px,calc(100vw-2rem))]">
        <SelectItem value="all">All scanned pages ({pageOptions.length})</SelectItem>
        {pageOptions.map((page) => <SelectItem key={page.url} value={page.url}>{page.label} · {page.issueCount} issue{page.issueCount !== 1 ? "s" : ""}</SelectItem>)}
      </SelectContent>
    </Select>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by severity">
      <span className="mr-1 text-sm text-muted-foreground">Severity</span>
      {["all", "high", "medium", "low"].map((severity) => <button key={severity} type="button" aria-pressed={severityFilter === severity} onClick={() => onSeverityChange(severity)} className={cn("min-h-9 rounded-lg border px-3 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", severityFilter === severity ? "border-primary/30 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-muted")}>{severity}</button>)}
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <Select value={categoryFilter} onValueChange={onCategoryChange}>
        <SelectTrigger aria-label="Filter by category" className="h-10 min-w-0 w-full bg-card text-sm"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={sortBy} onValueChange={(value) => onSortChange(value as IssueFilterBarProps["sortBy"])}>
        <SelectTrigger aria-label="Sort issues" className="h-10 min-w-0 w-full bg-card text-sm"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="severity">Sort: severity</SelectItem><SelectItem value="frequency">Sort: frequency</SelectItem><SelectItem value="category">Sort: category</SelectItem></SelectContent>
      </Select>
    </div>
  </div>
}
