"use client"

import { useId } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SectionCard, FieldRow } from "@/components/preferences/SectionCard"
import { cn } from "@/lib/utils"
import type { AppPreferences } from "@/lib/contexts/PreferencesContext"

interface NotificationsSectionProps {
  draft: AppPreferences
  updateDraft: (update: Partial<AppPreferences>) => void
}

type NotifySeverity = "high" | "medium" | "low"

const severities: { key: NotifySeverity; label: string }[] = [
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
]

const sevColorMap: Record<
  NotifySeverity,
  { bg: string; border: string; text: string; dot: string }
> = {
  high: {
    bg: "bg-severity-critical-bg",
    border: "border-severity-critical-text",
    text: "text-severity-critical-text",
    dot: "bg-severity-critical-text",
  },
  medium: {
    bg: "bg-severity-serious-bg",
    border: "border-severity-serious-text",
    text: "text-severity-serious-text",
    dot: "bg-severity-serious-text",
  },
  low: {
    bg: "bg-severity-moderate-bg",
    border: "border-severity-moderate-text",
    text: "text-severity-moderate-text",
    dot: "bg-severity-moderate-text",
  },
}

function clampThreshold(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function NotificationsSection({ draft, updateDraft }: NotificationsSectionProps) {
  const thresholdId = useId()
  const selectedSeverities = draft.notify_severities ?? []

  function toggleSeverity(severity: NotifySeverity) {
    const next = selectedSeverities.includes(severity)
      ? selectedSeverities.filter((item) => item !== severity)
      : [...selectedSeverities, severity]
    updateDraft({ notify_severities: next })
  }

  return (
    <SectionCard
      id="sec-notif"
      title="Notifications"
      subtitle="When and how to surface alerts"
      iconClass="bg-[var(--medium-bg)] text-[var(--medium-text)]"
      icon={
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-[15px]">
          <path d="M8 2a4 4 0 014 4v3l1.5 2H2.5L4 9V6a4 4 0 014-4zM6.5 12a1.5 1.5 0 003 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      <FieldRow label="Notify on scan complete" hint="Show a notification when a scan finishes" horizontal>
        <Switch
          aria-label="Notify on scan complete"
          checked={draft.notify_on_scan_complete}
          onCheckedChange={(val) => updateDraft({ notify_on_scan_complete: val })}
        />
      </FieldRow>

      <FieldRow label="Notify on scan failed" hint="Show an alert when a scan encounters a fatal error" horizontal>
        <Switch
          aria-label="Notify on scan failed"
          checked={draft.notify_on_scan_failed}
          onCheckedChange={(val) => updateDraft({ notify_on_scan_failed: val })}
        />
      </FieldRow>

      <FieldRow
        label="Notify on high severity issues"
        hint="Surface an alert whenever a completed scan finds high severity issues"
        horizontal
      >
        <Switch
          aria-label="Notify on high severity issues"
          checked={draft.notify_on_high_severity}
          onCheckedChange={(val) => updateDraft({ notify_on_high_severity: val })}
        />
      </FieldRow>

      <FieldRow
        label="Alert on score below threshold"
        hint="Highlight scans that fall below a target accessibility score"
        horizontal
      >
        <Switch
          aria-label="Alert on score below threshold"
          checked={draft.notify_score_threshold_enabled}
          onCheckedChange={(val) => updateDraft({ notify_score_threshold_enabled: val })}
        />
      </FieldRow>

      {/* Score threshold */}
      <div
        className="flex flex-col gap-2 border-l-2 border-border pl-5"
      >
        <label htmlFor={thresholdId} className="text-sm font-medium text-foreground">
          Score threshold
        </label>
        <div className="flex items-center gap-3">
          <Input
            id={thresholdId}
            type="number"
            value={draft.notify_score_threshold}
            min={0}
            max={100}
            disabled={!draft.notify_score_threshold_enabled}
            className="h-11 w-20 bg-background text-sm"
            onChange={(e) =>
              updateDraft({ notify_score_threshold: clampThreshold(Number(e.target.value)) })
            }
          />
          <span className="text-xs text-muted-foreground">
            Scans scoring below{" "}
            <strong className="text-foreground">{draft.notify_score_threshold}</strong> / 100
            will be flagged
          </span>
        </div>
      </div>

      {/* Severity levels */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Alert on severity</span>
        <span className="mb-1 text-xs text-muted-foreground">
          Trigger an alert whenever a new scan finds issues of these severities
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Alert severity levels">
          {severities.map((sev) => {
            const colors = sevColorMap[sev.key]
            const checked = selectedSeverities.includes(sev.key)

            return (
              <label
                key={sev.key}
                className={cn(
                  "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring border px-2 py-2 text-sm font-medium transition-all",
                  checked
                    ? `${colors.bg} ${colors.border} ${colors.text}`
                    : "border-input bg-muted text-muted-foreground"
                )}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  aria-label={`Alert on ${sev.label.toLowerCase()} severity issues`}
                  onChange={() => toggleSeverity(sev.key)}
                />
                <span className={cn("size-1.5 rounded-full", colors.dot)} aria-hidden="true" />
                {sev.label}
              </label>
            )
          })}
        </div>
      </div>
    </SectionCard>
  )
}
