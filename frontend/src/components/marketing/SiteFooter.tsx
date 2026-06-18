import Link from "next/link"
import { MarketingLogo } from "./Logo"

const footerGroups = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#how", label: "How it works" },
      { href: "/login", label: "Log in" },
      { href: "/register", label: "Start free" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "#about", label: "About" },
      { href: "#", label: "Contact" },
      { href: "#", label: "Accessibility statement" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "#", label: "Privacy policy" },
      { href: "#", label: "Terms of service" },
      { href: "#", label: "Cookie policy" },
    ],
  },
]

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border-soft bg-surface-0 py-sp16 pb-sp8">
      <div className="marketing-wrap">
        <div className="grid gap-sp10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link
              href="/"
              className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="AccessAudit home"
            >
              <MarketingLogo />
            </Link>
            <p className="mt-sp4 max-w-xs text-caption leading-relaxed text-text-muted">
              Automated web accessibility audits with AI-guided repair
              suggestions, checked against WCAG 2.2.
            </p>
          </div>

          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="mb-sp4 text-caption font-semibold uppercase tracking-widest text-text-muted">
                {group.title}
              </h2>
              <ul className="flex flex-col">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="block py-sp2 text-label font-medium text-text-pri transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-sp16 flex flex-wrap items-center justify-between gap-sp3 border-t border-border-soft pt-sp6 text-caption text-text-muted">
          <span>&copy; {year} AccessAudit. All rights reserved.</span>
          <span>Built with axe-core &middot; WCAG 2.2</span>
        </div>
      </div>
    </footer>
  )
}
