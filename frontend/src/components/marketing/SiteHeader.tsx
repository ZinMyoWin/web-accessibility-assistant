"use client"

import Link from "next/link"
import { Menu, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MarketingLogo } from "./Logo"

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#about", label: "About" },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const closeMenu = () => setMenuOpen(false)

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-surface-0/80 backdrop-blur-xl transition-[border-color,box-shadow]",
        scrolled
          ? "border-border-soft shadow-nav"
          : "border-transparent shadow-none"
      )}
    >
      <div className="marketing-wrap flex h-16 items-center gap-sp8">
        <Link
          href="/"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="AccessAudit home"
          onClick={closeMenu}
        >
          <MarketingLogo />
        </Link>

        <nav aria-label="Primary" className="ml-sp4 hidden gap-sp6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-label font-medium text-text-muted transition-colors hover:text-text-pri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-sp3">
          <Link
            href="/login"
            className="rounded-md px-sp3 py-control-y text-label font-medium text-text-pri transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Log in
          </Link>
          <Button asChild className="shadow-card hover:bg-brand-700">
            <Link href="/register">Start free</Link>
          </Button>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="inline-flex size-9 items-center justify-center rounded-md text-text-pri transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
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
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md py-sp3 text-label font-medium text-text-pri transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={closeMenu}
            >
              {link.label}
            </Link>
          ))}
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
