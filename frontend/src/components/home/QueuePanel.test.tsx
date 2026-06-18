import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { QueuePanel } from "@/components/home/QueuePanel"
import { makeSavedScanDetail } from "@/test/saved-scan-fixtures"

describe("QueuePanel", () => {
  it("renders running queue state and calls queue-control actions", () => {
    const onRemovePage = vi.fn()
    const onPrioritizePage = vi.fn()
    const activeScan = makeSavedScanDetail({
      status: "running",
      current_page_url: "https://example.com",
      queued_page_urls: [
        "https://example.com/contact",
        "https://example.com/pricing",
      ],
      excluded_page_urls: ["https://example.com/about"],
    })

    render(
      <QueuePanel
        activeScan={activeScan}
        queueActionUrl={null}
        onRemovePage={onRemovePage}
        onPrioritizePage={onPrioritizePage}
      />
    )

    expect(screen.getByText("Scan queue")).toBeInTheDocument()
    expect(screen.getByText("Attempt 1/3")).toBeInTheDocument()
    expect(screen.getByText("2 waiting")).toBeInTheDocument()
    expect(screen.getByText("https://example.com")).toBeInTheDocument()
    expect(screen.getByText("https://example.com/about")).toBeInTheDocument()

    const firstButtons = screen.getAllByRole("button", { name: "First" })
    const removeButtons = screen.getAllByRole("button", { name: "Remove" })

    expect(firstButtons[0]).toBeDisabled()
    expect(firstButtons[1]).toBeEnabled()

    fireEvent.click(firstButtons[1])
    fireEvent.click(removeButtons[0])

    expect(onPrioritizePage).toHaveBeenCalledWith("https://example.com/pricing")
    expect(onRemovePage).toHaveBeenCalledWith("https://example.com/contact")
  })

  it("does not render for a single-page scan", () => {
    const { container } = render(
      <QueuePanel
        activeScan={makeSavedScanDetail({ mode: "single" })}
        queueActionUrl={null}
        onRemovePage={vi.fn()}
        onPrioritizePage={vi.fn()}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
