import { severityBarClass } from "@/components/home/constants"
import { formatRuleId } from "@/components/home/utils"
import type { ScanResponse, ScanSummary } from "@/components/home/types"
import Link from "next/link"
import { Button } from "@/components/ui/button"

type OverviewPanelsProps = {
  counts: ScanSummary
  maxSeverityCount: number
  categories: [string, number][]
  result: ScanResponse | null
}

export function OverviewPanels({
  counts,
  maxSeverityCount,
  categories,
  result,
}: OverviewPanelsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-3.5 flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Severity Breakdown
          </h2>
          <span className="text-sm text-muted-foreground">
            {counts.total_issues} issue{counts.total_issues !== 1 ? "s" : ""}
          </span>
        </div>

        {(["high", "medium", "low"] as const).map((severity) => (
          <div
            key={severity}
            className="mb-2.5 flex items-center gap-2.5 last:mb-0"
          >
            <span className="w-[72px] text-sm capitalize text-muted-foreground">
              {severity}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${severityBarClass[severity]}`}
                style={{ width: `${(counts[severity] / maxSeverityCount) * 100}%` }}
              />
            </div>
            <span className="w-7 text-right text-sm font-semibold text-foreground">
              {counts[severity]}
            </span>
          </div>
        ))}

        <div className="mt-6 border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Top Rules
          </h3>
          {categories.length > 0 ? (
            categories.map(([name, count]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-4 py-2 text-sm text-muted-foreground"
              >
                <span>{formatRuleId(name)}</span>
                <span className="font-semibold text-foreground">{count}</span>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm leading-relaxed text-muted-foreground">Your most common accessibility issues will appear after a scan.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Scan Details
          </h2>
        </div>
        {result ? (
          <>
            {[
              ["URL", result.url],
              ["Mode", result.mode === "multi" ? "Multi-page" : "Single page"],
              ["Pages scanned", String(result.pages_scanned)],
              ["Pages skipped", String(result.pages_skipped)],
              ["Scanned at", new Date(result.scanned_at).toLocaleString()],
              ["Total issues", String(result.summary.total_issues)],
              ["High", String(result.summary.high)],
              ["Medium", String(result.summary.medium)],
              ["Low", String(result.summary.low)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 border-b border-border py-3 text-sm last:border-b-0"
              >
                <span className="shrink-0 text-muted-foreground">{label}</span>
                <span className="max-w-[65%] break-all text-right font-medium text-foreground">
                  {value}
                </span>
              </div>
            ))}
            {(result.scanned_page_urls.length > 0 || result.skipped_page_urls.length > 0) && (
              <div className="mt-3 rounded-md border-[0.5px] border-border bg-muted/40 p-3">
                <div className="mb-3 text-sm font-semibold text-foreground">
                  Page coverage
                </div>
                <CoverageList
                  label="Scanned pages"
                  emptyLabel="No scanned pages reported yet."
                  urls={result.scanned_page_urls}
                />
                <CoverageList
                  label="Skipped pages"
                  emptyLabel="No pages were skipped in this run."
                  urls={result.skipped_page_urls}
                />
              </div>
            )}
            {result.scan_id && (
              <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5">
                <Button asChild variant="outline" className="h-11 flex-1 text-sm">
                  <Link href={`/issues?scanId=${result.scan_id}`} target="_blank">
                    View Detailed Issues
                  </Link>
                </Button>
                <Button asChild className="h-11 flex-1 text-sm">
                  <Link href={`/reports?scanId=${result.scan_id}`}>
                    Open Report
                  </Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl bg-background/70 p-6 text-center text-sm leading-relaxed text-muted-foreground">
            Enter a URL above and click Scan. Your page coverage and scan details will be saved here.
          </div>
        )}
      </section>
    </div>
  )
}

function CoverageList({
  label,
  emptyLabel,
  urls,
}: {
  label: string
  emptyLabel: string
  urls: string[]
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-foreground">
        <span>{label}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {urls.length}
        </span>
      </div>
      {urls.length > 0 ? (
        <div className="flex max-h-24 flex-col gap-1 overflow-y-auto rounded-sm bg-background/50 p-2">
          {urls.map((pageUrl) => (
            <span
              key={`${label}-${pageUrl}`}
              className="break-all text-xs leading-relaxed text-muted-foreground"
              title={pageUrl}
            >
              {pageUrl}
            </span>
          ))}
        </div>
      ) : (
        <div className="rounded-md bg-background/50 px-3 py-2 text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </div>
  )
}
