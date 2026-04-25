"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SectionCard, FieldRow } from "@/components/preferences/SectionCard"
import { cn } from "@/lib/utils"
import type { AppPreferences } from "@/lib/contexts/PreferencesContext"

interface NotificationsSectionProps {
  draft: AppPreferences
  updateDraft: (update: Partial<AppPreferences>) => void
}

const severities = [
  { key: "critical", label: "Critical" },
  { key: "serious", label: "Serious" },
  { key: "moderate", label: "Moderate" },
  { key: "minor", label: "Minor" },
] as const

const sevColorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: "bg-severity-critical-bg", border: "border-severity-critical-text", text: "text-severity-critical-text", dot: "bg-severity-critical-text" },
  serious: { bg: "bg-severity-serious-bg", border: "border-severity-serious-text", text: "text-severity-serious-text", dot: "bg-severity-serious-text" },
  moderate: { bg: "bg-severity-moderate-bg", border: "border-severity-moderate-text", text: "text-severity-moderate-text", dot: "bg-severity-moderate-text" },
  minor: { bg: "bg-severity-minor-bg", border: "border-severity-minor-text", text: "text-severity-minor-text", dot: "bg-severity-minor-text" },
}

export function NotificationsSection({ draft, updateDraft }: NotificationsSectionProps) {
  // Temporary local state for UI elements that are not yet in the backend schema
  const [scoreAlertEnabled, setScoreAlertEnabled] = useState(true)
  const [threshold, setThreshold] = useState(70)
  const [sevChecked, setSevChecked] = useState<Record<string, boolean>>({
    critical: true, serious: true, moderate: false, minor: false,
  })

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
      <FieldRow label="Notify on scan complete" hint="Show a toast notification when a scan finishes" horizontal>
        <Switch 
          checked={draft.notify_on_scan_complete} 
          onCheckedChange={(val) => updateDraft({ notify_on_scan_complete: val })} 
        />
      </FieldRow>
      
      <FieldRow label="Notify on scan failed" hint="Show an alert when a scan encounters a fatal error" horizontal>
        <Switch 
          checked={draft.notify_on_scan_failed} 
          onCheckedChange={(val) => updateDraft({ notify_on_scan_failed: val })} 
        />
      </FieldRow>

      <FieldRow label="Alert on score below threshold" hint="Highlight scans that fall below a target accessibility score" horizontal>
        <Switch checked={scoreAlertEnabled} onCheckedChange={(v) => { setScoreAlertEnabled(v) }} />
      </FieldRow>

      {/* Score threshold */}
      <div className={cn(
        "flex flex-col gap-2 border-l-2 border-border pl-5 transition-opacity",
        !scoreAlertEnabled && "pointer-events-none opacity-40"
      )}>
        <label className="text-xs font-medium text-foreground">Score threshold</label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            value={threshold}
            min={0}
            max={100}
            className="h-9 w-20 bg-muted text-xs"
            onChange={(e) => { setThreshold(Number(e.target.value)) }}
          />
          <span className="text-[11px] text-muted-foreground">
            Scans scoring below <strong className="text-foreground">{threshold}</strong> / 100 will be flagged
          </span>
        </div>
      </div>

      {/* Severity toggles */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-foreground">Alert on severity</span>
        <span className="mb-1 text-[11px] text-muted-foreground">Trigger an alert whenever a new scan finds issues of these severities</span>
        <div className="flex gap-2">
          {severities.map((sev) => {
            const colors = sevColorMap[sev.key]
            
            // Map the "critical" toggle to the global "notify_on_high_severity" schema field for now
            const isCritical = sev.key === "critical" || sev.key === "serious"
            const checked = isCritical ? draft.notify_on_high_severity : sevChecked[sev.key]
            
            return (
              <label
                key={sev.key}
                className={cn(
                  "flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-full border-[0.5px] px-2 py-2 text-[11px] font-medium transition-all",
                  checked
                    ? `${colors.bg} ${colors.border} ${colors.text}`
                    : "border-input bg-muted text-muted-foreground"
                )}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={checked}
                  onChange={() => {
                    if (isCritical) {
                      updateDraft({ notify_on_high_severity: !draft.notify_on_high_severity })
                    } else {
                      setSevChecked((prev) => ({ ...prev, [sev.key]: !prev[sev.key] }))
                    }
                  }}
                />
                <span className={cn("size-1.5 rounded-full", colors.dot)} />
                {sev.label}
              </label>
            )
          })}
        </div>
      </div>
    </SectionCard>
  )
}
