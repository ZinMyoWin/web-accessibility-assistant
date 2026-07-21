import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useDashboardScan } from "@/hooks/useDashboardScan"
import { fetchSavedScan } from "@/lib/saved-scans"
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

describe("useDashboardScan partial results", () => {
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
  })
})
