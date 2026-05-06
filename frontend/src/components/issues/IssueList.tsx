"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { IssueListItem } from "@/lib/saved-scans"

interface IssueListProps {
  issues: IssueListItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  emptyMessage?: string
}

export function IssueList({
  issues,
  selectedId,
  onSelect,
  emptyMessage = "No issues match your filters.",
}: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col">
        {issues.map((issue) => (
          <button
            key={issue.id}
            onClick={() => onSelect(issue.id)}
            className={cn(
              "flex w-full cursor-pointer items-start gap-2.5 border-b border-border px-3 py-3 text-left transition-colors",
              selectedId === issue.id
                ? "border-l-2 border-l-primary bg-secondary"
                : "hover:bg-muted"
            )}
          >
            <Badge
              variant={issue.severity as BadgeVariant}
              className="mt-0.5 shrink-0 text-[10px]"
            >
              {issue.severity}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {issue.title}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{issue.category}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
                  {issue.selector}
                </code>
                <span>{issue.wcag}</span>
              </div>
            </div>
            <span
              className="max-w-40 shrink-0 truncate text-xs text-muted-foreground"
              title={issue.pageUrl}
            >
              {formatIssuePage(issue.pageUrl)}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

function formatIssuePage(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : parsed.host
  } catch {
    return url
  }
}
