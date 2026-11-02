import { expect, test } from "@playwright/test"

import { mockQueuedScanWithCancel, mockPreferences } from "./helpers/backend"
import { E2E_ACCESS_TOKEN, signInAsE2EUser } from "./helpers/session"

/**
 * Cancel-scan flow for a queued/running worker scan. Covers the control that
 * calls `POST /scans/{scanId}/cancel` and the cancelled terminal state.
 *
 * Contract (agreed with the frontend owner):
 * - toolbar button "Cancel scan" while status is queued|running
 * - inline confirm prompt "Cancel this scan?" with "Yes, cancel scan" /
 *   "Keep scanning"
 * - success stops polling and shows "Scan cancelled - partial results are kept
 *   below." plus a dismissible "Scan cancelled" status banner
 */
test.describe("scan cancellation", () => {
  test.beforeEach(async ({ context }) => {
    await signInAsE2EUser(context)
  })

  async function startQueuedScan(page: import("@playwright/test").Page) {
    await mockPreferences(page)
    const state = await mockQueuedScanWithCancel(page)

    await page.goto("/dashboard")
    await page.getByPlaceholder("https://example.com").fill("https://example.com")
    await page.getByRole("button", { name: "Scan", exact: true }).click()

    return state
  }

  test("cancels a queued/running scan and shows the cancelled state", async ({ page }) => {
    const state = await startQueuedScan(page)

    const cancelButton = page.getByRole("button", { name: "Cancel scan" })
    await expect(cancelButton).toBeVisible({ timeout: 20_000 })

    // The queue panel is visible while the worker-backed scan is running.
    await expect(page.getByText("Scan queue")).toBeVisible()

    await cancelButton.click()
    await expect(page.getByText("Cancel this scan?")).toBeVisible()
    await page.getByRole("button", { name: "Yes, cancel scan" }).click()

    await expect(
      page.getByText("Scan cancelled - partial results are kept below.")
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Scan cancelled", { exact: true })).toBeVisible()

    // Exactly one cancel request, authenticated with the session bearer token.
    expect(state.cancelRequests).toHaveLength(1)
    expect(state.cancelRequests[0].authorization).toBe(
      `Bearer ${E2E_ACCESS_TOKEN}`
    )

    // A terminal scan no longer offers cancellation.
    await expect(cancelButton).toBeHidden()
  })

  test("keeps scanning when the inline confirm prompt is dismissed", async ({ page }) => {
    await startQueuedScan(page)

    const cancelButton = page.getByRole("button", { name: "Cancel scan" })
    await expect(cancelButton).toBeVisible({ timeout: 20_000 })

    await cancelButton.click()
    await expect(page.getByText("Cancel this scan?")).toBeVisible()
    await page.getByRole("button", { name: "Keep scanning" }).click()

    await expect(page.getByText("Cancel this scan?")).toBeHidden()
    await expect(cancelButton).toBeVisible()
  })
})
