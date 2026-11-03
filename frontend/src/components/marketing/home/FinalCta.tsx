import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function FinalCta() {
  return (
    <section className="border-t border-border-soft bg-surface-1 py-16 sm:py-24">
      <div className="marketing-wrap flex flex-col justify-between gap-8 md:flex-row md:items-center">
        <div><h2 className="marketing-heading max-w-2xl">Make your next improvement an accessible one.</h2><p className="mt-5 text-base text-muted-foreground">Start with your first scan. Free while AccessAudit is in beta.</p></div>
        <Button asChild size="lg" className="min-h-12 w-fit shrink-0 px-6"><Link href="/register">Start free <ArrowUpRight className="size-4" aria-hidden="true" /></Link></Button>
      </div>
    </section>
  )
}
