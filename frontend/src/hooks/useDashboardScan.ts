"use client"

import { useEffect, useRef, useState } from "react"
import { API, EMPTY_SUMMARY } from "@/components/home/constants"
import type { ProgressState, ScanIssue, ScanResponse } from "@/components/home/types"
import { authHeaders } from "@/lib/api"
import { useAuth } from "@/lib/contexts/AuthContext"
import type { AppPreferences } from "@/lib/contexts/PreferencesContext"
import {
  SCAN_CANCELLED_PROGRESS_TEXT,
  buildScanCancelledNotification,
  evaluateScanNotifications,
  type ScanNotification,
  type ScanNotificationPreferences,
} from "@/lib/scan-notifications"
import {
  cancelSavedScan,
  fetchSavedScan,
  prioritizeScanQueuePage,
  removeScanQueuePage,
  type SavedScanDetail,
} from "@/lib/saved-scans"

type ScanErrorBody = {
  detail?: string
}

export type DashboardScanPreferences = Pick<
  AppPreferences,
  | "default_page_limit"
  | "crawl_depth"
  | "request_delay_ms"
  | "page_timeout_ms"
  | "ignored_url_patterns"
  | "stay_within_domain"
  | "respect_robots_txt"
  | "skip_previously_scanned_pages"
> &
  ScanNotificationPreferences

const SYNC_CRAWL_PAGE_LIMIT = 5
const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 180

/** Thrown internally when the user cancels a running scan. */
export class ScanCancelledError extends Error {
  readonly scan: SavedScanDetail | null

  constructor(scan: SavedScanDetail | null = null) {
    super("Scan cancelled.")
    this.name = "ScanCancelledError"
    this.scan = scan
  }
}

export function useDashboardScan() {
  const { token } = useAuth()
  const [url, setUrl] = useState("")
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [error, setError] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState(
    "Ready to scan - enter a URL above"
  )
  const [progressState, setProgressState] = useState<ProgressState>("idle")
  const [activeScan, setActiveScan] = useState<SavedScanDetail | null>(null)
  const [queueActionUrl, setQueueActionUrl] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<ScanNotification[]>([])

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const latestScanRef = useRef<SavedScanDetail | null>(null)
  const cancelRequestedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current)
      }
    }
  }, [])

  function beginProgress(mode: "single" | "multi") {
    setProgress(0)
    setProgressState("active")
    setProgressText(
      mode === "multi" ? "Starting multi-page crawl..." : "Connecting to page..."
    )

    let currentProgress = 0
    progressRef.current = setInterval(() => {
      currentProgress += Math.random() * 12 + 3
      if (currentProgress > 92) {
        currentProgress = 92
      }

      setProgress(currentProgress)

      if (currentProgress < 25) {
        setProgressText("Rendering page JavaScript...")
      } else if (currentProgress < 50) {
        setProgressText(
          mode === "multi"
            ? "Discovering linked pages from rendered content..."
            : "Running checks against rendered content..."
        )
      } else if (currentProgress < 75) {
        setProgressText(
          mode === "multi"
            ? "Running axe-core across crawled pages..."
            : "Injecting axe-core engine..."
        )
      } else {
        setProgressText(
          mode === "multi"
            ? "Saving full multi-page results..."
            : "Capturing screenshots..."
        )
      }
    }, 600)
  }

  function stopProgress() {
    if (progressRef.current) {
      clearInterval(progressRef.current)
      progressRef.current = null
    }
  }

  function getLatestScan(): SavedScanDetail | null {
    return latestScanRef.current
  }

  function publishTerminalNotifications(
    scan: SavedScanDetail | null,
    fallback: {
      status: ScanResponse["status"]
      summary: ScanResponse["summary"]
      pagesScanned: number
      errorMessage?: string | null
    },
    preferences: ScanNotificationPreferences
  ) {
    setNotifications(
      evaluateScanNotifications({
        status: scan?.status ?? fallback.status,
        summary: scan?.summary ?? fallback.summary,
        score: scan?.score ?? null,
        errorMessage: fallback.errorMessage ?? scan?.error_message ?? null,
        pagesScanned: scan?.pages_scanned ?? fallback.pagesScanned,
        preferences,
      })
    )
  }

  async function handleScan(mode: "single" | "multi", preferences: DashboardScanPreferences) {
    if (isScanning || !url.trim()) {
      return
    }
    if (!token) {
      setError("Please log in before starting a scan.")
      return
    }

    setIsScanning(true)
    setError("")
    setResult(null)
    setActiveScan(null)
    setNotifications([])
    setIsCancelling(false)
    cancelRequestedRef.current = false
    latestScanRef.current = null
    beginProgress(mode)

    try {
      const response = await fetch(`${API}/scan/page`, {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          url,
          mode,
          page_limit: Math.min(preferences.default_page_limit, SYNC_CRAWL_PAGE_LIMIT),
          crawl_depth: preferences.crawl_depth,
          request_delay_ms: preferences.request_delay_ms,
          page_timeout_ms: preferences.page_timeout_ms,
          ignored_url_patterns: preferences.ignored_url_patterns,
          stay_within_domain: preferences.stay_within_domain,
          respect_robots_txt: preferences.respect_robots_txt,
          skip_previously_scanned_pages: preferences.skip_previously_scanned_pages,
        }),
      })

      if (!response.ok) {
        const body = (await response.json()) as ScanErrorBody
        throw new Error(body.detail || "Scan request failed.")
      }

      const data = (await response.json()) as ScanResponse
      const pendingScanId = isPendingScan(data) ? data.scan_id : null

      if (isPendingScan(data)) {
        if (!pendingScanId) {
          throw new Error("Scan was queued but no scan ID was returned.")
        }
        setProgressText(
          data.status === "queued"
            ? "Scan queued - waiting for scan worker..."
            : "Scan worker is running full page analysis..."
        )
      }

      const completedData = pendingScanId
        ? await pollScanUntilComplete(
            pendingScanId,
            (scan) => {
              if (!token || cancelRequestedRef.current) {
                return
              }
              latestScanRef.current = scan
              setActiveScan(scan)
              // Lightweight polls carry `issues: []`; only replace the displayed
              // results when the response actually includes issue rows.
              if (scan.issues.length > 0) {
                // Stream partial per-page results so issues appear while
                // later pages are still being scanned.
                setResult(mapSavedScanToScanResponse(scan))
              }
              const liveIssueSuffix =
                scan.summary.total_issues > 0
                  ? ` (${scan.summary.total_issues} issue${scan.summary.total_issues !== 1 ? "s" : ""} found so far)`
                  : ""
              setProgressText(
                scan.status === "queued"
                  ? "Scan queued - waiting for scan worker..."
                  : scan.current_page_url
                    ? `Scanning ${shortenUrl(scan.current_page_url)}...${liveIssueSuffix}`
                    : `Scan worker is running full page analysis...${liveIssueSuffix}`
              )
            },
            token,
            () => cancelRequestedRef.current
          )
        : data

      setResult(completedData)
      if (!pendingScanId) {
        setActiveScan(null)
      }
      setProgress(100)
      setProgressText(
        `${completedData.mode === "multi" ? "Multi-page crawl" : "Scan"} complete - ${completedData.summary.total_issues} issue${completedData.summary.total_issues !== 1 ? "s" : ""} found across ${completedData.pages_scanned} page${completedData.pages_scanned !== 1 ? "s" : ""}${completedData.pages_skipped > 0 ? `, skipped ${completedData.pages_skipped} already scanned` : ""}`
      )
      setProgressState("done")
      publishTerminalNotifications(
        getLatestScan(),
        {
          status: completedData.status ?? "complete",
          summary: completedData.summary,
          pagesScanned: completedData.pages_scanned,
        },
        preferences
      )
    } catch (scanError) {
      if (scanError instanceof ScanCancelledError) {
        if (scanError.scan) {
          latestScanRef.current = scanError.scan
          setActiveScan(scanError.scan)
        } else {
          const currentScan = getLatestScan()
          if (currentScan && currentScan.status !== "cancelled") {
            const cancelledCurrentScan: SavedScanDetail = {
              ...currentScan,
              status: "cancelled",
            }
            latestScanRef.current = cancelledCurrentScan
            setActiveScan(cancelledCurrentScan)
          }
        }
        setProgressText(SCAN_CANCELLED_PROGRESS_TEXT)
        setProgressState("cancelled")
        setError("")
        setNotifications([buildScanCancelledNotification()])
        return
      }

      const message =
        scanError instanceof Error
          ? scanError.message
          : "Unexpected error while scanning."
      setError(message)
      setProgress(0)
      setProgressText("Scan failed - check the URL and try again")
      setProgressState("error")
      const terminalScan = getLatestScan()
      publishTerminalNotifications(
        terminalScan,
        {
          status: "error",
          summary: terminalScan?.summary ?? EMPTY_SUMMARY,
          pagesScanned: terminalScan?.pages_scanned ?? 0,
          errorMessage: message,
        },
        preferences
      )
    } finally {
      stopProgress()
      setIsScanning(false)
      setIsCancelling(false)
    }
  }

  async function cancelScan() {
    if (!activeScan || isCancelling) {
      return
    }
    if (activeScan.status !== "queued" && activeScan.status !== "running") {
      return
    }
    if (!token) {
      setError("Please log in before cancelling a scan.")
      return
    }

    setIsCancelling(true)
    setError("")

    try {
      const updatedScan = await cancelSavedScan(activeScan.id, token)
      // A running scan is cancelled between pages, so the backend may still
      // report `running` with a pending cancel request. Treat it as cancelled
      // locally so the UI locks immediately and stops polling.
      const cancelledScan: SavedScanDetail =
        updatedScan.status === "cancelled"
          ? updatedScan
          : { ...updatedScan, status: "cancelled" }
      cancelRequestedRef.current = true
      stopProgress()
      latestScanRef.current = cancelledScan
      setActiveScan(cancelledScan)
      setProgressState("cancelled")
      setProgressText(SCAN_CANCELLED_PROGRESS_TEXT)
      setNotifications([buildScanCancelledNotification()])
    } catch (cancelError) {
      // The scan may have finished between the click and the request; let the
      // poll loop settle on its terminal state instead of forcing a cancel.
      cancelRequestedRef.current = false
      setError(
        cancelError instanceof Error ? cancelError.message : "Failed to cancel the scan."
      )
    } finally {
      setIsCancelling(false)
    }
  }

  function dismissNotification(kind: ScanNotification["kind"]) {
    setNotifications((current) =>
      current.filter((notification) => notification.kind !== kind)
    )
  }

  async function removeQueuedPage(pageUrl: string) {
    if (!activeScan || queueActionUrl) {
      return
    }
    if (!token) {
      setError("Please log in before changing the scan queue.")
      return
    }

    setQueueActionUrl(pageUrl)
    setError("")
    try {
      const updatedScan = await removeScanQueuePage(activeScan.id, pageUrl, token)
      setActiveScan(updatedScan)
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "Failed to remove queued page."
      )
    } finally {
      setQueueActionUrl(null)
    }
  }

  async function prioritizeQueuedPage(pageUrl: string) {
    if (!activeScan || queueActionUrl) {
      return
    }
    if (!token) {
      setError("Please log in before changing the scan queue.")
      return
    }

    setQueueActionUrl(pageUrl)
    setError("")
    try {
      const updatedScan = await prioritizeScanQueuePage(activeScan.id, pageUrl, token)
      setActiveScan(updatedScan)
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "Failed to prioritize queued page."
      )
    } finally {
      setQueueActionUrl(null)
    }
  }

  const canCancel =
    isScanning &&
    (activeScan?.status === "queued" || activeScan?.status === "running")

  return {
    url,
    setUrl,
    result,
    error,
    isScanning,
    isCancelling,
    canCancel,
    progress,
    progressText,
    progressState,
    activeScan,
    queueActionUrl,
    notifications,
    handleScan,
    cancelScan,
    dismissNotification,
    removeQueuedPage,
    prioritizeQueuedPage,
  }
}

function isPendingScan(scan: ScanResponse): boolean {
  return scan.status === "queued" || scan.status === "running"
}

async function pollScanUntilComplete(
  scanId: string,
  onScanUpdate: ((scan: SavedScanDetail) => void) | undefined,
  token: string,
  shouldStop: () => boolean
): Promise<ScanResponse> {
  // Issue total from the last full detail fetch. Lightweight polls only
  // refetch the full payload when this changes, so unchanged polls stay cheap.
  let loadedIssueTotal = 0

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    if (shouldStop()) {
      throw new ScanCancelledError()
    }

    await wait(POLL_INTERVAL_MS)

    if (shouldStop()) {
      throw new ScanCancelledError()
    }

    const lightweightScan = await fetchSavedScan(scanId, token, {
      includeIssues: false,
    })

    if (lightweightScan.status === "cancelled") {
      // Terminal: grab the full detail once so the cancelled scan (and any
      // partial issues it accumulated) lands in the dashboard state.
      const cancelledScan = await fetchSavedScan(scanId, token)
      throw new ScanCancelledError(cancelledScan)
    }

    // Full detail is only needed when the issue count changed since the last
    // full fetch, or when the scan reached a terminal state. The loop is
    // sequential, so at most one full fetch is ever in flight.
    const needsFullDetail =
      lightweightScan.status === "complete" ||
      lightweightScan.status === "error" ||
      lightweightScan.summary.total_issues !== loadedIssueTotal

    const scan = needsFullDetail
      ? await fetchSavedScan(scanId, token)
      : lightweightScan

    if (needsFullDetail) {
      loadedIssueTotal = scan.summary.total_issues
    }

    if (scan.status === "cancelled") {
      throw new ScanCancelledError(scan)
    }

    if (scan.status === "complete") {
      onScanUpdate?.(scan)
      return mapSavedScanToScanResponse(scan)
    }

    if (scan.status === "error") {
      onScanUpdate?.(scan)
      throw new Error(scan.error_message || "Scan failed.")
    }

    onScanUpdate?.(scan)
  }

  throw new Error("Scan is still running. Open Scan History to check progress.")
}

function mapSavedScanToScanResponse(scan: SavedScanDetail): ScanResponse {
  return {
    scan_id: scan.id,
    status: scan.status,
    url: scan.final_url || scan.requested_url,
    scanned_at: scan.completed_at || scan.started_at,
    mode: scan.mode,
    pages_scanned: scan.pages_scanned,
    pages_skipped: scan.pages_skipped,
    scanned_page_urls: scan.scanned_page_urls,
    skipped_page_urls: scan.skipped_page_urls,
    queued_page_urls: scan.queued_page_urls,
    excluded_page_urls: scan.excluded_page_urls,
    current_page_url: scan.current_page_url,
    worker_attempts: scan.worker_attempts,
    max_worker_attempts: scan.max_worker_attempts,
    last_error: scan.last_error,
    summary: scan.summary,
    issues: scan.issues.map(
      (issue): ScanIssue => ({
        ...issue,
        screenshot_data_url: issue.screenshot_data_url,
      })
    ),
  }
}

function shortenUrl(pageUrl: string): string {
  try {
    const parsedUrl = new URL(pageUrl)
    return `${parsedUrl.hostname}${parsedUrl.pathname}`.slice(0, 80)
  } catch {
    return pageUrl.slice(0, 80)
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
