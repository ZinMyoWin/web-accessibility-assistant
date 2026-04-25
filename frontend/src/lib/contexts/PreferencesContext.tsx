"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { API_BASE_URL } from "@/lib/api"

export interface AppPreferences {
  ai_provider: string
  ai_model: string
  active_suggestion_provider: string
  auto_generate_suggestions: boolean

  default_scan_mode: string
  default_page_limit: number
  crawl_depth: number
  request_delay_ms: number
  page_timeout_ms: number
  ignored_url_patterns: string[]
  stay_within_domain: boolean
  respect_robots_txt: boolean

  wcag_standard: string
  include_best_practices: boolean
  fail_on_experimental: boolean

  email_notifications: boolean
  email_address: string | null
  notify_on_scan_complete: boolean
  notify_on_scan_failed: boolean
  notify_on_high_severity: boolean
  weekly_summary: boolean

  theme: string
  reduced_motion: boolean
  high_contrast: boolean
  density: string
  
  has_api_key?: boolean
  api_key?: string | null
}

const defaultPreferences: AppPreferences = {
  ai_provider: "openai",
  ai_model: "gpt-4o",
  active_suggestion_provider: "openai",
  auto_generate_suggestions: true,
  
  default_scan_mode: "multi",
  default_page_limit: 20,
  crawl_depth: 3,
  request_delay_ms: 250,
  page_timeout_ms: 15000,
  ignored_url_patterns: ["/logout", "/admin", "*.pdf"],
  stay_within_domain: true,
  respect_robots_txt: true,
  
  wcag_standard: "wcag2aa",
  include_best_practices: true,
  fail_on_experimental: false,
  
  email_notifications: false,
  email_address: null,
  notify_on_scan_complete: true,
  notify_on_scan_failed: true,
  notify_on_high_severity: false,
  weekly_summary: false,
  
  theme: "light",
  reduced_motion: false,
  high_contrast: false,
  density: "comfortable",
}

interface PreferencesContextValue {
  preferences: AppPreferences
  isLoading: boolean
  error: string | null
  updatePreferences: (newPrefs: Partial<AppPreferences>) => Promise<void>
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined)

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const response = await fetch(`${API_BASE_URL}/preferences`)
        if (response.ok) {
          const data = await response.json()
          setPreferences(data)
        }
      } catch (err) {
        console.error("Failed to fetch preferences:", err)
        setError("Failed to load preferences.")
      } finally {
        setIsLoading(false)
      }
    }
    fetchPreferences()
  }, [])

  async function updatePreferences(newPrefs: Partial<AppPreferences>) {
    try {
      const payload = { ...preferences, ...newPrefs }
      const response = await fetch(`${API_BASE_URL}/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      
      if (!response.ok) {
        throw new Error("Failed to save preferences.")
      }
      
      const updated = await response.json()
      setPreferences(updated)
    } catch (err) {
      console.error(err)
      throw err
    }
  }

  return (
    <PreferencesContext.Provider value={{ preferences, isLoading, error, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (context === undefined) {
    throw new Error("usePreferences must be used within a PreferencesProvider")
  }
  return context
}
