import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ScanHistoryRow } from "./ScanHistoryRow"
import { makeSavedScanDetail } from "@/test/saved-scan-fixtures"

function renderRow(compareMode = false) {
  const onCompareToggle = vi.fn()
  const onViewReport = vi.fn()
  render(<ScanHistoryRow scan={makeSavedScanDetail()} isSelected={false} compareMode={compareMode} isCompareSelected={false} onSelect={vi.fn()} onCompareToggle={onCompareToggle} onViewReport={onViewReport} />)
  return { onCompareToggle, onViewReport }
}

describe("ScanHistoryRow", () => {
  it("provides a named issues link and a visible working report action", () => {
    const { onViewReport } = renderRow()
    expect(screen.getByRole("link", { name: /https:\/\/example.com/ })).toHaveAttribute("href", "/issues?scanId=scan-1")
    fireEvent.click(screen.getByRole("button", { name: /View report/ }))
    expect(onViewReport).toHaveBeenCalledWith("scan-1")
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
  })

  it("uses a named checkbox for compare selection", () => {
    const { onCompareToggle } = renderRow(true)
    fireEvent.click(screen.getByRole("checkbox", { name: /Compare https:\/\/example.com/ }))
    expect(onCompareToggle).toHaveBeenCalledWith("scan-1")
  })
})
