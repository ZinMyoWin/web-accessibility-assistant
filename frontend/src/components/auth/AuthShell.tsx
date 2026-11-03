import Link from "next/link"
import { ArrowLeft, ArrowUpRight, Check, Keyboard, ScanSearch } from "lucide-react"
import { AuthSegmentedControl } from "@/components/auth/AuthSegmentedControl"
import { MarketingLogo } from "@/components/marketing/Logo"

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-surface-0 auth:grid auth:grid-cols-2">
      <aside className="flex flex-col bg-brand-50 px-6 py-6 auth:min-h-svh auth:px-10 auth:py-10 xl:px-16">
        <Link href="/" className="inline-flex w-fit items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
          <MarketingLogo />
        </Link>

        <div className="my-auto hidden max-w-lg py-16 auth:block">
          <h2 className="text-4xl font-semibold leading-[1.18] tracking-[-0.04em] text-foreground xl:text-[46px]">
            A more accessible web starts with your next step.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            Find accessibility barriers, understand who they affect, and turn your findings into meaningful progress.
          </p>

          <figure className="mt-10 rounded-[18px] border border-white bg-surface-0 p-6 shadow-card" aria-label="Example accessibility report">
            <figcaption className="flex items-center justify-between gap-3 border-b border-border-soft pb-4 text-sm font-semibold text-foreground">
              Example accessibility report
              <ScanSearch className="size-4 text-primary" aria-hidden="true" />
            </figcaption>
            <div className="flex items-end justify-between gap-4 py-6">
              <div>
                <p className="text-sm text-muted-foreground">Accessibility score</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground">
                  86<span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F5EE] px-3 py-1.5 text-xs font-medium text-[#246345]">
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                Making progress
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-100 text-brand-700">
                  <Keyboard className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Keyboard navigation</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Clear guidance for every finding</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-[#FFF5DF] p-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FBE6AF] text-[#765212]">
                  <Check className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">A clearer path to fixes</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Prioritize, repair, and scan again</p>
                </div>
              </div>
            </div>
          </figure>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">WCAG 2.2 checks. Practical AI guidance. All in one place.</p>
        </div>

        <p className="hidden text-xs leading-5 text-muted-foreground auth:block">© {new Date().getFullYear()} AccessAudit</p>
      </aside>

      <main id="main-content" className="flex items-center justify-center px-6 py-10 sm:px-10 auth:py-16">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="mb-10 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to home
          </Link>
          <AuthSegmentedControl />
          {children}
        </div>
      </main>
    </div>
  )
}
