import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DashboardShell } from "./DashboardShell"

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock("@/lib/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "authenticated", user: { name: "Alex Morgan", email: "alex@example.com" }, signOut: vi.fn() }),
}))

describe("DashboardShell navigation", () => {
  beforeEach(() => { document.body.innerHTML = "" })

  it("opens a named navigation dialog and restores focus when Escape closes it", async () => {
    render(<DashboardShell><h1>Workspace</h1></DashboardShell>)
    const toggle = screen.getByRole("button", { name: "Toggle sidebar" })
    toggle.focus()
    fireEvent.click(toggle)
    expect(screen.getByRole("dialog", { name: "Workspace navigation" })).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(toggle).toHaveFocus())
  })

  it("closes mobile navigation when a destination is chosen and provides a skip target", async () => {
    render(<DashboardShell><h1>Workspace</h1></DashboardShell>)
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content")
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content")
    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }))
    const destination = screen.getByRole("dialog").querySelector('a[href="/issues"]')!
    destination.addEventListener("click", (event) => event.preventDefault(), { once: true })
    fireEvent.click(destination)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})
