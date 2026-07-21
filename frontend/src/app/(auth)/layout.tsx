import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"
import { AuthSegmentedControl } from "@/components/auth/AuthSegmentedControl"

const trustPoints = [
  "WCAG 2.2 detection on every page",
  "AI repair suggestions for each issue",
  "Free while in beta, no card required",
]

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-sm bg-brand-500 shadow-logo">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className="size-4"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="1.5" />
          <path
            d="M5 8.5L7 10.5L11 6.5"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-base font-bold tracking-tight text-white">
        AccessAudit
      </span>
    </Link>
  )
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-screen auth:grid-cols-auth">
      {/* ── Left brand panel (slim header below 860px) ── */}
      <aside className="auth-brand-panel relative isolate flex items-center justify-between overflow-hidden px-6 py-6 text-white auth:flex-col auth:items-start auth:justify-start auth:px-12 auth:py-10">
        <div
          className="auth-brand-glow pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
        />
        <div
          className="auth-brand-dots pointer-events-none absolute inset-0 -z-10"
          aria-hidden="true"
        />

        <Logo />
        <span className="text-caption text-white/80 auth:hidden">
          Accessibility audits, made simple
        </span>

        <div className="my-auto hidden max-w-auth-copy auth:block">
          <h1 className="text-section font-extrabold leading-tight tracking-tight">
            Audit your site for{" "}
            <span className="text-brand-300">accessibility</span> in minutes.
          </h1>
          <p className="mt-4 text-body text-white/80">
            Crawl your pages, catch WCAG 2.2 violations, and get
            developer-ready repair guidance for every finding.
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {trustPoints.map((point) => (
              <li
                key={point}
                className="flex items-center gap-3 text-sm font-medium text-white/90"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-brand-300">
                  <Check className="size-3" strokeWidth={2.4} aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-caption text-white/60 auth:block">
          © {new Date().getFullYear()} AccessAudit · Built with axe-core · WCAG
          2.2
        </p>
      </aside>

      {/* ── Right form panel ── */}
      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-auth-card">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1.5 text-label font-medium text-muted-foreground transition-colors hover:text-brand-700"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to home
          </Link>

          <AuthSegmentedControl />

          {children}
        </div>
      </main>
    </div>
  )
}
