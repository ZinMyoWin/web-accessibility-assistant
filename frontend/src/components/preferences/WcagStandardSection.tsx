"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { SectionCard, FieldRow } from "@/components/preferences/SectionCard"
import { cn } from "@/lib/utils"

interface WcagStandardSectionProps {
  onDirty: () => void
}

export function WcagStandardSection({ onDirty }: WcagStandardSectionProps) {
  const [wcagVersion, setWcagVersion] = useState("2.2")
  const [wcagLevel, setWcagLevel] = useState("AA")

  const levels = [
    { value: "A", label: "Minimum", desc: "Removes the most significant barriers. Required for basic accessibility." },
    { value: "AA", label: "Standard · Recommended", desc: "Required by UK Accessibility Regulations 2018 for public sector websites." },
    { value: "AAA", label: "Enhanced", desc: "Highest level. Not always achievable for all content types." },
  ]

  return (
    <SectionCard
      id="sec-wcag"
      title="Accessibility Standard"
      subtitle="WCAG version and conformance level for issue detection"
      iconClass="bg-[#E6F1FB] text-[#185FA5]"
      icon={
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-[15px]">
          <path d="M2 8h2l2-4 2 8 2-4h2l1-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    >
      {/* WCAG Version */}
      <FieldRow label="WCAG version" hint="WCAG 2.2 adds 9 new success criteria over 2.1, including focus appearance and dragging movements.">
        <div className="flex gap-2">
          {["2.1", "2.2"].map((v) => (
            <button
              key={v}
              onClick={() => { setWcagVersion(v); onDirty() }}
              className={cn(
                "rounded-md border-[0.5px] px-4 py-2 text-xs font-medium transition-all",
                wcagVersion === v
                  ? "border-primary bg-card text-accent-foreground"
                  : "border-input bg-muted text-muted-foreground hover:border-primary/50"
              )}
            >
              WCAG {v}
            </button>
          ))}
        </div>
      </FieldRow>

      {/* Conformance Level */}
      <FieldRow label="Conformance level">
        <div className="flex gap-2">
          {levels.map((level) => (
            <button
              key={level.value}
              onClick={() => { setWcagLevel(level.value); onDirty() }}
              className={cn(
                "flex-1 rounded-md border-[0.5px] p-3 text-left transition-all",
                wcagLevel === level.value
                  ? "border-primary bg-secondary"
                  : "border-input bg-muted hover:border-primary/50"
              )}
            >
              <div className={cn(
                "text-base font-bold",
                wcagLevel === level.value ? "text-accent-foreground" : "text-foreground"
              )}>
                {level.value}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{level.label}</div>
              <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{level.desc}</div>
            </button>
          ))}
        </div>
      </FieldRow>

      <FieldRow label="Include best-practice warnings" hint="Surface advisory checks beyond strict WCAG criteria" horizontal>
        <Switch defaultChecked onCheckedChange={() => onDirty()} />
      </FieldRow>
    </SectionCard>
  )
}
