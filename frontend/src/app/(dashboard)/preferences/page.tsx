"use client"

import { useCallback, useRef, useState } from "react"
import { PreferencesNav } from "@/components/preferences/PreferencesNav"
import { AiProviderSection } from "@/components/preferences/AiProviderSection"
import { CrawlDefaultsSection } from "@/components/preferences/CrawlDefaultsSection"
import { WcagStandardSection } from "@/components/preferences/WcagStandardSection"
import { NotificationsSection } from "@/components/preferences/NotificationsSection"
import { AppearanceSection } from "@/components/preferences/AppearanceSection"
import { DangerZoneSection } from "@/components/preferences/DangerZoneSection"
import { SaveBar } from "@/components/preferences/SaveBar"

export default function PreferencesPage() {
  const [activeSection, setActiveSection] = useState("sec-ai")
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markDirty = useCallback(() => setDirty(true), [])

  function scrollToSection(id: string) {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }

  function handleSave() {
    setDirty(false)
    showToast("Preferences saved")
  }

  function handleDiscard() {
    setDirty(false)
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Topbar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3 pl-14 md:pl-6">
        <h1 className="text-sm font-semibold text-foreground">Preferences</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Side nav */}
        <PreferencesNav activeSection={activeSection} onSectionClick={scrollToSection} />

        {/* Settings body */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 p-6">
            <AiProviderSection onDirty={markDirty} />
            <CrawlDefaultsSection onDirty={markDirty} />
            <WcagStandardSection onDirty={markDirty} />
            <NotificationsSection onDirty={markDirty} />
            <AppearanceSection onDirty={markDirty} />
            <DangerZoneSection onToast={showToast} />
          </div>

          <SaveBar dirty={dirty} onSave={handleSave} onDiscard={handleDiscard} />
        </div>
      </div>

      {/* Toast */}
      <div
        className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2 rounded-md bg-[#04342C] px-4 py-3 text-xs font-medium text-white shadow-lg transition-all duration-250 ${
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="#5DCAA5" strokeWidth="2" className="size-3.5">
          <path d="M3 8l4 4 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {toast}
      </div>
    </div>
  )
}
