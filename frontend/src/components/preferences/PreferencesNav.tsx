"use client"

import { cn } from "@/lib/utils"

const sections = [
  { id: "sec-ai", label: "AI Provider", icon: "ai" },
  { id: "sec-crawl", label: "Crawl Defaults", icon: "crawl" },
  { id: "sec-wcag", label: "WCAG Standard", icon: "wcag" },
  { id: "sec-notif", label: "Notifications", icon: "notif" },
  { id: "sec-appear", label: "Appearance", icon: "appear" },
  { id: "sec-danger", label: "Danger Zone", icon: "danger" },
] as const

const icons: Record<string, React.ReactNode> = {
  ai: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
      <path d="M3 8a5 5 0 0110 0M8 3v1M8 12v1M12.2 5.2l-.7.7M4.5 10.5l-.7.7M13 8h-1M4 8H3" strokeLinecap="round" />
    </svg>
  ),
  crawl: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
      <circle cx="8" cy="8" r="5.5" /><path d="M8 5V8L9.5 9.5" strokeLinecap="round" />
    </svg>
  ),
  wcag: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
      <path d="M2 8h2l2-4 2 8 2-4h2l1-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  notif: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
      <path d="M8 2a4 4 0 014 4v3l1.5 2H2.5L4 9V6a4 4 0 014-4zM6.5 12a1.5 1.5 0 003 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  appear: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
      <rect x="2" y="2" width="5" height="12" rx="1" /><rect x="9" y="2" width="5" height="7" rx="1" /><rect x="9" y="11" width="5" height="3" rx="1" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5">
      <path d="M8 2l6 12H2L8 2zM8 7v3M8 11.5v.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

interface PreferencesNavProps {
  activeSection: string
  onSectionClick: (id: string) => void
}

export function PreferencesNav({ activeSection, onSectionClick }: PreferencesNavProps) {
  return (
    <div className="sticky top-0 hidden w-48 shrink-0 p-6 md:block">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Preferences
      </div>
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => onSectionClick(section.id)}
          className={cn(
            "mb-0.5 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
            activeSection === section.id
              ? "bg-card text-accent-foreground"
              : "text-muted-foreground hover:bg-card hover:text-foreground",
            section.id === "sec-danger" && "mt-3 text-[var(--high-text)]"
          )}
        >
          {icons[section.icon]}
          {section.label}
        </button>
      ))}
    </div>
  )
}
