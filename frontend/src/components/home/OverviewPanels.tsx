import { API, severityBarClass } from "@/components/home/constants"
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className="rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card px-5 py-[18px] shadow-[var(--shadow-panel)]">
        <div className="mb-3.5 flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[15px] font-medium text-foreground">
            Severity Breakdown
          </span>
          <span className="text-xs text-muted-foreground">
            {counts.total_issues} issue{counts.total_issues !== 1 ? "s" : ""}
          </span>
        </div>

        {(["high", "medium", "low"] as const).map((severity) => (
          <div
            key={severity}
            className="mb-2.5 flex items-center gap-2.5 last:mb-0"
          >
            <span className="w-[60px] text-xs capitalize text-[var(--text-secondary)]">
              {severity}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-[var(--border-light)]">
              <div
                className={`h-full rounded transition-[width] duration-500 ${severityBarClass[severity]}`}
                style={{ width: `${(counts[severity] / maxSeverityCount) * 100}%` }}
              />
            </div>
            <span className="w-7 text-right text-xs font-semibold text-foreground">
              {counts[severity]}
            </span>
          </div>
        ))}

        <div className="mt-4 border-t-[0.5px] border-border pt-3.5">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground">
            Top Rules
          </div>
          {categories.length > 0 ? (
            categories.map(([name, count]) => (
              <div
                key={name}
                className="flex items-center justify-between py-1 text-xs text-[var(--text-secondary)]"
              >
                <span>{formatRuleId(name)}</span>
                <span className="font-semibold text-foreground">{count}</span>
              </div>
            ))
          ) : (
            <span className="py-2 text-xs text-muted-foreground">-</span>
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card px-5 py-[18px] shadow-[var(--shadow-panel)]">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-[15px] font-medium text-foreground">
            Scan Details
          </span>
        </div>
        {result ? (
          <>
            {[
              ["URL", result.url],
              ["Scanned at", new Date(result.scanned_at).toLocaleString()],
              ["Total issues", String(result.summary.total_issues)],
              ["High", String(result.summary.high)],
              ["Medium", String(result.summary.medium)],
              ["Low", String(result.summary.low)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between border-b-[0.5px] border-[var(--border-light)] py-2.5 text-xs last:border-b-0"
              >
                <span className="shrink-0 text-muted-foreground">{label}</span>
                <span className="max-w-[65%] overflow-hidden text-ellipsis whitespace-nowrap text-right font-medium text-foreground">
                  {value}
                </span>
              </div>
            ))}
            <div className="flex justify-between py-2.5 text-xs">
              <span className="shrink-0 text-muted-foreground">Endpoint</span>
              <span className="max-w-[65%] overflow-hidden text-ellipsis whitespace-nowrap text-right font-medium text-foreground">
                <code className="rounded bg-background px-1.5 py-0.5 font-[var(--font-mono)] text-[11px]">
                  {API}/scan/page
                </code>
              </span>
            </div>
            {result.scan_id && (
              <div className="mt-4 flex gap-2 border-t-[0.5px] border-border pt-2">
                <Button asChild variant="outline" className="h-8 flex-1 text-xs">
                  <Link href={`/issues?scanId=${result.scan_id}`} target="_blank">
                    View Detailed Issues
                  </Link>
                </Button>
                <Button asChild className="h-8 flex-1 text-xs">
                  <Link href={`/reports?scanId=${result.scan_id}`}>
                    Open Report
                  </Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="py-2 text-xs text-muted-foreground">
            No scan results yet. Enter a URL and click Scan.
          </div>
        )}
      </section>
    </div>
  )
}
