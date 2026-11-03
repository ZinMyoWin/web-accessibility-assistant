"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MarketingLogo } from "./Logo"

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/about", label: "About" },
]

// Active only matches dedicated routes, never the home-anchor links.
const isActiveLink = (href: string, pathname: string) =>
  !href.includes("#") && pathname === href

export function SiteHeader() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <header
      className="sticky top-0 z-40 border-b border-border-soft bg-surface-0/95 backdrop-blur-md"
    >
      <div className="marketing-wrap flex h-20 items-center gap-6">
        <Link
          href="/"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="AccessAudit home"
          onClick={closeMenu}
        >
          <MarketingLogo />
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-7 md:flex">
          {navLinks.map((link) => {
            const active = isActiveLink(link.href, pathname)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-sm py-3 text-sm font-medium transition-colors hover:text-text-pri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active ? "text-text-pri" : "text-text-muted"
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-6">
          <Link
            href="/login"
            className="hidden rounded-md px-3 py-3 text-sm font-medium text-text-pri transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:block"
          >
            Log in
          </Link>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/register">Start free</Link>
          </Button>
          <button
            ref={menuButton}
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="inline-flex size-11 items-center justify-center rounded-md text-text-pri transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        className={cn(
          "border-t border-border-soft bg-surface-0 px-sp6 pb-sp6 pt-sp4 md:hidden",
          menuOpen ? "block" : "hidden"
        )}
      >
        <nav aria-label="Mobile primary" className="flex flex-col gap-sp1">
          {navLinks.map((link) => {
            const active = isActiveLink(link.href, pathname)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md py-sp3 text-label font-medium transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-brand-700" : "text-text-pri"
                )}
                onClick={closeMenu}
              >
                {link.label}
              </Link>
            )
          })}
          <Button asChild variant="outline" className="mt-sp3 w-full">
            <Link href="/login" onClick={closeMenu}>
              Log in
            </Link>
          </Button>
          <Button asChild className="w-full hover:bg-brand-700">
            <Link href="/register" onClick={closeMenu}>
              Start free
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
