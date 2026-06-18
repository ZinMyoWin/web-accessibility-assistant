import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PagesTab } from "@/components/reports/PagesTab"
import { mapSavedScanToReportData } from "@/lib/saved-scans"
import { makeSavedScanDetail } from "@/test/saved-scan-fixtures"

describe("PagesTab", () => {
  it("renders scanned, issue, and skipped page groups from saved scan data", () => {
    const report = mapSavedScanToReportData(makeSavedScanDetail())

    render(<PagesTab pagesData={report.pagesData} />)

    expect(screen.getByText("Pages in this scan")).toBeInTheDocument()
    expect(screen.getByText(/2 scanned/)).toBeInTheDocument()
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument()
    expect(screen.getAllByText("https://example.com").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Scanned · Issues").length).toBeGreaterThan(0)
    expect(screen.getByText("Image is missing alternative text.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /https:\/\/example.com\/about/ }))

    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0)
    expect(screen.getByText("Skipped by crawl memory")).toBeInTheDocument()
    expect(
      screen.getByText(/already scanned on the same domain/)
    ).toBeInTheDocument()
  })

  it("shows an empty state when no page data is available", () => {
    render(<PagesTab pagesData={[]} />)

    expect(
      screen.getByText("No page-level scan data is available for this report.")
    ).toBeInTheDocument()
  })
})
