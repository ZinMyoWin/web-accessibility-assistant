import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useDashboardScan } from "@/hooks/useDashboardScan"
import { cancelSavedScan, fetchSavedScan } from "@/lib/saved-scans"
import { SCAN_CANCELLED_PROGRESS_TEXT } from "@/lib/scan-notifications"
import { makeSavedScanDetail } from "@/test/saved-scan-fixtures"

vi.mock("@/lib/contexts/AuthContext", () => ({
  useAuth: () => ({ token: "test-token" }),
}))

vi.mock("@/lib/saved-scans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/saved-scans")>()
  return {
    ...actual,
    fetchSavedScan: vi.fn(),
    removeScanQueuePage: vi.fn(),
    prioritizeScanQueuePage: vi.fn(),
    cancelSavedScan: vi.fn(),
  }
})

const preferences = {
  default_page_limit: 5,
  crawl_depth: 3,
  request_delay_ms: 250,
  page_timeout_ms: 15000,
  ignored_url_patterns: [],
  stay_within_domain: true,
  respect_robots_txt: true,
  skip_previously_scanned_pages: true,
  notify_on_scan_complete: true,
  notify_on_scan_failed: true,
  notify_on_high_severity: false,
  notify_score_threshold_enabled: false,
  notify_score_threshold: 70,
}

const queuedScanResponse = {
  scan_id: "scan-1",
  status: "queued",
  url: "https://example.com",
  scanned_at: "2026-07-12T00:00:00.000Z",
  mode: "multi",
  pages_scanned: 0,
  pages_skipped: 0,
  scanned_page_urls: [],
  skipped_page_urls: [],
  queued_page_urls: [],
  excluded_page_urls: [],
  current_page_url: null,
  worker_attempts: 0,
  max_worker_attempts: 3,
  last_error: null,
  summary: { total_issues: 0, high: 0, medium: 0, low: 0 },
  issues: [],
}

function stubScanRequest() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => queuedScanResponse,
    })
  )
}

describe("useDashboardScan partial results", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubScanRequest()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("streams partial issues into the dashboard while the scan is still running", async () => {
    const runningScan = makeSavedScanDetail({
      status: "running",
      completed_at: null,
      current_page_url: "https://example.com/contact",
    })
    const completeScan = makeSavedScanDetail({ status: "complete" })
    vi.mocked(fetchSavedScan)
      .mockResolvedValueOnce(runningScan)
      .mockResolvedValueOnce(completeScan)

    const { result } = renderHook(() => useDashboardScan())
    act(() => {
      result.current.setUrl("https://example.com")
    })

    let scanPromise: Promise<void> = Promise.resolve()
    act(() => {
      scanPromise = result.current.handleScan("multi", preferences)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(result.current.isScanning).toBe(true)
    expect(result.current.result?.summary.total_issues).toBe(2)
    expect(result.current.result?.issues).toHaveLength(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    await act(async () => {
      await scanPromise
    })

    expect(result.current.isScanning).toBe(false)
    expect(result.current.result?.summary.total_issues).toBe(2)
    expect(result.current.progressState).toBe("done")
    expect(result.current.notifications.map((item) => item.kind)).toEqual([
      "scan-complete",
    ])
  })

  it("surfaces a scan failed notification when the polled scan errors", async () => {
    const failedScan = makeSavedScanDetail({
      status: "error",
      completed_at: null,
      error_message: "Connection timeout",
    })
    vi.mocked(fetchSavedScan).mockResolvedValueOnce(failedScan)

    const { result } = renderHook(() => useDashboardScan())
    act(() => {
      result.current.setUrl("https://example.com")
    })

    let scanPromise: Promise<void> = Promise.resolve()
    act(() => {
      scanPromise = result.current.handleScan("multi", preferences)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    await act(async () => {
      await scanPromise
    })

    expect(result.current.progressState).toBe("error")
    expect(result.current.error).toBe("Connection timeout")
    expect(result.current.notifications).toEqual([
      expect.objectContaining({ kind: "scan-failed", title: "Scan failed" }),
    ])
  })
})

describe("useDashboardScan cancel", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubScanRequest()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("calls the cancel endpoint, stops polling, and keeps partial results", async () => {
    const runningScan = makeSavedScanDetail({
      status: "running",
      completed_at: null,
      current_page_url: "https://example.com/contact",
    })
    vi.mocked(fetchSavedScan).mockResolvedValue(runningScan)
    // A running scan is cancelled between pages: the backend returns the scan
    // with the cancel request registered but the status may still be running.
    vi.mocked(cancelSavedScan).mockResolvedValue(
      makeSavedScanDetail({ status: "running", completed_at: null })
    )

    const { result } = renderHook(() => useDashboardScan())
    act(() => {
      result.current.setUrl("https://example.com")
    })

    let scanPromise: Promise<void> = Promise.resolve()
    act(() => {
      scanPromise = result.current.handleScan("multi", preferences)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(result.current.canCancel).toBe(true)
    expect(result.current.activeScan?.status).toBe("running")
    const pollCallsBeforeCancel = vi.mocked(fetchSavedScan).mock.calls.length

    await act(async () => {
      await result.current.cancelScan()
    })

    expect(cancelSavedScan).toHaveBeenCalledWith("scan-1", "test-token")
    expect(result.current.progressState).toBe("cancelled")
    expect(result.current.progressText).toBe(SCAN_CANCELLED_PROGRESS_TEXT)
    expect(result.current.notifications.map((item) => item.kind)).toEqual([
      "scan-cancelled",
    ])
    expect(result.current.activeScan?.status).toBe("cancelled")
    expect(result.current.canCancel).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await act(async () => {
      await scanPromise
    })

    expect(vi.mocked(fetchSavedScan).mock.calls.length).toBe(pollCallsBeforeCancel)
    expect(result.current.isScanning).toBe(false)
    expect(result.current.result?.summary.total_issues).toBe(2)
  })

  it("shows the backend message and keeps polling when the scan already finished", async () => {
    const runningScan = makeSavedScanDetail({
      status: "running",
      completed_at: null,
    })
    vi.mocked(fetchSavedScan).mockResolvedValue(runningScan)
    vi.mocked(cancelSavedScan).mockRejectedValue(
      new Error("This scan has already finished. Refresh scan history to see the final result.")
    )

    const { result } = renderHook(() => useDashboardScan())
    act(() => {
      result.current.setUrl("https://example.com")
    })

    act(() => {
      void result.current.handleScan("multi", preferences)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    await act(async () => {
      await result.current.cancelScan()
    })

    expect(result.current.error).toContain("already finished")
    expect(result.current.progressState).toBe("active")
    expect(result.current.isCancelling).toBe(false)

    // The scan keeps polling after the rejected cancel and can still finish.
    vi.mocked(fetchSavedScan).mockResolvedValue(
      makeSavedScanDetail({ status: "complete" })
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(result.current.progressState).toBe("done")
  })
})
