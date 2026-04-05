import { Badge } from "@/components/ui/badge"

interface SeverityCounts {
  critical: number
  serious: number
  moderate: number
  minor: number
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
        <Badge variant="critical" className="text-[10px]">
          {counts.critical} critical
        </Badge>
        <Badge variant="serious" className="text-[10px]">
          {counts.serious} serious
        </Badge>
        <Badge variant="moderate" className="text-[10px]">
          {counts.moderate} moderate
        </Badge>
        <Badge variant="minor" className="text-[10px]">
          {counts.minor} minor
        </Badge>
      </div>
    </div>
  )
}
