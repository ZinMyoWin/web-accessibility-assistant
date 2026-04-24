import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SaveBarProps {
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
}

export function SaveBar({ dirty, onSave, onDiscard }: SaveBarProps) {
  return (
    <div className="sticky bottom-0 flex items-center gap-3 border-t-[0.5px] border-border bg-card px-5 py-3">
      <span className={cn(
        "flex-1 text-[11px]",
        dirty ? "font-medium text-[var(--medium-text)]" : "text-muted-foreground"
      )}>
        {dirty ? "You have unsaved changes" : "All changes saved"}
      </span>
      {dirty && (
        <>
          <Button variant="outline" size="sm" className="text-xs" onClick={onDiscard}>
            Discard
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={onSave}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
              <path d="M3 8l4 4 6-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Save preferences
          </Button>
        </>
      )}
    </div>
  )
}
