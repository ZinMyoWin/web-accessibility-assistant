import type { Page, Route } from "@playwright/test"

import {
  cancelledSavedScanFixture,
  completedScanFixture,
  preferencesFixture,
  queuedScanFixture,
  runningSavedScanFixture,
} from "./fixtures"

/**
 * `page.route()` stubs for the FastAPI backend. The frontend calls
 * `NEXT_PUBLIC_API_BASE_URL` from the browser, so every backend request can be
 * intercepted here; no FastAPI process, database, Playwright renderer or AI
 * provider call is needed for the E2E suite.
 */

const PREFERENCES_URL = /\/preferences$/
const SCAN_PAGE_URL = /\/scan\/page$/
const SCAN_DETAIL_URL = /\/scans\/[^/]+$/
const SCAN_CANCEL_URL = /\/scans\/[^/]+\/cancel$/

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

/** Stub the preferences load performed by `PreferencesProvider`. */
export async function mockPreferences(page: Page): Promise<void> {
  await page.route(PREFERENCES_URL, async (route) => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, preferencesFixture)
      return
    }
    await route.fallback()
  })
}

export type CapturedScanRequest = {
  authorization: string | undefined
  body: Record<string, unknown> | null
}

/** Stub a synchronous single-page scan that completes immediately. */
export async function mockCompletedScan(page: Page): Promise<CapturedScanRequest> {
  const captured: CapturedScanRequest = { authorization: undefined, body: null }

  await page.route(SCAN_PAGE_URL, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback()
      return
    }

    captured.authorization = route.request().headers()["authorization"]
    captured.body = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, completedScanFixture)
  })

  return captured
}

export type CapturedCancelFlow = {
  scanRequest: CapturedScanRequest
  cancelRequests: Array<{ authorization: string | undefined }>
  pollRequests: number
}

/**
 * Stub a queued multi-page scan that the dashboard polls as `running`, plus a
 * successful `POST /scans/{scanId}/cancel`. This creates the queued/running
 * window in which the dashboard exposes the "Cancel scan" control.
 */
export async function mockQueuedScanWithCancel(page: Page): Promise<CapturedCancelFlow> {
  const state: CapturedCancelFlow = {
    scanRequest: { authorization: undefined, body: null },
    cancelRequests: [],
    pollRequests: 0,
  }

  await page.route(SCAN_PAGE_URL, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback()
      return
    }

    state.scanRequest.authorization = route.request().headers()["authorization"]
    state.scanRequest.body = route.request().postDataJSON() as Record<string, unknown>
    await fulfillJson(route, queuedScanFixture)
  })

  await page.route(SCAN_DETAIL_URL, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback()
      return
    }

    state.pollRequests += 1
    await fulfillJson(route, runningSavedScanFixture)
  })

  await page.route(SCAN_CANCEL_URL, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback()
      return
    }

    state.cancelRequests.push({
      authorization: route.request().headers()["authorization"],
    })
    await fulfillJson(route, cancelledSavedScanFixture)
  })

  return state
}
