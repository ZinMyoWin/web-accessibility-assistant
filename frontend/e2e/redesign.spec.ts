import { expect, test, type Page } from "@playwright/test"
import path from "node:path"
import { preferencesFixture, runningSavedScanFixture } from "./helpers/fixtures"
import { signInAsE2EUser } from "./helpers/session"

const savedScan = {
  ...runningSavedScanFixture,
  id: "scan-redesign",
  status: "complete",
  score: 72,
  completed_at: "2026-01-01T00:00:20Z",
  duration_seconds: 20,
  queued_page_urls: [],
  current_page_url: null,
}

async function mockWorkspace(page: Page) {
  await page.route(/\/preferences$/, route => route.request().isNavigationRequest()
    ? route.fallback()
    : route.fulfill({ json: preferencesFixture }))
  await page.route(/\/scans(?:\?.*)?$/, route => route.fulfill({ json: { items: [savedScan], total: 1, limit: 10, offset: 0 } }))
  await page.route(/\/scans\/scan-redesign$/, route => route.fulfill({ json: savedScan }))
}

const publicRoutes = ["/", "/about", "/login", "/register", "/forgot-password", "/reset-password", "/signup"]
const workspaceRoutes = ["/dashboard", "/issues", "/scan-history", "/reports", "/preferences"]

async function checkAccessibility(page: Page) {
  await page.addScriptTag({ path: path.resolve("../backend/app/assets/axe.min.js") })
  const violations = await page.evaluate(`(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
    });
    return result.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }));
  })()`)
  expect(violations, `Accessibility checks for ${page.url()}`).toEqual([])
}

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`all pages reflow without horizontal overflow at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    for (const route of publicRoutes) {
      await page.goto(route)
      await expect(page.getByRole("main")).toBeVisible()
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), route).toBe(true)
      await checkAccessibility(page)
    }
    await signInAsE2EUser(context)
    await mockWorkspace(page)
    for (const route of workspaceRoutes) {
      await page.goto(route)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), route).toBe(true)
      await checkAccessibility(page)
    }
  })
}

test("mobile menus and issue inspection support keyboard dismissal and focus return", async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const publicMenu = page.getByRole("button", { name: "Open menu" })
  await publicMenu.click()
  await expect(page.getByRole("navigation", { name: "Mobile primary" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(publicMenu).toBeFocused()

  await signInAsE2EUser(context)
  await mockWorkspace(page)
  await page.goto("/issues")
  const menu = page.getByRole("button", { name: "Toggle sidebar" })
  await menu.click()
  await expect(page.getByRole("dialog", { name: "Workspace navigation" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(menu).toBeFocused()

  const issue = page.getByRole("button", { name: /Image is missing alternative text/ })
  await issue.click()
  const inspector = page.getByRole("dialog", { name: "Issue details" })
  await expect(inspector).toBeVisible()
  await expect(inspector.getByText("Suggested fix", { exact: true })).toBeVisible()
  await expect(inspector.getByText("Add meaningful alt text to informative images.")).toBeVisible()
  await inspector.getByText("Suggested fix", { exact: true }).scrollIntoViewIfNeeded()
  await expect(inspector.getByText("Suggested fix", { exact: true })).toBeInViewport()
  await checkAccessibility(page)
  await page.keyboard.press("Escape")
  await expect(issue).toBeFocused()
})

test("report print layout retains page findings and removes workspace navigation", async ({ page, context }) => {
  await signInAsE2EUser(context)
  await mockWorkspace(page)
  await page.goto("/reports")
  await expect(page.getByRole("heading", { name: "Accessibility report" })).toBeVisible()
  await page.emulateMedia({ media: "print" })
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeHidden()
  await expect(page.getByText("Pages in this scan", { exact: true })).toBeVisible()
  await expect(page.getByText("Image is missing alternative text.", { exact: true })).toBeVisible()
})

test("empty and failed reports offer a working next step", async ({ page, context }) => {
  await signInAsE2EUser(context)
  await mockWorkspace(page)
  await page.route(/\/scans(?:\?.*)?$/, route => route.fulfill({ json: { items: [], total: 0, limit: 10, offset: 0 } }))
  await page.goto("/reports")
  await expect(page.getByRole("heading", { name: "Your accessibility report" })).toBeVisible()
  await expect(page.getByText("No saved scans are available for reports yet.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Run a scan" })).toHaveAttribute("href", "/dashboard")
  await checkAccessibility(page)
  await page.route(/\/scans(?:\?.*)?$/, route => route.fulfill({ status: 500, json: { detail: "Saved reports could not be loaded." } }))
  await page.reload()
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Saved reports could not be loaded.")
  await expect(page.getByRole("link", { name: "Run a scan" })).toHaveAttribute("href", "/dashboard")
})
