"use client"

import { useState } from "react"
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

  return (
    <div className="overflow-hidden rounded-md border-[0.5px] border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
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
        <span className="flex-1 text-xs font-medium text-foreground">{category.name}</span>
        <div className="flex items-center gap-1.5">
          {category.critical > 0 && <Badge variant="critical" className="text-[10px]">{category.critical} critical</Badge>}
          {category.serious > 0 && <Badge variant="serious" className="text-[10px]">{category.serious} serious</Badge>}
          {category.moderate > 0 && <Badge variant="moderate" className="text-[10px]">{category.moderate} moderate</Badge>}
          {category.minor > 0 && <Badge variant="minor" className="text-[10px]">{category.minor} minor</Badge>}
        </div>
        <span className="ml-2 text-[10px] text-muted-foreground">{category.total} issues</span>
      </button>
      {expanded && (
        <div className="border-t-[0.5px] border-border bg-muted/30 px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Category summary generated from this saved scan.
          </div>
        </div>
      )}
    </div>
  )
}
