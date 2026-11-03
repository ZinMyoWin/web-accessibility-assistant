import { Badge } from "@/components/ui/badge"
import { ScoreRing } from "@/components/reports/ScoreRing"
import { cn } from "@/lib/utils"
import type {
  ReportMeta,
  ReportSeverityBreakdownItem,
  ReportWcagPrincipleItem,
} from "@/lib/saved-scans"

const sevColorMap: Record<string, { bar: string; text: string }> = {
  critical: { bar: "bg-severity-critical", text: "text-severity-critical-text" },
  serious: { bar: "bg-severity-serious", text: "text-severity-serious-text" },
  moderate: { bar: "bg-severity-moderate", text: "text-severity-moderate-text" },
  minor: { bar: "bg-severity-minor", text: "text-severity-minor-text" },
}

interface SummaryGridProps {
  reportMeta: ReportMeta
  severityBreakdown: ReportSeverityBreakdownItem[]
  wcagPrinciples: ReportWcagPrincipleItem[]
}

export function SummaryGrid({
  reportMeta,
  severityBreakdown,
  wcagPrinciples,
}: SummaryGridProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="flex items-center justify-center rounded-[18px] border border-border bg-card p-5 sm:p-6">
        <ScoreRing score={reportMeta.score} />
      </div>

      <div className="rounded-[18px] border border-border bg-card p-5 sm:p-6">
        <div className="mb-1 text-base font-semibold text-foreground">Issues by Severity</div>
        <div className="mb-5 text-xs text-muted-foreground">
          {reportMeta.totalIssues} total - {reportMeta.pagesScanned} pages scanned
          {reportMeta.pagesSkipped > 0 ? ` - ${reportMeta.pagesSkipped} skipped` : ""}
        </div>
        <div className="flex flex-col gap-3">
          {severityBreakdown.map((s) => (
            <div key={s.key} className="flex items-center gap-3">
              <Badge variant={s.key} className="w-[70px] justify-center text-xs">
                {s.label}
              </Badge>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border-light)]">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-700",
                    sevColorMap[s.key].bar
                  )}
                  style={{ width: `${s.fraction * 100}%` }}
                />
              </div>
              <span
                className={cn(
                  "w-6 text-right text-xs font-semibold",
                  sevColorMap[s.key].text
                )}
              >
                {s.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[18px] border border-border bg-card p-5 sm:p-6">
        <div className="mb-4 text-base font-semibold text-foreground">WCAG Principles</div>
        <div className="grid grid-cols-2 gap-2">
          {wcagPrinciples.map((p) => (
            <div
              key={p.name}
              className="flex flex-col rounded-[10px] border border-border bg-background p-3"
            >
              <span className="text-xs font-semibold text-foreground">{p.name}</span>
              <span className="mt-0.5 text-xs text-muted-foreground">{p.desc}</span>
              <span className="mt-2 text-xl font-semibold text-foreground">{p.issues}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
