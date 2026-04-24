"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SectionCard, FieldRow } from "@/components/preferences/SectionCard"
import { cn } from "@/lib/utils"

interface CrawlDefaultsSectionProps {
  onDirty: () => void
}

const scanModes = [
  {
    value: "single",
    label: "Single page",
    desc: "Scan one URL only",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
        <rect x="3" y="2" width="10" height="12" rx="1.5" /><path d="M5 6h6M5 9h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "multi",
    label: "Multi-page",
    desc: "Follow internal links",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
        <rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M5 7h6M5 10h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "sitemap",
    label: "Sitemap",
    desc: "Parse sitemap.xml",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
        <circle cx="8" cy="8" r="2.5" /><path d="M8 2v3M8 11v3M3 8H2M14 8h-1M5.5 5.5l-1-1M11.5 10.5l1 1M10.5 5.5l1-1M5.5 10.5l-1 1" strokeLinecap="round" />
      </svg>
    ),
  },
]

export function CrawlDefaultsSection({ onDirty }: CrawlDefaultsSectionProps) {
  const [scanMode, setScanMode] = useState("multi")
  const [tags, setTags] = useState(["/logout", "/admin", "*.pdf"])

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && e.currentTarget.value.trim()) {
      e.preventDefault()
      const val = e.currentTarget.value.trim().replace(/,/g, "")
      if (val) {
        setTags((prev) => [...prev, val])
        e.currentTarget.value = ""
        onDirty()
      }
    } else if (e.key === "Backspace" && !e.currentTarget.value) {
      setTags((prev) => prev.slice(0, -1))
      onDirty()
    }
  }

  function removeTag(index: number) {
    setTags((prev) => prev.filter((_, i) => i !== index))
    onDirty()
  }

  return (
    <SectionCard
      id="sec-crawl"
      title="Crawl Defaults"
      subtitle="Pre-fill values used in the scan topbar"
      iconClass="bg-secondary text-accent-foreground"
      icon={
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-[15px]">
          <circle cx="8" cy="8" r="5.5" /><path d="M8 5V8L9.5 9.5" strokeLinecap="round" />
        </svg>
      }
    >
      {/* Scan mode radio cards */}
      <FieldRow label="Default scan mode">
        <div className="flex gap-2">
          {scanModes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => { setScanMode(mode.value); onDirty() }}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-md border-[0.5px] p-3 text-center transition-all",
                scanMode === mode.value
                  ? "border-primary bg-secondary shadow-[0_0_0_2px_rgba(29,158,117,0.1)]"
                  : "border-input bg-muted hover:border-primary/50"
              )}
            >
              <div className={cn(
                "flex size-7 items-center justify-center rounded",
                scanMode === mode.value ? "bg-primary text-white" : "bg-input text-muted-foreground"
              )}>
                {mode.icon}
              </div>
              <span className="text-xs font-medium text-foreground">{mode.label}</span>
              <span className="text-[10px] text-muted-foreground">{mode.desc}</span>
            </button>
          ))}
        </div>
      </FieldRow>

      {/* Number fields grid */}
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Default page limit" hint="Max pages crawled per scan (1–500)">
          <Input type="number" defaultValue={20} min={1} max={500} className="h-9 bg-muted text-xs" onChange={() => onDirty()} />
        </FieldRow>
        <FieldRow label="Crawl depth" hint="Link depth from starting URL (1–10)">
          <Input type="number" defaultValue={3} min={1} max={10} className="h-9 bg-muted text-xs" onChange={() => onDirty()} />
        </FieldRow>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Request delay (ms)" hint="Pause between page requests">
          <Input type="number" defaultValue={250} min={0} max={5000} className="h-9 bg-muted text-xs" onChange={() => onDirty()} />
        </FieldRow>
        <FieldRow label="Page timeout (ms)" hint="Playwright navigation timeout">
          <Input type="number" defaultValue={15000} min={1000} max={60000} className="h-9 bg-muted text-xs" onChange={() => onDirty()} />
        </FieldRow>
      </div>

      {/* Ignored URL patterns */}
      <FieldRow label="Ignored URL patterns" hint="URL substrings or glob patterns to skip during crawling">
        <div className="flex min-h-[42px] flex-wrap gap-1 rounded-md border border-input bg-muted px-3 py-2 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 font-mono text-[11px] text-foreground">
              {tag}
              <button onClick={() => removeTag(i)} className="text-muted-foreground hover:text-destructive">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-2.5">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
          <input
            type="text"
            placeholder="Add pattern, press Enter…"
            className="min-w-[120px] flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            onKeyDown={handleTagKeyDown}
          />
        </div>
      </FieldRow>

      {/* Toggles */}
      <FieldRow label="Stay within same domain" hint="Do not follow links to external domains" horizontal>
        <Switch defaultChecked onCheckedChange={() => onDirty()} />
      </FieldRow>

      <FieldRow label="Respect robots.txt" hint="Skip URLs disallowed by the site's robots.txt" horizontal>
        <Switch defaultChecked onCheckedChange={() => onDirty()} />
      </FieldRow>
    </SectionCard>
  )
}
