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
  const isActive = progressState === "active"

  return (
    <div className="rounded-[var(--radius-lg)] border-[0.5px] border-border bg-card px-[18px] py-3.5 shadow-[var(--shadow-panel)]">
      <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span className={`flex min-w-0 items-center gap-2 ${progressStateClass[progressState]}`}>
          {isActive && (
            <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
              <span className="size-1.5 rounded-full bg-primary opacity-40 animate-[scan-dot_1s_ease-in-out_infinite]" />
              <span className="size-1.5 rounded-full bg-primary opacity-40 animate-[scan-dot_1s_ease-in-out_150ms_infinite]" />
              <span className="size-1.5 rounded-full bg-primary opacity-40 animate-[scan-dot_1s_ease-in-out_300ms_infinite]" />
            </span>
          )}
          <span className="truncate">{progressText}</span>
        </span>
        <span className="font-semibold text-foreground">{Math.round(progress)}%</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-[3px] bg-[var(--border-light)]">
        <div
          className="h-full rounded-[3px] bg-gradient-to-r from-primary to-[#5dcaa5] transition-[width] duration-[400ms]"
          style={{ width: `${progress}%` }}
        />
        {isActive && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1/3 rounded-[3px] bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-80 animate-[scan-sheen_1.25s_linear_infinite]"
          />
        )}
      </div>
    </div>
  )
}
