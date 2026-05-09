"use client"

import { useEffect, useRef, useState } from "react"
import { API, TEST_URL } from "@/components/home/constants"
import type { ProgressState, ScanIssue, ScanResponse } from "@/components/home/types"
import { authHeaders } from "@/lib/api"
import { useAuth } from "@/lib/contexts/AuthContext"
import type { AppPreferences } from "@/lib/contexts/PreferencesContext"
import {
  fetchSavedScan,
  prioritizeScanQueuePage,
  removeScanQueuePage,
  type SavedScanDetail,
} from "@/lib/saved-scans"

type ScanErrorBody = {
  detail?: string
}

const SYNC_CRAWL_PAGE_LIMIT = 5
const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 180

export function useDashboardScan() {
  const { token } = useAuth()
  const [url, setUrl] = useState(TEST_URL)
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [error, setError] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState(
    "Ready to scan - enter a URL above"
  )
  const [progressState, setProgressState] = useState<ProgressState>("idle")
  const [activeScan, setActiveScan] = useState<SavedScanDetail | null>(null)
  const [queueActionUrl, setQueueActionUrl] = useState<string | null>(null)

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current)
      }
    }
  }, [])

  function setTestUrl() {
    setUrl(TEST_URL)
  }

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

  async function handleScan(
    mode: "single" | "multi",
    preferences: Pick<
      AppPreferences,
      | "default_page_limit"
      | "crawl_depth"
      | "request_delay_ms"
      | "page_timeout_ms"
      | "ignored_url_patterns"
      | "stay_within_domain"
      | "respect_robots_txt"
      | "skip_previously_scanned_pages"
    >
  ) {
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
            : "Scan worker is running full multi-page analysis..."
        )
      }

      const completedData =
        pendingScanId
          ? await pollScanUntilComplete(pendingScanId, (scan) => {
              if (!token) {
                return
              }
              setActiveScan(scan)
              setProgressText(
                scan.status === "queued"
                  ? "Scan queued - waiting for scan worker..."
                  : scan.current_page_url
                    ? `Scanning ${shortenUrl(scan.current_page_url)}...`
                    : "Scan worker is running full multi-page analysis..."
              )
            }, token)
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
    } catch (scanError) {
      const message =
        scanError instanceof Error
          ? scanError.message
          : "Unexpected error while scanning."
      setError(message)
      setProgress(0)
      setProgressText("Scan failed - check the URL and try again")
      setProgressState("error")
    } finally {
      stopProgress()
      setIsScanning(false)
    }
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

  return {
    url,
    setUrl,
    setTestUrl,
    result,
    error,
    isScanning,
    progress,
    progressText,
    progressState,
    activeScan,
    queueActionUrl,
    handleScan,
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
  token: string
): Promise<ScanResponse> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await wait(POLL_INTERVAL_MS)

    const scan = await fetchSavedScan(scanId, token)
    onScanUpdate?.(scan)

    if (scan.status === "queued" || scan.status === "running") {
      continue
    }

    if (scan.status === "complete") {
      return mapSavedScanToScanResponse(scan)
    }

    if (scan.status === "error") {
      throw new Error(scan.error_message || "Multi-page scan failed.")
    }
  }

  throw new Error("Multi-page scan is still running. Open Scan History to check progress.")
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
        screenshot_data_url: null,
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
