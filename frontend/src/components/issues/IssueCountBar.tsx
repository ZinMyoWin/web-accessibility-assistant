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
    <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
      <span className="text-xs text-muted-foreground">Showing</span>
      <span className="text-xs font-medium text-foreground">
        {total} issue{total !== 1 ? "s" : ""}
      </span>
      <div className="ml-auto flex gap-1.5">
        <Badge variant="high" className="text-[10px]">
          {counts.high} high
        </Badge>
        <Badge variant="medium" className="text-[10px]">
          {counts.medium} medium
        </Badge>
        <Badge variant="low" className="text-[10px]">
          {counts.low} low
        </Badge>
      </div>
    </div>
  )
}
