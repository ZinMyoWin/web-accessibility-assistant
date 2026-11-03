import Link from "next/link"
import { Accessibility, ArrowUpRight, Check, Code2, Globe, ImageIcon, ScanLine } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Hero() {
  return (
    <section className="marketing-hero">
      <div className="marketing-wrap grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Accessibility className="size-4 text-primary" aria-hidden="true" />
            A more accessible web starts here
          </p>
          <h1 className="max-w-2xl text-[clamp(2.7rem,5.25vw,4.75rem)] font-semibold leading-[1.06] tracking-[-0.065em]">
            Find and fix accessibility issues across your site
          </h1>
          <p className="mt-7 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            AccessAudit crawls your pages, detects WCAG 2.2 violations, and helps you turn each finding into a clear next step.
          </p>
          <div role="group" aria-label="Start a scan" className="mt-8 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="min-h-12 px-6">
              <Link href="/register">Run free scan <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
            </Button>
            <Link href="#how" className="marketing-link py-3 text-sm font-medium">See how it works</Link>
          </div>
          <p className="mt-5 text-caption text-muted-foreground">Free while in beta. No card required.</p>
        </div>
        <div className="relative min-w-0 rounded-[28px] bg-[#edf0fd] p-4 sm:p-7 lg:py-10" aria-label="Example accessibility report">
          <div className="overflow-hidden rounded-2xl border border-white bg-white shadow-float">
            <div className="flex items-center justify-between gap-3 border-b border-border-soft px-5 py-4">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium"><Globe className="size-4 text-muted-foreground" aria-hidden="true" /> example.com</span>
              <span className="rounded-full bg-[#e5f4ec] px-2.5 py-1 text-xs font-medium text-[#236345]">Scan complete</span>
            </div>
            <div className="p-5 sm:p-6">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div><p className="text-caption text-muted-foreground">Your accessibility overview</p><p className="mt-1 text-xl font-semibold tracking-tight">Small fixes. Better experiences.</p></div>
                <ScanLine className="hidden size-8 text-primary sm:block" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="mb-6 grid grid-cols-3 divide-x divide-border-soft border-y border-border-soft py-4">
                <div><span className="text-2xl font-semibold tracking-tight">5</span><p className="mt-1 text-xs text-muted-foreground">Pages checked</p></div>
                <div className="pl-4"><span className="text-2xl font-semibold tracking-tight">12</span><p className="mt-1 text-xs text-muted-foreground">Issues found</p></div>
                <div className="pl-4"><span className="text-2xl font-semibold tracking-tight text-[#236345]">38</span><p className="mt-1 text-xs text-muted-foreground">Checks passed</p></div>
              </div>
              <div className="rounded-xl border border-[#efd8bd] bg-[#fffaf3] p-4">
                <div className="flex items-start gap-3">
                  <ImageIcon className="mt-0.5 size-5 shrink-0 text-[#956016]" aria-hidden="true" />
                  <div><span className="text-xs font-medium text-[#825114]">Needs attention</span><h2 className="mt-1 text-sm font-semibold">An image is missing its description</h2><p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">A screen reader needs alternative text to explain what this image shows.</p></div>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-border-soft p-4">
                <span className="flex items-center gap-2 text-sm font-medium"><Code2 className="size-4 text-primary" aria-hidden="true" /> Suggested repair</span>
                <code className="mt-3 block overflow-x-auto rounded-md bg-surface-1 p-3 text-[11px] leading-6 text-brand-700">{'<img src="team.jpg"'}<br />{'  alt="Our team in the studio" />'}</code>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 text-[#236345]" aria-hidden="true" /> Guidance you can review and apply</p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">An example report. Your results will reflect your website.</p>
        </div>
      </div>
    </section>
  )
}
