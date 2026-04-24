import { Badge } from "@/components/ui/badge"
import { ScoreRing } from "@/components/reports/ScoreRing"
import { reportMeta, severityBreakdown, wcagPrinciples } from "@/components/reports/report-data"
import { cn } from "@/lib/utils"

const sevColorMap: Record<string, { bar: string; text: string }> = {
  critical: { bar: "bg-severity-critical", text: "text-severity-critical-text" },
  serious: { bar: "bg-severity-serious", text: "text-severity-serious-text" },
  moderate: { bar: "bg-severity-moderate", text: "text-severity-moderate-text" },
  minor: { bar: "bg-severity-minor", text: "text-severity-minor-text" },
}

export function SummaryGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 px-6 lg:grid-cols-3">
      {/* Score card */}
      <div className="flex items-center justify-center rounded-xl border-[0.5px] border-border bg-card p-5">
        <ScoreRing score={reportMeta.score} />
      </div>

      {/* Issues by severity */}
      <div className="rounded-xl border-[0.5px] border-border bg-card p-5">
        <div className="mb-1 text-xs font-medium text-foreground">Issues by Severity</div>
        <div className="mb-3 text-[10px] text-muted-foreground">
          {reportMeta.totalIssues} total · {reportMeta.pagesScanned} pages scanned
        </div>
        <div className="flex flex-col gap-3">
          {severityBreakdown.map((s) => (
            <div key={s.key} className="flex items-center gap-3">
              <Badge variant={s.key} className="w-[70px] justify-center text-[10px]">
                {s.label}
              </Badge>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--border-light)]">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-700", sevColorMap[s.key].bar)}
                  style={{ width: `${s.fraction * 100}%` }}
                />
              </div>
              <span className={cn("w-6 text-right text-xs font-semibold", sevColorMap[s.key].text)}>
                {s.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* WCAG Principles */}
      <div className="rounded-xl border-[0.5px] border-border bg-card p-5">
        <div className="mb-3 text-xs font-medium text-foreground">WCAG Principles</div>
        <div className="grid grid-cols-2 gap-2">
          {wcagPrinciples.map((p) => (
            <div
              key={p.name}
              className="flex flex-col rounded-md border-[0.5px] border-border bg-muted p-3"
            >
              <span className="text-xs font-semibold text-foreground">{p.name}</span>
              <span className="mt-0.5 text-[10px] text-muted-foreground">{p.desc}</span>
              <span className="mt-2 text-base font-bold text-foreground">{p.issues}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
