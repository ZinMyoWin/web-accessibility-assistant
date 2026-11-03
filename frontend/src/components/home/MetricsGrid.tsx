import { severityValueClass } from "@/components/home/constants"
import type { IssueSeverity, ScanSummary } from "@/components/home/types"
import { AlertTriangle, CircleAlert, ListChecks, ScanEye } from "lucide-react"

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
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
          Total Issues
          <ListChecks className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>
        <div className="text-[32px] font-bold leading-tight tracking-tight text-foreground">
          {counts.total_issues}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          across all checks
        </div>
      </div>

      {(["high", "medium", "low"] as const).map((severity) => (
        <div
          key={severity}
          className="rounded-xl border border-border bg-card p-5 sm:p-6"
        >
          <div className="mb-5 flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
            {severity.charAt(0).toUpperCase() + severity.slice(1)}
            {severity === "high" ? <CircleAlert className="size-5 shrink-0 text-severity-critical-text" aria-hidden="true" /> : severity === "medium" ? <AlertTriangle className="size-5 shrink-0 text-severity-serious-text" aria-hidden="true" /> : <ScanEye className="size-5 shrink-0 text-severity-moderate-text" aria-hidden="true" />}
          </div>
          <div
            className={`text-[32px] font-bold leading-tight tracking-tight ${severityValueClass[severity]}`}
          >
            {counts[severity]}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {severityDescriptions[severity]}
          </div>
        </div>
      ))}
    </div>
  )
}
