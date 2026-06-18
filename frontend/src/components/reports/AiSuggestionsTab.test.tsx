import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AiSuggestionsTab } from "@/components/reports/AiSuggestionsTab"
import {
  fetchRepairSuggestionGroups,
  generateRepairSuggestionGroup,
  type RepairSuggestion,
  type RepairSuggestionGroup,
} from "@/lib/saved-scans"

vi.mock("@/lib/contexts/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
  }),
}))

vi.mock("@/lib/saved-scans", async () => {
  return {
    fetchRepairSuggestionGroups: vi.fn(),
    generateRepairSuggestionGroup: vi.fn(),
  }
})

const baseSuggestion: RepairSuggestion = {
  id: "suggestion-1",
  group_key: "group-1",
  provider: "openai",
  model: "gpt-4o",
  explanation: "The same missing alt pattern appears on multiple pages.",
  impact: "Screen reader users cannot understand the image purpose.",
  recommended_fix: "Add short, meaningful alt text for each informative image.",
  before_code: "<img src='/hero.png'>",
  after_code: "<img src='/hero.png' alt='Dashboard overview'>",
  confidence: "high",
  limitations: null,
  created_at: "2026-05-09T10:00:00Z",
  updated_at: "2026-05-09T10:00:00Z",
}

const baseGroup: RepairSuggestionGroup = {
  group_key: "group-1",
  rule_id: "image-alt",
  title: "Image is missing alternative text.",
  severity: "high",
  recommendation: "Add meaningful alt text to informative images.",
  wcag_criteria: ["1.1.1"],
  affected_count: 2,
  affected_pages: ["https://example.com", "https://example.com/about"],
  examples: [
    {
      element: "<img src='/hero.png'>",
      page_url: "https://example.com",
      source_hint: "img",
      dom_path: "html > body > img",
      text_preview: "",
    },
  ],
  suggestion: null,
}

describe("AiSuggestionsTab", () => {
  beforeEach(() => {
    vi.mocked(fetchRepairSuggestionGroups).mockReset()
    vi.mocked(generateRepairSuggestionGroup).mockReset()
  })

  it("loads grouped issue patterns and generates one saved suggestion for the group", async () => {
    vi.mocked(fetchRepairSuggestionGroups).mockResolvedValue({
      scan_id: "scan-1",
      groups: [baseGroup],
    })
    vi.mocked(generateRepairSuggestionGroup).mockResolvedValue(baseSuggestion)

    render(<AiSuggestionsTab scanId="scan-1" totalCriticalSerious={2} />)

    expect(await screen.findByText("Image is missing alternative text.")).toBeInTheDocument()
    expect(screen.getByText("2 instances - 2 pages")).toBeInTheDocument()
    expect(screen.getByText("<img src='/hero.png'>")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Generate suggestion" }))

    await waitFor(() => {
      expect(generateRepairSuggestionGroup).toHaveBeenCalledWith(
        "scan-1",
        "group-1",
        "test-token",
        { force: false }
      )
    })
    expect(
      await screen.findByText("The same missing alt pattern appears on multiple pages.")
    ).toBeInTheDocument()
    expect(screen.getByText("Confidence: high")).toBeInTheDocument()
  })

  it("shows saved reusable suggestions and still allows regeneration", async () => {
    vi.mocked(fetchRepairSuggestionGroups).mockResolvedValue({
      scan_id: "scan-2",
      groups: [{ ...baseGroup, suggestion: baseSuggestion }],
    })
    vi.mocked(generateRepairSuggestionGroup).mockResolvedValue({
      ...baseSuggestion,
      id: "suggestion-2",
      explanation: "Use a reusable alt-text repair pattern for informative images.",
    })

    render(<AiSuggestionsTab scanId="scan-2" totalCriticalSerious={2} />)

    expect(
      await screen.findByText("The same missing alt pattern appears on multiple pages.")
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Regenerate suggestion" }))

    await waitFor(() => {
      expect(generateRepairSuggestionGroup).toHaveBeenCalledWith(
        "scan-2",
        "group-1",
        "test-token",
        { force: true }
      )
    })
    expect(
      await screen.findByText("Use a reusable alt-text repair pattern for informative images.")
    ).toBeInTheDocument()
  })

  it("shows an empty state when no scan is selected", () => {
    render(<AiSuggestionsTab scanId={null} totalCriticalSerious={0} />)

    expect(
      screen.getByText("No grouped accessibility issues are available for AI repair suggestions.")
    ).toBeInTheDocument()
    expect(fetchRepairSuggestionGroups).not.toHaveBeenCalled()
  })
})
