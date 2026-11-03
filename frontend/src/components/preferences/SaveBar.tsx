import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SaveBarProps {
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
}

export function SaveBar({ dirty, onSave, onDiscard }: SaveBarProps) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-[18px] border border-border bg-card px-5 py-4 shadow-sm">
      <span role="status" className={cn(
        "flex-1 text-sm",
        dirty ? "font-medium text-[var(--medium-text)]" : "text-muted-foreground"
      )}>
        {dirty ? "You have unsaved changes" : "All changes saved"}
      </span>
      {dirty && (
        <>
          <Button variant="outline" size="sm" className="text-sm" onClick={onDiscard}>
            Discard
          </Button>
          <Button size="sm" className="gap-1.5 text-sm" onClick={onSave}>
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
