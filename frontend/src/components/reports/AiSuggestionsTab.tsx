import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ReportAiSuggestion } from "@/lib/saved-scans"

const confidenceMap: Record<string, string> = {
  High: "text-accent-foreground bg-secondary",
  Medium: "text-[var(--medium-text)] bg-[var(--medium-bg)]",
  Low: "text-muted-foreground bg-muted",
}

export function AiSuggestionsTab({
  aiSuggestions,
  totalCriticalSerious,
}: {
  aiSuggestions: ReportAiSuggestion[]
  totalCriticalSerious: number
}) {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between border-b-[0.5px] border-border px-5 py-4">
        <div>
          <div className="text-sm font-semibold text-foreground">AI-Powered Repair Suggestions</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Suggestions are AI-generated and should be reviewed before applying to production code.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {aiSuggestions.length} of {totalCriticalSerious} critical/serious issues covered
          </span>
          <Button variant="outline" size="sm" className="gap-1.5 text-[11px]" disabled>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3">
              <path d="M8 2v8M5 8l3 3 3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export all patches
          </Button>
        </div>
      </div>

      {aiSuggestions.length === 0 ? (
        <div className="p-5 text-xs text-muted-foreground">
          No saved AI suggestions are available yet. This section will populate after LLM-based suggestion generation is implemented.
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-5">
          {aiSuggestions.map((suggestion, i) => (
            <div key={i} className="overflow-hidden rounded-md border-[0.5px] border-border bg-card">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Badge variant={suggestion.severity} className="text-[10px]">
                  {suggestion.severity.charAt(0).toUpperCase() + suggestion.severity.slice(1)}
                </Badge>
                <span className="text-xs font-medium text-foreground">{suggestion.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  WCAG {suggestion.wcag} - {suggestion.pages} pages
                </span>
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
                    confidenceMap[suggestion.confidence]
                  )}
                >
                  Confidence: {suggestion.confidence}
                </span>
              </div>

              <div className="border-t-[0.5px] border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
                {suggestion.explanation}
              </div>

              <div className="border-y-[0.5px] border-border bg-muted/40">
                <div className="flex items-center px-4 py-2 text-[10px] text-muted-foreground">
                  <span>{suggestion.file} - line {suggestion.line}</span>
                </div>
                <div className="border-t-[0.5px] border-border font-mono text-[11px]">
                  {suggestion.removed.split("\n").map((line, li) => (
                    <div key={`r-${li}`} className="flex bg-[#FEF2F2] px-4 py-0.5">
                      <span className="mr-3 select-none text-[var(--high-text)]">-</span>
                      <span className="text-[var(--high-text)]">{line}</span>
                    </div>
                  ))}
                  {suggestion.added.split("\n").map((line, li) => (
                    <div key={`a-${li}`} className="flex bg-[#F0FDF4] px-4 py-0.5">
                      <span className="mr-3 select-none text-accent-foreground">+</span>
                      <span className="text-accent-foreground">{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-3">
                <Button size="sm" className="gap-1.5 text-[11px]">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="size-2.5">
                    <path d="M3 8l4 4 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Apply fix
                </Button>
                <Button variant="outline" size="sm" className="text-[11px]">
                  Copy patch
                </Button>
                <Button variant="ghost" size="sm" className="text-[11px] text-muted-foreground">
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
