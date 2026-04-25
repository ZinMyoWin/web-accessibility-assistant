"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ReportPageRow } from "@/lib/saved-scans"

export function PagesTab({ pagesData }: { pagesData: ReportPageRow[] }) {
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1fr_80px_60px_60px_60px_60px] gap-2 border-b border-border px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Page URL</span>
        <span className="text-center">Status</span>
        <span className="text-center">Critical</span>
        <span className="text-center">Serious</span>
        <span className="text-center">Moderate</span>
        <span className="text-center">Minor</span>
      </div>

      {pagesData.map((page) => (
        <PageRowItem key={page.url} page={page} />
      ))}
    </div>
  )
}

function PageRowItem({ page }: { page: ReportPageRow }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b-[0.5px] border-border">
      <button
        onClick={() => page.elements.length > 0 && setExpanded(!expanded)}
        className={cn(
          "grid w-full grid-cols-[1fr_80px_60px_60px_60px_60px] items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-muted/50",
          page.elements.length === 0 && "cursor-default"
        )}
      >
        <span className="flex items-center gap-2 text-xs text-foreground">
          {page.elements.length > 0 && (
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={cn("size-2.5 shrink-0 transition-transform", expanded && "rotate-90")}
            >
              <path d="M6 4l4 4-4 4" strokeLinecap="round" />
            </svg>
          )}
          <span className="truncate font-mono text-[11px]">{page.url}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{page.issues} issues</span>
        </span>
        <span className="flex justify-center">
          {page.status === "pass" ? (
            <Badge variant="minor" className="text-[10px]">Pass</Badge>
          ) : (
            <Badge variant="critical" className="text-[10px]">Fail</Badge>
          )}
        </span>
        <SevCount count={page.critical} variant="critical" />
        <SevCount count={page.serious} variant="serious" />
        <SevCount count={page.moderate} variant="moderate" />
        <SevCount count={page.minor} variant="minor" />
      </button>

      {expanded && page.elements.length > 0 && (
        <div className="border-t-[0.5px] border-border bg-muted/30 px-10 py-3">
          <div className="flex flex-col gap-2">
            {page.elements.map((el, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-md border-[0.5px] border-border bg-card p-3"
              >
                <Badge variant={el.severity} className="mt-0.5 shrink-0 text-[10px]">
                  {el.severity}
                </Badge>
                <div className="flex-1">
                  <div className="text-xs font-medium text-foreground">{el.issue}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">WCAG {el.wcag}</div>
                  <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono text-[10px] text-foreground">
                    {el.element}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SevCount({
  count,
  variant,
}: {
  count: number
  variant: "critical" | "serious" | "moderate" | "minor"
}) {
  if (count === 0) {
    return <span className="text-center text-xs text-muted-foreground">-</span>
  }
  return (
    <span className="flex justify-center">
      <Badge variant={variant} className="min-w-[28px] justify-center text-[10px]">
        {count}
      </Badge>
    </span>
  )
}
