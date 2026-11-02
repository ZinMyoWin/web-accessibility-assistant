import type { SavedScanStatus, SavedScanSummary } from "@/lib/saved-scans"

/**
 * Pure in-app notification evaluation for terminal dashboard scans.
 *
 * The dashboard hook calls `evaluateScanNotifications` once a scan reaches a
 * terminal state (complete/error/cancelled) and renders the result with
 * `components/home/ScanNotifications`. Keeping the policy here makes the
 * preference rules testable without React.
 */
export type ScanNotificationKind =
  | "scan-complete"
  | "scan-failed"
  | "high-severity"
  | "low-score"
  | "scan-cancelled"

export type ScanNotificationTone = "success" | "error" | "warning" | "neutral"

export type ScanNotification = {
  kind: ScanNotificationKind
  tone: ScanNotificationTone
  title: string
  body: string
}

export type ScanNotificationPreferences = {
  notify_on_scan_complete: boolean
  notify_on_scan_failed: boolean
  notify_on_high_severity: boolean
  notify_score_threshold_enabled: boolean
  notify_score_threshold: number
}

export type ScanNotificationInput = {
  status: SavedScanStatus | undefined
  summary: SavedScanSummary
  score?: number | null
  errorMessage?: string | null
  pagesScanned?: number
  preferences: ScanNotificationPreferences
}

export const SCAN_CANCELLED_PROGRESS_TEXT =
  "Scan cancelled - partial results are kept below."

export function buildScanCancelledNotification(): ScanNotification {
  return {
    kind: "scan-cancelled",
    tone: "neutral",
    title: "Scan cancelled",
    body: "Polling stopped. Partial results are still shown below.",
  }
}

export function evaluateScanNotifications({
  status,
  summary,
  score,
  errorMessage,
  pagesScanned = 0,
  preferences,
}: ScanNotificationInput): ScanNotification[] {
  if (status === "cancelled") {
    return [buildScanCancelledNotification()]
  }

  if (status === "queued" || status === "running") {
    return []
  }

  const notifications: ScanNotification[] = []
  const total = summary.total_issues
  const pagesLabel = `${pagesScanned} page${pagesScanned === 1 ? "" : "s"}`

  if (status === "error") {
    if (!preferences.notify_on_scan_failed) {
      return notifications
    }

    return [
      {
        kind: "scan-failed",
        tone: "error",
        title: "Scan failed",
        body: errorMessage
          ? `The scan stopped before finishing: ${errorMessage}`
          : "The scan stopped before finishing. Check the URL and try again.",
      },
    ]
  }

  if (preferences.notify_on_scan_complete) {
    notifications.push({
      kind: "scan-complete",
      tone: "success",
      title: "Scan complete",
      body: `${total} issue${total === 1 ? "" : "s"} found across ${pagesLabel}.`,
    })
  }

  if (preferences.notify_on_high_severity && summary.high > 0) {
    notifications.push({
      kind: "high-severity",
      tone: "warning",
      title: `${summary.high} high-severity issue${summary.high === 1 ? "" : "s"} found`,
      body: "Open the report to review the affected elements and suggested fixes.",
    })
  }

  if (
    preferences.notify_score_threshold_enabled &&
    score != null &&
    score <= preferences.notify_score_threshold
  ) {
    notifications.push({
      kind: "low-score",
      tone: "warning",
      title: `Accessibility score ${score} is below your threshold`,
      body: `This scan scored at or below your ${preferences.notify_score_threshold}/100 threshold.`,
    })
  }

  return notifications
}
