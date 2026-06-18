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
    <div
      className="mb-8 grid grid-cols-2 gap-1 rounded-md border border-border-soft bg-surface-1 p-1"
      role="tablist"
      aria-label="Authentication mode"
    >
      {segments.map((segment) => {
        const active = pathname === segment.href
        return (
          <Link
            key={segment.href}
            href={segment.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-sm py-2 text-center text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active
                ? "bg-surface-0 text-brand-700 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {segment.label}
          </Link>
        )
      })}
    </div>
  )
}
