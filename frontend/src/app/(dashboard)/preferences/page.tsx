"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { PreferencesNav } from "@/components/preferences/PreferencesNav"
import { AiProviderSection } from "@/components/preferences/AiProviderSection"
import { CrawlDefaultsSection } from "@/components/preferences/CrawlDefaultsSection"
import { WcagStandardSection } from "@/components/preferences/WcagStandardSection"
import { NotificationsSection } from "@/components/preferences/NotificationsSection"
import { AppearanceSection } from "@/components/preferences/AppearanceSection"
import { DangerZoneSection } from "@/components/preferences/DangerZoneSection"
import { SaveBar } from "@/components/preferences/SaveBar"
import { usePreferences, type AppPreferences } from "@/lib/contexts/PreferencesContext"

export default function PreferencesPage() {
  const { preferences, isLoading, updatePreferences, clearScanHistory, resetPreferences } = usePreferences()
  const [activeSection, setActiveSection] = useState("sec-ai")
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [draft, setDraft] = useState<AppPreferences | null>(null)

  // Initialize draft when preferences load or change
  useEffect(() => {
    if (!dirty && preferences) {
      setDraft(preferences)
    }
  }, [preferences, dirty])

  const updateDraft = useCallback((update: Partial<AppPreferences>) => {
    setDraft((prev) => prev ? { ...prev, ...update } : null)
    setDirty(true)
  }, [])

  function scrollToSection(id: string) {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }

  async function handleSave() {
    if (!draft) return
    try {
      await updatePreferences(draft)
      setDirty(false)
      showToast("Preferences saved")
    } catch {
      showToast("Failed to save preferences")
    }
  }

  function handleDiscard() {
    setDraft(preferences)
    setDirty(false)
  }

  if (isLoading || !draft) {
    return (
      <div className="flex min-h-[360px] items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading preferences...</p>
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-7 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground sm:text-[32px]">Preferences</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Set up your scan defaults, repair suggestions, and workspace preferences.</p>
      </header>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
        <PreferencesNav activeSection={activeSection} onSectionClick={scrollToSection} />
        <div className="min-w-0 max-w-[860px] space-y-6">
          <div className="flex min-w-0 flex-col gap-6">
            <AiProviderSection draft={draft} updateDraft={updateDraft} />
            <CrawlDefaultsSection draft={draft} updateDraft={updateDraft} />
            <WcagStandardSection draft={draft} updateDraft={updateDraft} />
            <NotificationsSection draft={draft} updateDraft={updateDraft} />
            <AppearanceSection draft={draft} updateDraft={updateDraft} />
            <DangerZoneSection
              onToast={showToast}
              onClearHistory={async () => {
                await clearScanHistory()
              }}
              onResetPreferences={async () => {
                await resetPreferences()
                setDirty(false)
              }}
            />
          </div>

          <SaveBar dirty={dirty} onSave={handleSave} onDiscard={handleDiscard} />
        </div>
      </div>

      {/* Toast */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-[200] flex items-center gap-2 rounded-[10px] bg-foreground px-4 py-3 text-sm font-medium text-white shadow-lg transition-all duration-250 ${
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
          <path d="M3 8l4 4 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {toast}
      </div>
    </div>
  )
}
