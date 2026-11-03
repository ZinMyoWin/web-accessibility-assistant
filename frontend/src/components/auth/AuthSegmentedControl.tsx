"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const segments = [
  { href: "/login", label: "Log in" },
  { href: "/register", label: "Sign up" },
] as const

/**
 * Log in / Sign up toggle rendered as navigation links styled as a segmented
 * control. The link matching the current route is marked active and exposes
 * aria-current="page".
 */
export function AuthSegmentedControl() {
  const pathname = usePathname()

  return (
    <nav
      className="mb-9 grid grid-cols-2 gap-1 rounded-xl bg-surface-1 p-1"
      aria-label="Authentication mode"
    >
      {segments.map((segment) => {
        const active =
          pathname === segment.href ||
          (pathname === "/signup" && segment.href === "/register")
        return (
          <Link
            key={segment.href}
            href={segment.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-[10px] px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              active
                ? "bg-surface-0 text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {segment.label}
          </Link>
        )
      })}
    </nav>
  )
}
