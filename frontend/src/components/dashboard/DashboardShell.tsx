"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowUpRight, ChartNoAxesCombined, History, LayoutDashboard, ListChecks, LogOut, Menu, Settings2, X } from "lucide-react"
import { MarketingLogo } from "@/components/marketing/Logo"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useAuth } from "@/lib/contexts/AuthContext"

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", Icon: LayoutDashboard },
  { label: "Issues", href: "/issues", Icon: ListChecks },
  { label: "Scan History", href: "/scan-history", Icon: History },
  { label: "Reports", href: "/reports", Icon: ChartNoAxesCombined },
]

function Brand() {
  return <Link href="/" aria-label="AccessAudit home"><MarketingLogo /></Link>
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <nav aria-label="Workspace" className="flex flex-col gap-1.5">
    {NAV_ITEMS.map(({ label, href, Icon }) => <Link key={href} href={href} onClick={onNavigate} aria-current={pathname === href ? "page" : undefined}
      className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", pathname === href ? "bg-brand-100 text-brand-700" : "text-muted-foreground hover:bg-white hover:text-foreground")}>
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />{label}
    </Link>)}
    <div className="my-4 border-t border-border" />
    <Link href="/preferences" onClick={onNavigate} aria-current={pathname === "/preferences" ? "page" : undefined}
      className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", pathname === "/preferences" ? "bg-brand-100 text-brand-700" : "text-muted-foreground hover:bg-white hover:text-foreground")}>
      <Settings2 className="size-[18px]" aria-hidden="true" />Preferences
    </Link>
  </nav>
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { status, user, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  React.useEffect(() => { if (status === "anonymous") router.replace("/login") }, [router, status])

  async function handleSignOut() {
    await signOut()
    router.replace("/login")
  }

  if (status === "loading") return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground" role="status">Checking your session...</div>
  if (status === "anonymous") return null

  const account = <div className="mt-auto border-t border-border pt-5">
    <div className="mb-4 flex min-w-0 items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700" aria-hidden="true">{user?.name?.slice(0, 1).toUpperCase() || "A"}</span>
      <div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email}</p></div>
    </div>
    <Button type="button" variant="ghost" className="w-full justify-start gap-3 px-3 text-muted-foreground" onClick={handleSignOut}><LogOut className="size-4" aria-hidden="true" />Log out</Button>
  </div>

  return <>
    <a href="#main-content" className="sr-only z-[100] rounded-lg bg-primary px-5 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[var(--width-sidebar)_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-brand-50/50 px-5 py-7 md:flex print:hidden">
        <Brand />
        <div className="mb-3 mt-10 px-3.5 text-xs font-medium text-muted-foreground">Your workspace</div>
        <Navigation pathname={pathname} />
        <Link href="/about" className="mt-8 flex items-center justify-between rounded-xl border border-border bg-white/70 p-4 text-sm leading-relaxed text-muted-foreground hover:text-primary">Make the web work for everyone.<ArrowUpRight className="ml-2 size-4 shrink-0" aria-hidden="true" /></Link>
        {account}
      </aside>
      <div className="flex min-w-0 flex-col">
        <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 md:hidden print:hidden">
            <Brand />
            <DialogTrigger asChild><Button variant="outline" size="icon" aria-label="Toggle sidebar"><Menu className="size-5" aria-hidden="true" /></Button></DialogTrigger>
          </header>
          <DialogContent className="left-0 top-0 flex h-dvh max-h-none w-[300px] max-w-[calc(100vw_-_2rem)] translate-x-0 translate-y-0 flex-col rounded-none bg-background p-5">
            <div className="flex items-center justify-between"><DialogTitle className="text-lg">Workspace navigation</DialogTitle><DialogClose asChild><Button variant="ghost" size="icon" aria-label="Close navigation"><X className="size-5" aria-hidden="true" /></Button></DialogClose></div>
            <DialogDescription className="mb-6 text-sm">Your accessibility workspace.</DialogDescription>
            <Navigation pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
            {account}
          </DialogContent>
        </Dialog>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">{children}</main>
      </div>
    </div>
  </>
}
