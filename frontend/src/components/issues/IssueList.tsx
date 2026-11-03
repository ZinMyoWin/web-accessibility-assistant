"use client"

import { useRef, useState } from "react"
import { ArrowRight, Search, X } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { IssueDetailPanel } from "./IssueDetailPanel"
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
  const [detailOpen, setDetailOpen] = useState(false)
  const selectedButton = useRef<HTMLButtonElement | null>(null)
  const selectedIssue = issues.find((issue) => issue.id === selectedId) ?? null

  if (issues.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center text-sm text-muted-foreground">
        <Search className="mb-1 size-7 text-primary/60" aria-hidden="true" />
        <p className="font-medium text-foreground">{emptyMessage}</p>
        <p>Choose another page or adjust the filters above.</p>
      </div>
    )
  }

  return (
    <>
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col p-2">
        {issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            aria-pressed={selectedId === issue.id}
            onClick={(event) => {
              selectedButton.current = event.currentTarget
              onSelect(issue.id)
              if (window.matchMedia("(max-width: 1023px)").matches) setDetailOpen(true)
            }}
            className={cn(
              "mb-1 flex w-full cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selectedId === issue.id
                ? "border-primary/30 bg-brand-50"
                : "border-transparent hover:bg-muted"
            )}
          >
            <Badge
              variant={issue.severity as BadgeVariant}
              className="mt-0.5 shrink-0 text-xs capitalize"
            >
              {issue.severity}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-relaxed text-foreground">
                {issue.title}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{issue.category}</span>
                <code className="max-w-full break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80">
                  {issue.selector}
                </code>
                <span>{issue.wcag}</span>
              </div>
              <span className="mt-2 block truncate text-xs text-muted-foreground" title={issue.pageUrl}>{formatIssuePage(issue.pageUrl)}</span>
            </div>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </ScrollArea>
    <Dialog open={detailOpen && Boolean(selectedIssue)} onOpenChange={setDetailOpen}>
      <DialogContent className="flex h-[92dvh] w-[calc(100vw_-_2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0" onCloseAutoFocus={(event) => { event.preventDefault(); selectedButton.current?.focus() }}>
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4"><DialogTitle>Issue details</DialogTitle><DialogClose asChild><Button variant="ghost" size="icon" aria-label="Close issue details"><X className="size-5" aria-hidden="true" /></Button></DialogClose></div>
        <DialogDescription className="sr-only">Impact, references and suggested fix for the selected issue.</DialogDescription>
        <div className="min-h-0 flex-1"><IssueDetailPanel issue={selectedIssue} /></div>
      </DialogContent>
    </Dialog>
    </>
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
