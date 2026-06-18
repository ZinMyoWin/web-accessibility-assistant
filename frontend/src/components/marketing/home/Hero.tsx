import Link from "next/link"
import {
  ArrowRight,
  Globe,
  Lock,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const issues = [
  {
    severity: "critical" as const,
    title: "Images must have alternate text",
    meta: "image-alt \u00b7 4 elements \u00b7 WCAG 1.1.1",
  },
  {
    severity: "serious" as const,
    title: "Form elements must have labels",
    meta: "label \u00b7 2 elements \u00b7 WCAG 4.1.2",
  },
  {
    severity: "moderate" as const,
    title: "Elements must meet colour contrast minimums",
    meta: "color-contrast \u00b7 9 elements \u00b7 WCAG 1.4.3",
  },
]

const severityBarClass = {
  critical: "bg-severity-critical-text",
  serious: "bg-severity-serious-text",
  moderate: "bg-severity-moderate-text",
}

export function Hero() {
  return (
    <section className="marketing-hero">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="marketing-hero-mesh" />
        <div className="marketing-hero-grid" />
      </div>

      <div className="marketing-wrap relative z-10 mx-auto max-w-3xl text-center">
        <div className="marketing-hero-fade inline-flex items-center gap-sp2 rounded-full border border-border-soft bg-surface-0 py-sp1 pl-sp2 pr-sp3 text-caption text-text-muted shadow-card">
          <span className="rounded-full bg-brand-50 px-sp2 py-sp1 text-xs font-semibold uppercase tracking-wider text-brand-700">
            WCAG 2.2
          </span>
          Automated audits with AI-guided fixes
        </div>

        <h1 className="marketing-hero-fade marketing-hero-fade-delay-1 mt-sp6 text-3xl font-extrabold tracking-tight text-text-pri md:text-5xl lg:text-hero">
          Find and fix{" "}
          <span className="marketing-accent text-brand-500">
            accessibility issues
          </span>{" "}
          across your site
        </h1>

        <p className="marketing-hero-fade marketing-hero-fade-delay-2 mx-auto mt-sp5 max-w-2xl text-base leading-relaxed text-text-muted md:text-lead">
          AccessAudit crawls your pages, detects WCAG 2.2 violations with the
          axe-core engine, and turns each finding into clear, developer-ready
          repair guidance.
        </p>

        <div
          className="marketing-scan-bar marketing-hero-fade marketing-hero-fade-delay-3 mx-auto mt-sp8 max-w-xl rounded-lg border border-border-soft bg-surface-0 p-sp2 shadow-card"
          role="group"
          aria-label="Start a scan"
        >
          <label className="flex flex-1 items-center gap-sp2 pl-sp3 sm:pl-sp2">
            <span className="sr-only">Website URL to scan</span>
            <Globe
              aria-hidden="true"
              className="size-4 shrink-0 text-text-muted"
            />
            <Input
              type="url"
              placeholder="https://your-website.com"
              className="h-auto border-0 bg-transparent px-0 py-sp2 text-body shadow-none focus-visible:border-transparent focus-visible:ring-0"
            />
          </label>
          <Button asChild className="h-auto px-sp5 py-control-y hover:bg-brand-700 max-sm:w-full">
            <Link href="/register">
              <ArrowRight aria-hidden="true" data-icon="inline-start" />
              Run free scan
            </Link>
          </Button>
        </div>

        <p className="marketing-hero-fade marketing-hero-fade-delay-4 mt-sp4 text-caption text-text-muted">
          No card required &middot;{" "}
          <strong className="font-semibold text-brand-700">
            Free while in beta
          </strong>{" "}
          &middot; Up to 5 pages per scan
        </p>
      </div>

      <div className="marketing-wrap marketing-preview-wrap marketing-hero-fade marketing-hero-fade-delay-5 relative z-10 mt-sp16">
        <div className="overflow-hidden rounded-2xl border border-border-soft bg-surface-0 shadow-float">
          <div className="flex items-center gap-sp2 border-b border-border-soft bg-surface-1 px-sp4 py-sp3">
            <div className="flex gap-sp2" aria-hidden="true">
              <span className="size-2 rounded-full bg-surface-2" />
              <span className="size-2 rounded-full bg-surface-2" />
              <span className="size-2 rounded-full bg-surface-2" />
            </div>
            <div className="ml-sp2 flex max-w-xs flex-1 items-center gap-sp2 rounded-full border border-border-soft bg-surface-0 px-sp3 py-sp1 text-caption text-text-muted">
              <Lock aria-hidden="true" className="size-3 text-brand-500" />
              app.accessaudit.io/report
            </div>
          </div>

          <div className="marketing-preview-body">
            <div className="marketing-preview-score flex flex-col items-center gap-sp4 bg-gradient-to-b from-surface-0 to-surface-1 p-sp6 max-md:flex-row max-md:justify-center max-md:gap-sp6">
              <div className="relative size-32">
                <svg
                  viewBox="0 0 120 120"
                  className="size-32"
                  aria-hidden="true"
                >
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="10"
                    className="marketing-score-ring-track"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray="326.7"
                    strokeDashoffset="91.5"
                    transform="rotate(-90 60 60)"
                    className="marketing-score-ring-value"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold leading-none text-brand-700">
                    72
                  </span>
                  <span className="mt-sp1 text-caption text-text-muted">
                    / 100
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-label font-semibold text-text-pri">
                  Accessibility score
                </div>
                <div className="mt-sp1 text-caption text-text-muted">
                  Across 5 pages crawled
                </div>
              </div>
            </div>

            <div className="p-sp4 md:p-sp6">
              <div className="mb-sp4 flex items-start justify-between gap-sp3 sm:items-center">
                <span className="text-sm font-semibold leading-none text-text-pri">
                  Top issues
                </span>
                <div className="flex flex-nowrap justify-end gap-sp1 sm:gap-sp2">
                  <Badge variant="critical" className="gap-sp1 whitespace-nowrap !px-1 !py-1 text-chip sm:!px-sp2 sm:text-caption">
                    <span className="size-1.5 rounded-full bg-current" />
                    3 critical
                  </Badge>
                  <Badge variant="serious" className="gap-sp1 whitespace-nowrap !px-1 !py-1 text-chip sm:!px-sp2 sm:text-caption">
                    <span className="size-1.5 rounded-full bg-current" />
                    7 serious
                  </Badge>
                  <Badge variant="moderate" className="gap-sp1 whitespace-nowrap !px-1 !py-1 text-chip sm:!px-sp2 sm:text-caption">
                    <span className="size-1.5 rounded-full bg-current" />
                    11 moderate
                  </Badge>
                </div>
              </div>

              <div>
                {issues.map((issue) => (
                  <div
                    key={issue.title}
                    className="flex items-center gap-sp3 border-t border-border-soft py-sp3 first:border-t-0"
                  >
                    <span
                      aria-hidden="true"
                      className={`self-stretch rounded-full ${severityBarClass[issue.severity]} w-1`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-label font-medium leading-snug text-text-pri">
                        {issue.title}
                      </div>
                      <div className="mt-sp1 text-caption text-text-muted">
                        {issue.meta}
                      </div>
                    </div>
                    <span className="hidden shrink-0 items-center gap-sp1 rounded-full bg-brand-50 px-sp2 py-sp1 text-xs font-medium leading-none text-brand-700 sm:inline-flex">
                      <Sparkles aria-hidden="true" className="size-3" />
                      AI fix ready
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
