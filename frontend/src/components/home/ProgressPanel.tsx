import { progressStateClass } from "@/components/home/constants"
import type { ProgressState } from "@/components/home/types"

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
  return (
    <div className="rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card px-[18px] py-3.5 shadow-[var(--shadow-panel)]">
      <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span className={progressStateClass[progressState]}>{progressText}</span>
        <span className="font-semibold text-foreground">{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-[var(--border-light)]">
        <div
          className="h-full rounded-[3px] bg-gradient-to-r from-primary to-[#5dcaa5] transition-[width] duration-[400ms]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
