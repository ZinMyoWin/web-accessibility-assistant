import { describe, expect, it } from "vitest"

import { mapSavedScanToIssueList, mapSavedScanToReportData } from "@/lib/saved-scans"
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

describe("mapSavedScanToIssueList", () => {
  it("preserves persisted screenshot data URLs", () => {
    const dataUrl = "data:image/jpeg;base64,abc123"
    const issues = mapSavedScanToIssueList(
      makeSavedScanDetail({
        issues: [
          {
            rule_id: "image-alt",
            severity: "high",
            element: "<img>",
            message: "Image is missing alternative text.",
            recommendation: "Add alt text.",
            line: 1,
            column: 1,
            source_hint: "<img>",
            dom_path: "html > body > img",
            text_preview: "hero.png",
            screenshot_data_url: dataUrl,
            wcag_criteria: ["WCAG 1.1.1 A"],
            source: "custom",
            page_url: "https://example.com",
          },
        ],
      })
    )

    expect(issues[0].screenshotDataUrl).toBe(dataUrl)
  })
})
