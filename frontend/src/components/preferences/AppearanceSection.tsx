"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { SectionCard, FieldRow } from "@/components/preferences/SectionCard"
import { cn } from "@/lib/utils"

interface AppearanceSectionProps {
  onDirty: () => void
}

const themes = [
  { value: "light", label: "Light", previewClass: "bg-[#F5F5F3]", sidebarClass: "bg-[#EEECEA]", barClass: "bg-[#EEECEA]" },
  { value: "dark", label: "Dark", previewClass: "bg-[#1A1A18]", sidebarClass: "bg-[#2A2A28]", barClass: "bg-[#2A2A28]" },
  { value: "system", label: "System", previewClass: "bg-gradient-to-r from-[#F5F5F3] via-[#F5F5F3] to-[#1A1A18]", sidebarClass: "bg-gradient-to-r from-[#EEECEA] to-[#2A2A28]", barClass: "bg-gradient-to-r from-[#EEECEA] to-[#2A2A28]" },
]

const densities = ["Compact", "Default", "Comfortable"]

export function AppearanceSection({ onDirty }: AppearanceSectionProps) {
  const [theme, setTheme] = useState("light")
  const [density, setDensity] = useState("Default")

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
        <div className="flex gap-3">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => { setTheme(t.value); onDirty() }}
              className={cn(
                "flex flex-1 flex-col overflow-hidden rounded-md border-[0.5px] transition-all",
                theme === t.value
                  ? "border-primary shadow-[0_0_0_2px_rgba(29,158,117,0.1)]"
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
                <span className={cn("text-xs font-medium", theme === t.value ? "text-accent-foreground" : "text-foreground")}>
                  {t.label}
                </span>
                <div className={cn(
                  "ml-auto flex size-3.5 items-center justify-center rounded-full border-[0.5px]",
                  theme === t.value ? "border-primary bg-primary" : "border-input bg-muted"
                )}>
                  {theme === t.value && <div className="size-1.5 rounded-full bg-white" />}
                </div>
              </div>
            </button>
          ))}
        </div>
      </FieldRow>

      {/* Density */}
      <FieldRow label="Interface density">
        <div className="flex gap-2">
          {densities.map((d) => (
            <button
              key={d}
              onClick={() => { setDensity(d); onDirty() }}
              className={cn(
                "flex-1 rounded-md border-[0.5px] px-3 py-2 text-center text-xs font-medium transition-all",
                density === d
                  ? "border-primary bg-card text-accent-foreground"
                  : "border-input bg-muted text-muted-foreground hover:border-primary/50"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </FieldRow>

      <FieldRow label="Show WCAG criterion references" hint='Display criterion codes (e.g. 1.1.1) alongside issue titles' horizontal>
        <Switch defaultChecked onCheckedChange={() => onDirty()} />
      </FieldRow>

      <FieldRow label="Animate scan progress" hint="Show live progress bar animation during active scans" horizontal>
        <Switch defaultChecked onCheckedChange={() => onDirty()} />
      </FieldRow>
    </SectionCard>
  )
}
