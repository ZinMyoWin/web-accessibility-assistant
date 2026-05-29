import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Reveal } from "@/components/marketing/Reveal"
import { Button } from "@/components/ui/button"

export function FinalCta() {
  return (
    <section className="marketing-section-pad bg-surface-1 text-center">
      <Reveal className="marketing-wrap">
        <h2 className="text-3xl font-bold tracking-tight text-text-pri md:text-cta">
          Run your first audit in under a minute
        </h2>
        <p className="mx-auto mt-sp4 max-w-xl text-base leading-relaxed text-text-muted">
          It is free while AccessAudit is in beta. Scan a site, see your score,
          and get the fixes.
        </p>
        <div className="mt-sp8 flex flex-wrap justify-center gap-sp3">
          <Button asChild size="lg" className="h-auto px-sp8 py-control-y-lg hover:bg-brand-700">
            <Link href="/register">
              <ArrowRight aria-hidden="true" data-icon="inline-start" />
              Start free
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-auto px-sp8 py-control-y-lg hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            <Link href="#how">See how it works</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  )
}
