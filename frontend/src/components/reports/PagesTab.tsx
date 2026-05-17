"use client"

import { useMemo, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ReportPageRow } from "@/lib/saved-scans"

export function PagesTab({ pagesData }: { pagesData: ReportPageRow[] }) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(pagesData[0]?.url ?? null)
  const selectedPage = useMemo(() => {
    return pagesData.find((page) => page.url === selectedUrl) ?? pagesData[0] ?? null
  }, [pagesData, selectedUrl])

  const scannedCount = pagesData.filter((page) => page.status !== "skipped").length
  const skippedCount = pagesData.filter((page) => page.status === "skipped").length

  if (pagesData.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No page-level scan data is available for this report.
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(260px,0.42fr)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[380px_1fr] lg:grid-rows-none">
      <aside className="flex min-h-0 flex-col border-b border-border bg-muted/20 lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="text-sm font-medium text-foreground">Pages in this scan</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {scannedCount} scanned · {skippedCount} skipped
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-3">
            {pagesData.map((page) => (
              <button
                key={`${page.status}-${page.url}`}
                type="button"
                onClick={() => setSelectedUrl(page.url)}
                className={cn(
                  "mb-2 w-full rounded-md border-[0.5px] p-3 text-left transition-colors last:mb-0",
                  selectedPage?.url === page.url
                    ? "border-primary bg-secondary shadow-[0_0_0_2px_rgba(29,158,117,0.08)]"
                    : "border-border bg-card hover:border-primary/40"
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <PageStatusBadge page={page} />
                  <span className="text-[10px] text-muted-foreground">
                    {page.status === "skipped"
                      ? "Previously scanned"
                      : `${page.issues} issue${page.issues !== 1 ? "s" : ""}`}
                  </span>
                </div>
                <div className="break-all font-mono text-[11px] leading-relaxed text-foreground">
                  {page.url}
                </div>
                {page.status !== "skipped" && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <SevCount count={page.critical} variant="critical" />
                    <SevCount count={page.serious} variant="serious" />
                    <SevCount count={page.moderate} variant="moderate" />
                    <SevCount count={page.minor} variant="minor" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <section className="min-h-0 min-w-0 overflow-hidden">
        <ScrollArea className="h-full min-h-0">
          {selectedPage && <SelectedPageIssues page={selectedPage} />}
        </ScrollArea>
      </section>
    </div>
  )
}

function SelectedPageIssues({ page }: { page: ReportPageRow }) {
  return (
    <div className="p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <PageStatusBadge page={page} />
            <span className="text-xs text-muted-foreground">
              {page.status === "skipped"
                ? "Skipped by crawl memory"
                : `${page.issues} detected issue${page.issues !== 1 ? "s" : ""}`}
            </span>
          </div>
          <h3 className="break-all font-mono text-sm font-medium leading-relaxed text-foreground">
            {page.url}
          </h3>
        </div>
        {page.status !== "skipped" && (
          <div className="flex shrink-0 flex-wrap gap-1">
            <SevCount count={page.critical} variant="critical" />
            <SevCount count={page.serious} variant="serious" />
            <SevCount count={page.moderate} variant="moderate" />
            <SevCount count={page.minor} variant="minor" />
          </div>
        )}
      </div>

      {page.status === "skipped" ? (
        <div className="rounded-md border-[0.5px] border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          This page was not scanned in this run because it was already scanned on the same domain and the crawl-memory preference is enabled.
        </div>
      ) : page.elements.length === 0 ? (
        <div className="rounded-md border-[0.5px] border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          This page was scanned in this run and no issues were detected for this page.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {page.elements.map((el, i) => (
            <div
              key={i}
              className="rounded-md border-[0.5px] border-border bg-card p-4"
            >
              <div className="mb-3 flex items-start gap-3">
                <Badge variant={el.severity} className="mt-0.5 shrink-0 text-[10px]">
                  {el.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{el.issue}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">WCAG {el.wcag}</div>
                </div>
              </div>
              <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-[10px] text-foreground">
                {el.element}
              </code>
              <div className="mt-3 rounded-md border border-border bg-muted/60 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Where to find it on this page
                </div>
                <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                  {el.finderHint}
                </p>
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                  {el.line != null && (
                    <span>
                      Source position: line {el.line}
                      {el.column != null ? `, column ${el.column}` : ""}
                    </span>
                  )}
                  {el.textPreview && <span>Search text: {el.textPreview}</span>}
                  {el.domPath && (
                    <code className="break-all rounded bg-card px-2 py-1 font-mono text-[10px] text-foreground">
                      DOM path: {el.domPath}
                    </code>
                  )}
                  {el.sourceHint && (
                    <code className="break-all rounded bg-card px-2 py-1 font-mono text-[10px] text-foreground">
                      Source snippet: {el.sourceHint}
                    </code>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PageStatusBadge({ page }: { page: ReportPageRow }) {
  if (page.status === "skipped") {
    return <Badge variant="moderate" className="text-[10px]">Skipped</Badge>
  }
  if (page.status === "pass") {
    return <Badge variant="minor" className="text-[10px]">Scanned · Pass</Badge>
  }
  return <Badge variant="serious" className="text-[10px]">Scanned · Issues</Badge>
}

function SevCount({
  count,
  variant,
}: {
  count: number
  variant: "critical" | "serious" | "moderate" | "minor"
}) {
  return (
    <Badge
      variant={variant}
      className={cn("min-w-[28px] justify-center text-[10px]", count === 0 && "opacity-50")}
    >
      {count}
    </Badge>
  )
}
