"use client"

import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SectionCard, FieldRow } from "@/components/preferences/SectionCard"
import { cn } from "@/lib/utils"
import type { AppPreferences } from "@/lib/contexts/PreferencesContext"

interface CrawlDefaultsSectionProps {
  draft: AppPreferences
  updateDraft: (update: Partial<AppPreferences>) => void
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

export function CrawlDefaultsSection({ draft, updateDraft }: CrawlDefaultsSectionProps) {
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && e.currentTarget.value.trim()) {
      e.preventDefault()
      const val = e.currentTarget.value.trim().replace(/,/g, "")
      if (val) {
        updateDraft({ ignored_url_patterns: [...draft.ignored_url_patterns, val] })
        e.currentTarget.value = ""
      }
    } else if (e.key === "Backspace" && !e.currentTarget.value) {
      updateDraft({ ignored_url_patterns: draft.ignored_url_patterns.slice(0, -1) })
    }
  }

  function removeTag(index: number) {
    updateDraft({
      ignored_url_patterns: draft.ignored_url_patterns.filter((_, i) => i !== index),
    })
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
              onClick={() => updateDraft({ default_scan_mode: mode.value })}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-md border-[0.5px] p-3 text-center transition-all",
                draft.default_scan_mode === mode.value
                  ? "border-primary bg-secondary shadow-[0_0_0_2px_rgba(29,158,117,0.1)]"
                  : "border-input bg-muted hover:border-primary/50"
              )}
            >
              <div className={cn(
                "flex size-7 items-center justify-center rounded",
                draft.default_scan_mode === mode.value ? "bg-primary text-white" : "bg-input text-muted-foreground"
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
          <Input 
            type="number" 
            value={draft.default_page_limit} 
            min={1} max={500} 
            className="h-9 bg-muted text-xs" 
            onChange={(e) => updateDraft({ default_page_limit: Number(e.target.value) })} 
          />
        </FieldRow>
        <FieldRow label="Crawl depth" hint="Link depth from starting URL (1–10)">
          <Input 
            type="number" 
            value={draft.crawl_depth} 
            min={1} max={10} 
            className="h-9 bg-muted text-xs" 
            onChange={(e) => updateDraft({ crawl_depth: Number(e.target.value) })} 
          />
        </FieldRow>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Request delay (ms)" hint="Pause between page requests">
          <Input 
            type="number" 
            value={draft.request_delay_ms} 
            min={0} max={5000} 
            className="h-9 bg-muted text-xs" 
            onChange={(e) => updateDraft({ request_delay_ms: Number(e.target.value) })} 
          />
        </FieldRow>
        <FieldRow label="Page timeout (ms)" hint="Playwright navigation timeout">
          <Input 
            type="number" 
            value={draft.page_timeout_ms} 
            min={1000} max={60000} 
            className="h-9 bg-muted text-xs" 
            onChange={(e) => updateDraft({ page_timeout_ms: Number(e.target.value) })} 
          />
        </FieldRow>
      </div>

      {/* Ignored URL patterns */}
      <FieldRow label="Ignored URL patterns" hint="URL substrings or glob patterns to skip during crawling">
        <div className="flex min-h-[42px] flex-wrap gap-1 rounded-md border border-input bg-muted px-3 py-2 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20">
          {draft.ignored_url_patterns.map((tag, i) => (
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
        <Switch 
          checked={draft.stay_within_domain} 
          onCheckedChange={(val) => updateDraft({ stay_within_domain: val })} 
        />
      </FieldRow>

      <FieldRow label="Respect robots.txt" hint="Skip URLs disallowed by the site's robots.txt" horizontal>
        <Switch 
          checked={draft.respect_robots_txt} 
          onCheckedChange={(val) => updateDraft({ respect_robots_txt: val })} 
        />
      </FieldRow>
    </SectionCard>
  )
}
