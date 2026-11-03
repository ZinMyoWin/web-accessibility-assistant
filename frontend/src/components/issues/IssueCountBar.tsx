import { Badge } from "@/components/ui/badge"

interface SeverityCounts {
  high: number
  medium: number
  low: number
}

interface IssueCountBarProps {
  total: number
  counts: SeverityCounts
}

export function IssueCountBar({ total, counts }: IssueCountBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/60 px-5 py-3">
      <span className="text-sm text-muted-foreground">Showing</span>
      <span className="text-sm font-semibold text-foreground">
        {total} issue{total !== 1 ? "s" : ""}
      </span>
      <div className="ml-auto flex gap-1.5">
        <Badge variant="high" className="text-xs">
          {counts.high} high
        </Badge>
        <Badge variant="medium" className="text-xs">
          {counts.medium} medium
        </Badge>
        <Badge variant="low" className="text-xs">
          {counts.low} low
        </Badge>
      </div>
    </div>
  )
}
