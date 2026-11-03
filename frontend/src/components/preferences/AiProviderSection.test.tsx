import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AiProviderSection } from "./AiProviderSection"
import { makePreferences } from "@/test/make-preferences"

describe("AiProviderSection", () => {
  it("names the key, model and provider controls and preserves key replacement/clear semantics", () => {
    const updateDraft = vi.fn()
    render(<AiProviderSection draft={makePreferences({ has_api_key: true })} updateDraft={updateDraft} />)
    expect(screen.getByRole("button", { name: /OpenAI/ })).toHaveAttribute("aria-pressed", "true")
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "replacement" } })
    expect(updateDraft).toHaveBeenCalledWith({ api_key: "replacement", clear_api_key: false })
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(updateDraft).toHaveBeenCalledWith({ api_key: "", clear_api_key: true })
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Generate suggestions automatically" })).toBeInTheDocument()
  })

  it("reflects the restored provider when a draft is discarded", () => {
    const updateDraft = vi.fn()
    const { rerender } = render(<AiProviderSection draft={makePreferences({ ai_provider: "deepseek" })} updateDraft={updateDraft} />)
    expect(screen.getByRole("button", { name: "DeepSeek" })).toHaveAttribute("aria-pressed", "true")
    rerender(<AiProviderSection draft={makePreferences({ ai_provider: "openai" })} updateDraft={updateDraft} />)
    expect(screen.getByRole("button", { name: /OpenAI/ })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "DeepSeek" })).toHaveAttribute("aria-pressed", "false")
  })
})
