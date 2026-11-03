import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { IssueRow } from "./IssueRow"
import type { ScanIssue } from "./types"

const issue: ScanIssue = { rule_id: "image-alt", severity: "high", element: "img.hero", message: "Add alternative text to the hero image", recommendation: "Describe the useful information in the image.", line: null, column: null, source_hint: null, dom_path: null, text_preview: null, screenshot_data_url: null, wcag_criteria: ["1.1.1"], source: "axe", page_url: "https://example.com" }

describe("IssueRow disclosure", () => {
  it("announces its expanded state and reveals the recommendation", () => {
    render(<IssueRow issue={issue} />)
    const trigger = screen.getByRole("button", { name: /Add alternative text to the hero image/ })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(issue.recommendation)).toBeInTheDocument()
    expect(document.getElementById(trigger.getAttribute("aria-controls")!)).toBeInTheDocument()
  })
})
