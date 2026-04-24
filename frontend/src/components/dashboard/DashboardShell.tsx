"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"

const iconClass = "w-4 h-4 shrink-0"

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/",
    icon: (
      <svg className={iconClass} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
        <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity=".4" />
        <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity=".4" />
        <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity=".4" />
      </svg>
    ),
  },
  {
    label: "Issues",
    href: "/issues",
    icon: (
      <svg className={iconClass} viewBox="0 0 16 16" fill="none">
        <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Scan History",
    href: "/scan-history",
    icon: (
      <svg className={iconClass} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v3.5l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "Reports",
    href: "/reports",
    icon: (
      <svg className={iconClass} viewBox="0 0 16 16" fill="none">
        <path d="M3 12V8M6 12V5M9 12V7M12 12V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
]

interface DashboardShellProps {
  children: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  return (
    <>
      {/* Mobile sidebar overlay */}
      <div
        className={sidebarOpen ? "fixed inset-0 bg-black/30 z-20 md:hidden" : "hidden"}
        onClick={() => setSidebarOpen(false)}
      />

      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[var(--width-sidebar)_1fr]">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-30 flex h-screen w-sidebar flex-col overflow-y-auto border-r border-border bg-card transition-transform duration-200",
            sidebarOpen
              ? "translate-x-0 shadow-lg"
              : "-translate-x-full",
            "md:sticky md:top-0 md:z-0 md:translate-x-0 md:shadow-none md:transition-none"
          )}
        >
          <div className="border-b border-border px-4 pb-3.5 pt-4">
            <div className="text-sm font-bold tracking-tight text-primary">
              AccessAudit
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              v1.0 &middot; BSc Project
            </div>
          </div>

          <nav className="flex flex-col gap-0.5 py-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 border-l-2 px-4 py-2 text-sm transition-colors",
                    active
                      ? "border-l-primary bg-secondary text-primary font-medium [&_svg]:opacity-100"
                      : "border-l-transparent text-muted-foreground hover:bg-background hover:text-foreground [&_svg]:opacity-65"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="px-4 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Settings
          </div>
          <Link
            href="/preferences"
            className={cn(
              "flex items-center gap-2.5 border-l-2 px-4 py-2 text-sm transition-colors",
              pathname === "/preferences"
                ? "border-l-primary bg-secondary text-primary font-medium [&_svg]:opacity-100"
                : "border-l-transparent text-muted-foreground hover:bg-background hover:text-foreground [&_svg]:opacity-65"
            )}
          >
            <svg className={iconClass} viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Preferences
          </Link>
        </aside>

        {/* Main content area */}
        <div className="flex min-h-screen flex-col">
          {/* Mobile menu button — rendered inside each page's topbar if needed */}
          <button
            className="fixed left-3 top-3 z-10 flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground md:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <svg className="size-4" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {children}
        </div>
      </div>
    </>
  )
}
