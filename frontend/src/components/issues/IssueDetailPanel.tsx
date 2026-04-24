"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge, type BadgeVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { IssueListItem } from "@/lib/saved-scans"

interface IssueDetailPanelProps {
  issue: IssueListItem | null
}

export function IssueDetailPanel({ issue }: IssueDetailPanelProps) {
  if (!issue) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <svg
          className="size-8 opacity-30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Select an issue to inspect</span>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <Badge
            variant={issue.severity as BadgeVariant}
            className="mt-0.5 shrink-0"
          >
            {issue.severity}
          </Badge>
          <h2 className="text-sm font-medium leading-snug text-foreground">
            {issue.title}
          </h2>
        </div>

        {/* Why it matters */}
        <section>
          <SectionLabel>Why it matters</SectionLabel>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs leading-relaxed text-foreground/80">
              {issue.impact}
            </p>
          </div>
        </section>

        {/* WCAG reference */}
        <section>
          <SectionLabel>WCAG reference</SectionLabel>
          <div className="rounded-lg bg-muted p-3">
            <WcagRow label="Criterion" value={issue.wcag} />
            <WcagRow label="Level" value={issue.level} />
            <WcagRow label="Category" value={issue.category} />
            <WcagRow label="Element" value={issue.element} mono />
            <WcagRow
              label="Selector"
              value={issue.selector}
              mono
            />
            {issue.source && <WcagRow label="Source" value={issue.source} />}
          </div>
        </section>

        {/* Suggested fix */}
        <section>
          <SectionLabel>Suggested fix</SectionLabel>
          <div className="rounded-lg border-l-2 border-l-primary bg-muted p-3">
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-foreground">
              <code>{issue.fix}</code>
            </pre>
          </div>
        </section>

        <section>
          <SectionLabel>Location hints</SectionLabel>
          <div className="rounded-lg bg-muted p-3">
            <WcagRow
              label="Line"
              value={issue.line != null ? String(issue.line) : "Not available"}
            />
            <WcagRow
              label="Column"
              value={issue.column != null ? String(issue.column) : "Not available"}
            />
            <WcagRow
              label="DOM path"
              value={issue.domPath ?? "Not available"}
              mono
            />
            <WcagRow
              label="Source hint"
              value={issue.sourceHint ?? "Not available"}
              mono
            />
            <WcagRow
              label="Text preview"
              value={issue.textPreview ?? "Not available"}
            />
          </div>
        </section>

        {/* Affected pages */}
        <section>
          <SectionLabel>Affected pages</SectionLabel>
          <div className="flex flex-col gap-1">
            {issue.pages.map((page) => (
              <div
                key={page}
                className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs text-foreground/80"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{page}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Action */}
        <Button className="mt-1 w-full" disabled>
          Mark as resolved
        </Button>
      </div>
    </ScrollArea>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

interface WcagRowProps {
  label: string
  value: string
  mono?: boolean
}

function WcagRow({ label, value, mono }: WcagRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 text-xs last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-medium text-foreground ${mono ? "font-mono text-[11px]" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}
