"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { SectionCard } from "@/components/preferences/SectionCard"

interface DangerZoneSectionProps {
  onToast: (msg: string) => void
  onClearHistory: () => Promise<void>
  onResetPreferences: () => Promise<void>
}

export function DangerZoneSection({
  onToast,
  onClearHistory,
  onResetPreferences,
}: DangerZoneSectionProps) {
  return (
    <SectionCard
      id="sec-danger"
      title="Danger Zone"
      subtitle="Irreversible actions - proceed with care"
      iconClass="bg-[var(--high-bg)] text-[var(--high-text)]"
      icon={
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-[15px]">
          <path d="M8 2l6 12H2L8 2zM8 7v3M8 11.5v.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
      danger
    >
      <div className="flex items-center justify-between gap-4 rounded-md border-[0.5px] border-[var(--high-text)]/20 bg-[var(--high-bg)] p-4">
        <div>
          <div className="text-xs font-medium text-[var(--high-text)]">Clear scan history</div>
          <div className="mt-0.5 text-[11px] text-[var(--high-text)]/70">
            Permanently removes all past scan records and reports
          </div>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 border-[var(--high-text)]/35 text-[var(--high-text)] hover:bg-[var(--high-bg)]">
              Clear history
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear scan history?</DialogTitle>
              <DialogDescription>
                All scan records, reports, and issue data will be permanently deleted. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    try {
                      await onClearHistory()
                      onToast("Scan history cleared")
                    } catch {
                      onToast("Failed to clear scan history")
                    }
                  }}
                >
                  Yes, clear history
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border-[0.5px] border-[var(--high-text)]/20 bg-[var(--high-bg)] p-4">
        <div>
          <div className="text-xs font-medium text-[var(--high-text)]">Reset all preferences</div>
          <div className="mt-0.5 text-[11px] text-[var(--high-text)]/70">
            Restores all settings to defaults, including API keys
          </div>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm" className="shrink-0">
              Reset preferences
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset all preferences?</DialogTitle>
              <DialogDescription>
                All settings, including API keys, crawl defaults, and notifications, will be restored to defaults.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    try {
                      await onResetPreferences()
                      onToast("Preferences reset to defaults")
                    } catch {
                      onToast("Failed to reset preferences")
                    }
                  }}
                >
                  Yes, reset
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SectionCard>
  )
}
