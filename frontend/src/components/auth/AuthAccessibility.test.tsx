import { fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthSegmentedControl } from "@/components/auth/AuthSegmentedControl"
import { PasswordField } from "@/components/auth/PasswordField"

const route = vi.hoisted(() => ({ pathname: "/login" }))

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}))

describe("authentication accessibility", () => {
  beforeEach(() => {
    route.pathname = "/login"
  })

  it("exposes account routes as navigation and identifies the current page", () => {
    render(<AuthSegmentedControl />)

    const navigation = screen.getByRole("navigation", { name: "Authentication mode" })
    expect(within(navigation).getByRole("link", { name: "Log in" })).toHaveAttribute("aria-current", "page")
    expect(within(navigation).getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register")
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
  })

  it("announces password visibility and preserves the entered password", () => {
    function PasswordExample() {
      const [value, setValue] = useState("secret123")
      return <PasswordField label="Password" value={value} onChange={setValue} autoComplete="current-password" />
    }

    render(<PasswordExample />)
    const password = screen.getByLabelText("Password")
    const reveal = screen.getByRole("button", { name: "Show password" })
    expect(reveal).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(reveal)
    expect(password).toHaveAttribute("type", "text")
    expect(password).toHaveValue("secret123")
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }))
    expect(password).toHaveAttribute("type", "password")
    expect(password).toHaveValue("secret123")
  })

  it("identifies sign up as the current section on the legacy signup route", () => {
    route.pathname = "/signup"
    render(<AuthSegmentedControl />)

    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("aria-current", "page")
  })
})
