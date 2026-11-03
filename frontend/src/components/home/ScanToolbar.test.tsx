import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ScanToolbar } from "@/components/home/ScanToolbar"

function renderToolbar(overrides: Partial<Parameters<typeof ScanToolbar>[0]> = {}) {
  const props = {
    url: "https://example.com",
    scanMode: "multi" as const,
    isScanning: true,
    canCancel: true,
    isCancelling: false,
    onUrlChange: vi.fn(),
    onScanModeChange: vi.fn(),
    onScan: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }

  render(<ScanToolbar {...props} />)
  return props
}

describe("ScanToolbar cancel controls", () => {
  it("labels the website field and submits its current scan settings with Enter", () => {
    const props = renderToolbar({ isScanning: false })
    const url = screen.getByRole("textbox", { name: "Website URL" })
    fireEvent.change(url, { target: { value: "https://new.example.com" } })
    expect(props.onUrlChange).toHaveBeenCalledWith("https://new.example.com")
    fireEvent.keyDown(url, { key: "Enter" })
    expect(props.onScan).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("combobox", { name: "Scan mode" })).toBeInTheDocument()
  })

  it("shows the cancel button only for a cancellable scan", () => {
    const { unmount } = render(
      <ScanToolbar
        url="https://example.com"
        scanMode="multi"
        isScanning={false}
        canCancel={false}
        onUrlChange={vi.fn()}
        onScanModeChange={vi.fn()}
        onScan={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.queryByTestId("cancel-scan-button")).not.toBeInTheDocument()
    unmount()
  })

  it("requires a confirmation before cancelling the scan", () => {
    const props = renderToolbar()

    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }))

    expect(screen.getByText("Cancel this scan?")).toBeInTheDocument()
    expect(props.onCancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel scan" }))

    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Cancel this scan?")).not.toBeInTheDocument()
  })

  it("keeps scanning when the confirmation is dismissed", () => {
    const props = renderToolbar()

    fireEvent.click(screen.getByRole("button", { name: "Cancel scan" }))
    fireEvent.click(screen.getByRole("button", { name: "Keep scanning" }))

    expect(props.onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Cancel scan" })).toBeInTheDocument()
  })

  it("shows the cancelling state while the request is in flight", () => {
    renderToolbar({ isCancelling: true })

    expect(screen.getByTestId("cancel-scan-button")).toBeDisabled()
    expect(screen.getByTestId("cancel-scan-button")).toHaveTextContent("Cancelling...")
  })
})
