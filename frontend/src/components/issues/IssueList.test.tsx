import { useState } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { IssueList } from "./IssueList"
import type { IssueListItem } from "@/lib/saved-scans"

const issue: IssueListItem = {
  id: "issue-1", title: "Image is missing alternative text", severity: "high", category: "Images",
  selector: "img.hero", wcag: "1.1.1", level: "A", element: "<img>", impact: "People using screen readers miss this image.",
  fix: "Add useful alternative text.", finderHint: "Find the hero image.", pageUrl: "https://example.com/", pages: ["https://example.com/"],
  source: null, line: null, column: null, sourceHint: null, domPath: null, textPreview: null, screenshotDataUrl: null,
}

afterEach(() => vi.unstubAllGlobals())

describe("IssueList mobile inspection", () => {
  it("opens the complete issue details on a small screen and returns focus after closing", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
    function Workspace() {
      const [selectedId, setSelectedId] = useState<string | null>(null)
      return <IssueList issues={[issue]} selectedId={selectedId} onSelect={setSelectedId} />
    }
    render(<Workspace />)
    const row = screen.getByRole("button", { name: /Image is missing alternative text/ })
    row.focus()
    fireEvent.click(row)
    expect(screen.getByRole("dialog", { name: "Issue details" })).toBeInTheDocument()
    expect(screen.getByText("Add useful alternative text.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close issue details" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(row).toHaveFocus()
    expect(row).toHaveAttribute("aria-pressed", "true")
  })
})
