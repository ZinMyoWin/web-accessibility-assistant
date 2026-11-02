import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ScanNotifications } from "@/components/home/ScanNotifications"
import type { ScanNotification } from "@/lib/scan-notifications"

const notifications: ScanNotification[] = [
  {
    kind: "scan-complete",
    tone: "success",
    title: "Scan complete",
    body: "4 issues found across 2 pages.",
  },
  {
    kind: "low-score",
    tone: "warning",
    title: "Accessibility score 61 is below your threshold",
    body: "This scan scored at or below your 80/100 threshold.",
  },
]

describe("ScanNotifications", () => {
  it("renders an announced list of scan notifications", () => {
    render(<ScanNotifications notifications={notifications} onDismiss={vi.fn()} />)

    const region = screen.getByRole("status", { name: "Scan notifications" })
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(screen.getByText("Scan complete")).toBeInTheDocument()
    expect(screen.getByText("4 issues found across 2 pages.")).toBeInTheDocument()
    expect(
      screen.getByText("Accessibility score 61 is below your threshold")
    ).toBeInTheDocument()
  })

  it("dismisses a single notification by kind", () => {
    const onDismiss = vi.fn()
    render(<ScanNotifications notifications={notifications} onDismiss={onDismiss} />)

    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0])

    expect(onDismiss).toHaveBeenCalledWith("scan-complete")
  })

  it("renders nothing when there are no notifications", () => {
    const { container } = render(
      <ScanNotifications notifications={[]} onDismiss={vi.fn()} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
