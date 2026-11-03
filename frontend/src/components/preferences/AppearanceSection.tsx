"use client"

import { Switch } from "@/components/ui/switch"
import { SectionCard, FieldRow } from "@/components/preferences/SectionCard"
import { cn } from "@/lib/utils"
import type { AppPreferences } from "@/lib/contexts/PreferencesContext"

interface AppearanceSectionProps {
  draft: AppPreferences
  updateDraft: (update: Partial<AppPreferences>) => void
}

const themes = [
  { value: "light", label: "Light", previewClass: "bg-[#F5F5F3]", sidebarClass: "bg-[#EEECEA]", barClass: "bg-[#EEECEA]" },
  { value: "dark", label: "Dark", previewClass: "bg-[#1A1A18]", sidebarClass: "bg-[#2A2A28]", barClass: "bg-[#2A2A28]" },
  { value: "system", label: "System", previewClass: "bg-[#E7EBF4]", sidebarClass: "bg-[#8791A4]", barClass: "bg-[#8791A4]" },
]

const densities = ["Compact", "Default", "Comfortable"]

export function AppearanceSection({ draft, updateDraft }: AppearanceSectionProps) {
  // Map "density" schema to UI densities (comfortable/compact)
  // Schema defines "comfortable" vs "compact"
  const densityMap: Record<string, string> = {
    comfortable: "Comfortable",
    default: "Default",
    compact: "Compact"
  }

  const currentDensityLabel = densityMap[draft.density?.toLowerCase()] || "Default"

  return (
    <SectionCard
      id="sec-appear"
      title="Appearance"
      subtitle="Theme and display density"
      iconClass="bg-input text-muted-foreground"
      icon={
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-[15px]">
          <rect x="2" y="2" width="5" height="12" rx="1" /><rect x="9" y="2" width="5" height="7" rx="1" /><rect x="9" y="11" width="5" height="3" rx="1" />
        </svg>
      }
    >
      {/* Theme cards */}
      <FieldRow label="Theme">
        <div className="flex flex-col gap-3 sm:flex-row">
          {themes.map((t) => (
            <button
              key={t.value}
              aria-pressed={draft.theme === t.value}
              onClick={() => updateDraft({ theme: t.value })}
              className={cn(
                "flex flex-1 flex-col overflow-hidden rounded-[10px] border transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                draft.theme === t.value
                  ? "border-primary ring-2 ring-primary/10"
                  : "border-input hover:border-primary/50"
              )}
            >
              {/* Preview block */}
              <div className={cn("flex gap-1 p-2", t.previewClass)} style={{ height: 52 }}>
                <div className={cn("w-5 rounded-sm", t.sidebarClass)} />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="h-[5px] w-3/5 rounded-sm bg-primary" />
                  <div className={cn("h-[5px] w-4/5 rounded-sm", t.barClass)} />
                  <div className={cn("h-[5px] w-1/2 rounded-sm", t.barClass)} />
                </div>
              </div>
              {/* Label */}
              <div className="flex items-center px-3 py-2.5">
                <span className={cn("text-sm font-medium", draft.theme === t.value ? "text-accent-foreground" : "text-foreground")}>
                  {t.label}
                </span>
                <div className={cn(
                  "ml-auto flex size-3.5 items-center justify-center rounded-full border",
                  draft.theme === t.value ? "border-primary bg-primary" : "border-input bg-muted"
                )}>
                  {draft.theme === t.value && <div className="size-1.5 rounded-full bg-white" />}
                </div>
              </div>
            </button>
          ))}
        </div>
      </FieldRow>

      {/* Density */}
      <FieldRow label="Interface density">
        <div className="flex flex-wrap gap-2">
          {densities.map((d) => (
            <button
              key={d}
              aria-pressed={currentDensityLabel === d}
              onClick={() => updateDraft({ density: d.toLowerCase() })}
              className={cn(
                "flex-1 rounded-[10px] border px-3 py-2 text-center text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                currentDensityLabel === d
                  ? "border-primary bg-secondary text-primary"
                  : "border-input bg-muted text-muted-foreground hover:border-primary/50"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </FieldRow>

      <FieldRow label="Animate scan progress" hint="Show live progress bar animation during active scans" horizontal>
        <Switch
          aria-label="Animate scan progress"
          checked={!draft.reduced_motion}
          onCheckedChange={(val) => {
            updateDraft({ reduced_motion: !val })
          }}
        />
      </FieldRow>
    </SectionCard>
  )
}
