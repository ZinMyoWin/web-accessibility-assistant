import { expect, test } from "@playwright/test"

/**
 * Login page rendering plus the client-side validation that runs before any
 * credential request is made. No backend is required.
 */
test.describe("login page", () => {
  test("renders the credentials form and its secondary links", async ({ page }) => {
    await page.goto("/login")

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()
    await expect(page.locator('input[autocomplete="email"]')).toBeVisible()
    await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible()
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password"
    )
    await expect(page.getByRole("link", { name: "Sign up free" })).toHaveAttribute(
      "href",
      "/register"
    )
  })

  test("shows client-side validation errors for empty and invalid input", async ({
    page,
  }) => {
    await page.goto("/login")

    const submit = page.getByRole("button", { name: "Log in" })
    const emailInput = page.locator('input[autocomplete="email"]')
    const passwordInput = page.locator('input[autocomplete="current-password"]')
    // Scope to the form panel: Next.js renders its own empty route announcer
    // with role="alert" at the document level.
    const alert = page.getByRole("main").getByRole("alert")

    // Empty form: email is validated first.
    await submit.click()
    await expect(alert).toHaveText("Enter a valid email address.")

    // Malformed email address.
    await emailInput.fill("not-an-email")
    await passwordInput.fill("password123")
    await submit.click()
    await expect(alert).toHaveText("Enter a valid email address.")

    // Valid email but missing password.
    await emailInput.fill("e2e@example.com")
    await passwordInput.fill("")
    await submit.click()
    await expect(alert).toHaveText("Enter your password.")
  })
})
