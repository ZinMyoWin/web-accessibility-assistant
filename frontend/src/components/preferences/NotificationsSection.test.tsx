import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { NotificationsSection } from "@/components/preferences/NotificationsSection"
import { makePreferences } from "@/test/make-preferences"

function renderSection(overrides: Parameters<typeof makePreferences>[0] = {}) {
  const updateDraft = vi.fn()
  render(
    <NotificationsSection
      draft={makePreferences(overrides)}
      updateDraft={updateDraft}
    />
  )
  return updateDraft
}

describe("NotificationsSection", () => {
  it("writes the score threshold switch through the preferences draft", () => {
    const updateDraft = renderSection({ notify_score_threshold_enabled: true })

    fireEvent.click(screen.getByRole("switch", { name: /Alert on score below threshold/i }))

    expect(updateDraft).toHaveBeenCalledWith({ notify_score_threshold_enabled: false })
  })

  it("writes the score threshold value through the preferences draft", () => {
    const updateDraft = renderSection({ notify_score_threshold: 70 })

    const input = screen.getByLabelText("Score threshold")
    fireEvent.change(input, { target: { value: "55" } })

    expect(updateDraft).toHaveBeenCalledWith({ notify_score_threshold: 55 })
  })

  it("clamps the score threshold to 0-100", () => {
    const updateDraft = renderSection({ notify_score_threshold: 70 })

    fireEvent.change(screen.getByLabelText("Score threshold"), {
      target: { value: "140" },
    })

    expect(updateDraft).toHaveBeenCalledWith({ notify_score_threshold: 100 })
  })

  it("toggles severity levels in notify_severities", () => {
    const updateDraft = renderSection({ notify_severities: ["high", "medium"] })

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Alert on low severity issues" })
    )
    expect(updateDraft).toHaveBeenCalledWith({
      notify_severities: ["high", "medium", "low"],
    })
  })

  it("removes a severity level that is already selected", () => {
    const updateDraft = renderSection({ notify_severities: ["high", "medium"] })

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Alert on high severity issues" })
    )
    expect(updateDraft).toHaveBeenCalledWith({ notify_severities: ["medium"] })
  })

  it("keeps the existing scan notification toggle working", () => {
    const updateDraft = renderSection({ notify_on_scan_failed: true })

    fireEvent.click(screen.getByRole("switch", { name: /Notify on scan failed/i }))

    expect(updateDraft).toHaveBeenCalledWith({ notify_on_scan_failed: false })
  })
})
