import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useDashboardScan } from "@/hooks/useDashboardScan"
import {
  cancelSavedScan,
  fetchSavedScan,
  type SavedScanDetail,
  type SavedScanIssue,
} from "@/lib/saved-scans"
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

const extraIssue: SavedScanIssue = {
  rule_id: "color-contrast",
  severity: "low",
  element: '<p class="muted">Subtext</p>',
  message: "Element must meet colour contrast minimums.",
  recommendation: "Increase the contrast ratio.",
  line: 40,
  column: 2,
  source_hint: '<p class="muted">',
  dom_path: "html > body > p:nth-of-type(2)",
  text_preview: "Subtext",
  screenshot_data_url: null,
  wcag_criteria: ["WCAG 1.4.3 AA"],
  source: "axe-core",
  page_url: "https://example.com",
}

/** Lightweight poll payload: same metadata, no issues. */
function withoutIssues(scan: SavedScanDetail): SavedScanDetail {
  return { ...scan, issues: [] }
}

/**
 * Mock `fetchSavedScan` for polling tests: lightweight requests read the
 * current phase; full detail requests only happen when the hook asks for them.
 */
function mockPolling(state: { phase: "running" | "complete" | "error" }) {
  const runningScan = makeSavedScanDetail({
    status: "running",
    completed_at: null,
    current_page_url: "https://example.com/contact",
  })
  const completeScan = makeSavedScanDetail({ status: "complete" })
  const failedScan = makeSavedScanDetail({
    status: "error",
    completed_at: null,
    error_message: "Connection timeout",
  })

  vi.mocked(fetchSavedScan).mockImplementation(async (_scanId, _token, options) => {
    const base =
      state.phase === "complete"
        ? completeScan
        : state.phase === "error"
          ? failedScan
          : runningScan
    return options?.includeIssues === false ? withoutIssues(base) : base
  })
}

function requestKinds() {
  return vi.mocked(fetchSavedScan).mock.calls.map((call) =>
    call[2]?.includeIssues === false ? "light" : "full"
  )
}

async function startScan() {
  const { result } = renderHook(() => useDashboardScan())
  act(() => {
    result.current.setUrl("https://example.com")
  })

  let scanPromise: Promise<void> = Promise.resolve()
  act(() => {
    scanPromise = result.current.handleScan("multi", preferences)
  })

  return { result, scanPromise: () => scanPromise }
}

describe("useDashboardScan polling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => queuedScanResponse,
      })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("polls lightweight and fetches issues once when the summary changes", async () => {
    const state: { phase: "running" | "complete" } = { phase: "running" }
    mockPolling(state)
    const { result, scanPromise } = await startScan()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    // First poll: lightweight status, then full detail because the scan
    // already has issues to stream.
    expect(requestKinds()).toEqual(["light", "full"])
    expect(result.current.isScanning).toBe(true)
    expect(result.current.result?.summary.total_issues).toBe(2)
    expect(result.current.result?.issues).toHaveLength(2)

    // Second poll with an unchanged summary: lightweight only, no refetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(requestKinds()).toEqual(["light", "full", "light"])
    expect(result.current.result?.issues).toHaveLength(2)

    // Terminal status always fetches the full detail once.
    state.phase = "complete"
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(requestKinds()).toEqual(["light", "full", "light", "light", "full"])
    await act(async () => {
      await scanPromise()
    })

    expect(result.current.isScanning).toBe(false)
    expect(result.current.progressState).toBe("done")
    expect(result.current.result?.issues).toHaveLength(2)
    expect(result.current.notifications.map((item) => item.kind)).toEqual([
      "scan-complete",
    ])
  })

  it("fetches the full detail when the issue total changes mid-scan", async () => {
    const twoIssueScan = makeSavedScanDetail({
      status: "running",
      completed_at: null,
    })
    const threeIssueScan = makeSavedScanDetail({
      status: "running",
      completed_at: null,
      issues: [...makeSavedScanDetail().issues, extraIssue],
      summary: { total_issues: 3, high: 2, medium: 1, low: 0 },
    })

    let currentScan = twoIssueScan
    vi.mocked(fetchSavedScan).mockImplementation(async (_scanId, _token, options) => {
      return options?.includeIssues === false ? withoutIssues(currentScan) : currentScan
    })

    const { result, scanPromise } = await startScan()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    expect(requestKinds()).toEqual(["light", "full"])
    expect(result.current.result?.issues).toHaveLength(2)

    currentScan = threeIssueScan
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(requestKinds()).toEqual(["light", "full", "light", "full"])
    expect(result.current.result?.summary.total_issues).toBe(3)
    expect(result.current.result?.issues).toHaveLength(3)

    // Stop the still-running poll loop.
    vi.mocked(cancelSavedScan).mockResolvedValue(
      makeSavedScanDetail({ status: "cancelled", completed_at: null })
    )
    await act(async () => {
      await result.current.cancelScan()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    await act(async () => {
      await scanPromise()
    })
  })

  it("fetches the full detail for a failed scan before reporting the error", async () => {
    const state: { phase: "running" | "error" } = { phase: "error" }
    mockPolling(state)
    const { result, scanPromise } = await startScan()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    await act(async () => {
      await scanPromise()
    })

    expect(requestKinds()).toEqual(["light", "full"])
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => queuedScanResponse,
      })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("calls the cancel endpoint, stops polling, and keeps partial results", async () => {
    const state: { phase: "running" | "complete" } = { phase: "running" }
    mockPolling(state)
    // A running scan is cancelled between pages: the backend returns the scan
    // with the cancel request registered but the status may still be running.
    vi.mocked(cancelSavedScan).mockResolvedValue(
      makeSavedScanDetail({ status: "running", completed_at: null })
    )

    const { result, scanPromise } = await startScan()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(result.current.canCancel).toBe(true)
    expect(result.current.activeScan?.status).toBe("running")
    const requestsBeforeCancel = requestKinds().length

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
      await scanPromise()
    })

    // No polls are issued after the cancel request succeeds.
    expect(requestKinds().length).toBe(requestsBeforeCancel)
    expect(result.current.isScanning).toBe(false)
    expect(result.current.result?.summary.total_issues).toBe(2)
  })

  it("shows the backend message and keeps polling when the scan already finished", async () => {
    const state: { phase: "running" | "complete" } = { phase: "running" }
    mockPolling(state)
    vi.mocked(cancelSavedScan).mockRejectedValue(
      new Error(
        "This scan has already finished. Refresh scan history to see the final result."
      )
    )

    const { result, scanPromise } = await startScan()

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
    state.phase = "complete"
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })
    await act(async () => {
      await scanPromise()
    })

    expect(result.current.progressState).toBe("done")
    expect(requestKinds().at(-2)).toBe("light")
    expect(requestKinds().at(-1)).toBe("full")
  })
})
