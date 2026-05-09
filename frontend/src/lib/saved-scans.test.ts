import { describe, expect, it } from "vitest"

import { mapSavedScanToReportData } from "@/lib/saved-scans"
import { makeSavedScanDetail } from "@/test/saved-scan-fixtures"

describe("mapSavedScanToReportData", () => {
  it("groups issues by affected page and preserves skipped crawl-memory pages", () => {
    const report = mapSavedScanToReportData(makeSavedScanDetail())

    expect(report.meta.pagesScanned).toBe(2)
    expect(report.meta.pagesSkipped).toBe(1)
    expect(report.pagesData).toHaveLength(3)

    const homePage = report.pagesData.find((page) => page.url === "https://example.com")
    const contactPage = report.pagesData.find((page) => page.url === "https://example.com/contact")
    const skippedPage = report.pagesData.find((page) => page.url === "https://example.com/about")

    expect(homePage?.status).toBe("issues")
    expect(homePage?.critical).toBe(1)
    expect(contactPage?.status).toBe("issues")
    expect(contactPage?.serious).toBe(1)
    expect(skippedPage?.status).toBe("skipped")
    expect(skippedPage?.elements).toEqual([])
  })
})
