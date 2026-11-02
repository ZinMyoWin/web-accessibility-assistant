import { expect, test } from "@playwright/test"

import { mockCompletedScan, mockPreferences } from "./helpers/backend"
import { E2E_ACCESS_TOKEN, E2E_USER, signInAsE2EUser } from "./helpers/session"

/**
 * Authenticated dashboard flow. The NextAuth session is minted locally and all
 * FastAPI calls are stubbed with `page.route()`, so the spec runs without a
 * backend, database or audit worker.
 */
test.describe("authenticated dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await signInAsE2EUser(context)
  })

  test("renders scan controls and shows issues from a mocked scan", async ({ page }) => {
    await mockPreferences(page)
    const captured = await mockCompletedScan(page)

    await page.goto("/dashboard")

    // Sidebar confirms the authenticated shell rendered.
    await expect(page.getByText("AccessAudit").first()).toBeVisible()
    await expect(page.getByText(E2E_USER.name)).toBeVisible()
    await expect(page.getByText(E2E_USER.email)).toBeVisible()

    // Scan controls.
    const scanButton = page.getByRole("button", { name: "Scan", exact: true })
    const urlInput = page.getByPlaceholder("https://example.com")
    await expect(urlInput).toBeVisible()
    await expect(scanButton).toBeDisabled()
    await expect(page.getByRole("combobox", { name: "Scan mode" })).toBeVisible()

    await urlInput.fill("https://example.com")
    await expect(scanButton).toBeEnabled()
    await scanButton.click()

    // The mocked scan response is rendered by the real dashboard components.
    await expect(
      page.getByText("Scan complete - 2 issues found across 1 page")
    ).toBeVisible()
    await expect(page.getByText("Issues Found", { exact: true })).toBeVisible()
    await expect(page.getByText("Image is missing alternative text.")).toBeVisible()
    await expect(page.getByText("Link text is vague.")).toBeVisible()
    await expect(page.getByText("Total Issues", { exact: true })).toBeVisible()

    // The request carried the session bearer token and the form values.
    expect(captured.authorization).toBe(`Bearer ${E2E_ACCESS_TOKEN}`)
    expect(captured.body?.url).toBe("https://example.com")
    expect(captured.body?.mode).toBe("single")
  })
})
