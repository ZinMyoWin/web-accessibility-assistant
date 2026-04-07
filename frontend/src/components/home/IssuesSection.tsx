import { severityFilters } from "@/components/home/constants"
import { IssueRow } from "@/components/home/IssueRow"
import type { IssueSeverity, ScanIssue, ScanResponse } from "@/components/home/types"

type SeverityFilter = "all" | IssueSeverity

type IssuesSectionProps = {
  filter: SeverityFilter
  result: ScanResponse | null
  issues: ScanIssue[]
  onFilterChange: (value: SeverityFilter) => void
}

export function IssuesSection({
  filter,
  result,
  issues,
  onFilterChange,
}: IssuesSectionProps) {
  return (
    <section className="rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card px-5 py-[18px] shadow-[var(--shadow-panel)]">
      <div className="mb-3.5 flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[15px] font-medium text-foreground">
          Issues Found
        </span>
        <div className="flex flex-wrap gap-1.5">
          {severityFilters.map((value) => (
            <button
              key={value}
              className={`rounded-full border-[0.5px] px-3 py-1 text-[11px] font-medium transition-all duration-150 ${
                filter === value
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-transparent text-[var(--text-secondary)] hover:border-muted-foreground"
              }`}
              onClick={() => onFilterChange(value)}
            >
              {value === "all"
                ? "All"
                : value.charAt(0).toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {!result ? (
          <div className="py-2 text-xs text-muted-foreground">
            Run a scan to see issues.
          </div>
        ) : issues.length === 0 ? (
          <div className="py-2 text-xs text-muted-foreground">
            No issues at this severity level.
          </div>
        ) : (
          issues.map((issue, index) => (
            <IssueRow
              key={`${issue.rule_id}-${issue.element}-${index}`}
              issue={issue}
            />
          ))
        )}
      </div>
    </section>
  )
}
