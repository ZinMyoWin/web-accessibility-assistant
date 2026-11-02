import { expect, test } from "@playwright/test"

/**
 * Public marketing landing page. No backend calls are involved, so this spec
 * exercises the real Next.js rendering path with zero stubs.
 */
test.describe("marketing landing page", () => {
  test("renders the hero copy and primary call to action", async ({ page }) => {
    await page.goto("/")

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /find and fix accessibility issues across your site/i,
      })
    ).toBeVisible()

    await expect(
      page.getByText(
        /AccessAudit crawls your pages, detects WCAG 2\.2 violations/i
      )
    ).toBeVisible()

    await expect(page.getByRole("group", { name: "Start a scan" })).toBeVisible()

    const runFreeScan = page.getByRole("link", { name: "Run free scan" })
    await expect(runFreeScan).toBeVisible()
    await expect(runFreeScan).toHaveAttribute("href", "/register")
  })

  test("public registration page renders the create-account form", async ({ page }) => {
    await page.goto("/register")

    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible()
    await expect(page.getByRole("link", { name: "Log in" }).first()).toHaveAttribute(
      "href",
      "/login"
    )
  })
})
