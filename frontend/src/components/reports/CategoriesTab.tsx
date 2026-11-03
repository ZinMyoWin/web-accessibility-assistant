"use client"

import { useId, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ReportCategoryGroup } from "@/lib/saved-scans"

export function CategoriesTab({ categoriesData }: { categoriesData: ReportCategoryGroup[] }) {
  return (
    <div className="flex flex-col gap-2 p-5">
      {categoriesData.map((cat) => (
        <CategoryGroup key={cat.name} category={cat} />
      ))}
    </div>
  )
}

function CategoryGroup({ category }: { category: ReportCategoryGroup }) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()

  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card">
      <button
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn("size-2.5 shrink-0 transition-transform", expanded && "rotate-90")}
        >
          <path d="M6 4l4 4-4 4" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-sm font-semibold text-foreground">{category.name}</span>
        <div className="flex items-center gap-1.5">
          {category.critical > 0 && <Badge variant="critical" className="text-xs">{category.critical} critical</Badge>}
          {category.serious > 0 && <Badge variant="serious" className="text-xs">{category.serious} serious</Badge>}
          {category.moderate > 0 && <Badge variant="moderate" className="text-xs">{category.moderate} moderate</Badge>}
          {category.minor > 0 && <Badge variant="minor" className="text-xs">{category.minor} minor</Badge>}
        </div>
        <span className="ml-2 text-xs text-muted-foreground">{category.total} issues</span>
      </button>
      {expanded && (
        <div id={contentId} className="border-t border-border bg-background px-4 py-4">
          <div className="text-xs text-muted-foreground">
            Category summary generated from this saved scan.
          </div>
        </div>
      )}
    </div>
  )
}
