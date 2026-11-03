"use client"

import { useMemo, useState } from "react"
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
    <div className="grid min-w-0 grid-cols-1 items-start xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col border-b border-border bg-background/50 xl:border-b-0 xl:border-r">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="text-sm font-medium text-foreground">Pages in this scan</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {scannedCount} scanned · {skippedCount} skipped
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto lg:max-h-[680px] print:max-h-none print:overflow-visible">
          <div className="p-3">
            {pagesData.map((page) => (
              <button
                key={`${page.status}-${page.url}`}
                type="button"
                aria-pressed={selectedPage?.url === page.url}
                onClick={() => setSelectedUrl(page.url)}
                className={cn(
                  "mb-2 w-full rounded-[10px] border p-3 text-left transition-colors last:mb-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selectedPage?.url === page.url
                    ? "border-primary bg-secondary ring-2 ring-primary/10"
                    : "border-border bg-card hover:border-primary/40"
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <PageStatusBadge page={page} />
                  <span className="text-xs text-muted-foreground">
                    {page.status === "skipped"
                      ? "Previously scanned"
                      : `${page.issues} issue${page.issues !== 1 ? "s" : ""}`}
                  </span>
                </div>
                <div className="break-all text-sm leading-relaxed text-foreground">
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
        </div>
      </aside>

      <section className="min-w-0">
        {selectedPage && <SelectedPageIssues page={selectedPage} />}
      </section>
    </div>
  )
}

function SelectedPageIssues({ page }: { page: ReportPageRow }) {
  return (
    <div className="p-5 sm:p-6">
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
          <h3 className="break-all text-base font-medium leading-relaxed text-foreground">
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
        <div className="rounded-[10px] border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          This page was not scanned in this run because it was already scanned on the same domain and the crawl-memory preference is enabled.
        </div>
      ) : page.elements.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          This page was scanned in this run and no issues were detected for this page.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {page.elements.map((el, i) => (
            <div
              key={i}
              className="rounded-[10px] border border-border bg-card p-5"
            >
              <div className="mb-3 flex items-start gap-3">
                <Badge variant={el.severity} className="mt-0.5 shrink-0 text-xs">
                  {el.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{el.issue}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{el.wcag}</div>
                </div>
              </div>
              <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                {el.element}
              </code>
              <div className="mt-3 rounded-[10px] border border-border bg-muted/60 p-3">
                <div className="text-xs font-semibold text-muted-foreground">
                  Where to find it on this page
                </div>
                <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                  {el.finderHint}
                </p>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  {el.line != null && (
                    <span>
                      Source position: line {el.line}
                      {el.column != null ? `, column ${el.column}` : ""}
                    </span>
                  )}
                  {el.textPreview && <span>Search text: {el.textPreview}</span>}
                  {el.domPath && (
                    <code className="break-all rounded bg-card px-2 py-1 font-mono text-xs text-foreground">
                      DOM path: {el.domPath}
                    </code>
                  )}
                  {el.sourceHint && (
                    <code className="break-all rounded bg-card px-2 py-1 font-mono text-xs text-foreground">
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
    return <Badge variant="moderate" className="text-xs">Skipped</Badge>
  }
  if (page.status === "pass") {
    return <Badge variant="minor" className="text-xs">Scanned · Pass</Badge>
  }
  return <Badge variant="serious" className="text-xs">Scanned · Issues</Badge>
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
      className={cn("min-w-[28px] justify-center text-xs", count === 0 && "opacity-50")}
    >
      {count}
    </Badge>
  )
}
