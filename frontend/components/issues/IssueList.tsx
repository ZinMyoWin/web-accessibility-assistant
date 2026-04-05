"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Issue } from "@/lib/mock-issues"

interface IssueListProps {
  issues: Issue[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export function IssueList({ issues, selectedId, onSelect }: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        No issues match your filters.
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
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
                <span>WCAG {issue.wcag}</span>
              </div>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {issue.pages.length} page{issue.pages.length !== 1 ? "s" : ""}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
