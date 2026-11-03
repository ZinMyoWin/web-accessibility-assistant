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
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-3.5 flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Issues Found
        </h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter scan issues by severity">
          {severityFilters.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              className={`min-h-9 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                filter === value
                  ? "border-primary/30 bg-brand-50 text-brand-700"
                  : "border-border bg-transparent text-muted-foreground hover:border-brand-300"
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

      <div className="flex flex-col gap-3">
        {!result ? (
          <div className="rounded-xl bg-background/70 px-5 py-10 text-center text-sm leading-relaxed text-muted-foreground">
            Run your first scan to see the issues that affect your visitors, with guidance for each fix.
          </div>
        ) : issues.length === 0 ? (
          <div className="rounded-xl bg-background/70 px-5 py-10 text-center text-sm text-muted-foreground">
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
