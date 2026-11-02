import { describe, expect, it } from "vitest"

import { evaluateScanNotifications } from "@/lib/scan-notifications"

const summary = { total_issues: 4, high: 2, medium: 1, low: 1 }

const allEnabled = {
  notify_on_scan_complete: true,
  notify_on_scan_failed: true,
  notify_on_high_severity: true,
  notify_score_threshold_enabled: true,
  notify_score_threshold: 80,
}

const allDisabled = {
  notify_on_scan_complete: false,
  notify_on_scan_failed: false,
  notify_on_high_severity: false,
  notify_score_threshold_enabled: false,
  notify_score_threshold: 80,
}

describe("evaluateScanNotifications", () => {
  it("reports a completed scan and high severity plus low score when enabled", () => {
    const notifications = evaluateScanNotifications({
      status: "complete",
      summary,
      score: 61,
      pagesScanned: 3,
      preferences: allEnabled,
    })

    expect(notifications.map((item) => item.kind)).toEqual([
      "scan-complete",
      "high-severity",
      "low-score",
    ])
    expect(notifications[0]).toMatchObject({
      tone: "success",
      title: "Scan complete",
      body: "4 issues found across 3 pages.",
    })
    expect(notifications[1].title).toBe("2 high-severity issues found")
    expect(notifications[2].title).toBe(
      "Accessibility score 61 is below your threshold"
    )
  })

  it("does not report a low score when the score is above the threshold", () => {
    const notifications = evaluateScanNotifications({
      status: "complete",
      summary,
      score: 96,
      pagesScanned: 1,
      preferences: allEnabled,
    })

    expect(notifications.map((item) => item.kind)).toEqual([
      "scan-complete",
      "high-severity",
    ])
  })

  it("respects disabled notification preferences", () => {
    const notifications = evaluateScanNotifications({
      status: "complete",
      summary,
      score: 20,
      pagesScanned: 1,
      preferences: allDisabled,
    })

    expect(notifications).toEqual([])
  })

  it("reports a failed scan with the backend message when enabled", () => {
    const notifications = evaluateScanNotifications({
      status: "error",
      summary: { total_issues: 0, high: 0, medium: 0, low: 0 },
      errorMessage: "Connection timeout",
      preferences: allEnabled,
    })

    expect(notifications).toEqual([
      {
        kind: "scan-failed",
        tone: "error",
        title: "Scan failed",
        body: "The scan stopped before finishing: Connection timeout",
      },
    ])
  })

  it("suppresses the failure notification when disabled", () => {
    const notifications = evaluateScanNotifications({
      status: "error",
      summary: { total_issues: 0, high: 0, medium: 0, low: 0 },
      errorMessage: "Connection timeout",
      preferences: { ...allEnabled, notify_on_scan_failed: false },
    })

    expect(notifications).toEqual([])
  })

  it("always reports a cancelled scan, regardless of preferences", () => {
    const notifications = evaluateScanNotifications({
      status: "cancelled",
      summary,
      preferences: allDisabled,
    })

    expect(notifications).toEqual([
      {
        kind: "scan-cancelled",
        tone: "neutral",
        title: "Scan cancelled",
        body: "Polling stopped. Partial results are still shown below.",
      },
    ])
  })

  it("stays silent while a scan is still queued or running", () => {
    expect(
      evaluateScanNotifications({
        status: "queued",
        summary,
        preferences: allEnabled,
      })
    ).toEqual([])
    expect(
      evaluateScanNotifications({
        status: "running",
        summary,
        preferences: allEnabled,
      })
    ).toEqual([])
  })

  it("treats a missing status as a completed scan", () => {
    const notifications = evaluateScanNotifications({
      status: undefined,
      summary,
      score: 90,
      pagesScanned: 2,
      preferences: { ...allEnabled, notify_on_high_severity: false },
    })

    expect(notifications.map((item) => item.kind)).toEqual(["scan-complete"])
  })
})
