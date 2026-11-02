import { expect, test } from "@playwright/test"

/**
 * The NextAuth middleware guard for the dashboard route group. An anonymous
 * browser session must be redirected to the login page.
 */
test.describe("dashboard route guard", () => {
  test("redirects anonymous visitors from /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard")

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()
  })
})
