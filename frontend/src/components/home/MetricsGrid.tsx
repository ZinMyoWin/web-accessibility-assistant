import { severityValueClass } from "@/components/home/constants"
import type { IssueSeverity, ScanSummary } from "@/components/home/types"

type MetricsGridProps = {
  counts: ScanSummary
}

const severityDescriptions: Record<IssueSeverity, string> = {
  high: "fix immediately",
  medium: "should address",
  low: "minor concerns",
}

export function MetricsGrid({ counts }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card px-[18px] py-4">
        <div className="text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground">
          Total Issues
        </div>
        <div className="mt-1 text-[22px] leading-tight text-primary">
          {counts.total_issues}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          across all checks
        </div>
      </div>

      {(["high", "medium", "low"] as const).map((severity) => (
        <div
          key={severity}
          className="rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card px-[18px] py-4"
        >
          <div className="text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground">
            {severity.charAt(0).toUpperCase() + severity.slice(1)}
          </div>
          <div
            className={`mt-1 text-[22px] leading-tight ${severityValueClass[severity]}`}
          >
            {counts[severity]}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {severityDescriptions[severity]}
          </div>
        </div>
      ))}
    </div>
  )
}
