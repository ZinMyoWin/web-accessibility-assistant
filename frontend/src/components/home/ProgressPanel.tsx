import { progressStateClass } from "@/components/home/constants"
import type { ProgressState } from "@/components/home/types"
import { cn } from "@/lib/utils"
import { ScanLine } from "lucide-react"

type ProgressPanelProps = {
  progress: number
  progressText: string
  progressState: ProgressState
}

export function ProgressPanel({
  progress,
  progressText,
  progressState,
}: ProgressPanelProps) {
  const isActive = progressState === "active"
  const isCancelled = progressState === "cancelled"

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className={`flex min-w-0 items-center gap-2 ${progressStateClass[progressState]}`}>
          {isActive && <ScanLine className="size-4 shrink-0" aria-hidden="true" />}
          <span className="leading-relaxed" data-testid="scan-progress-text">
            {progressText}
          </span>
        </span>
        <span className="font-semibold text-foreground">{Math.round(progress)}%</span>
      </div>
      <div role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-valuetext={progressText} className="relative h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[400ms] motion-reduce:transition-none",
            isCancelled
              ? "bg-muted-foreground/50"
              : "bg-primary"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
