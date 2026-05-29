import { Check, CheckCircle } from "lucide-react"
import { Reveal } from "@/components/marketing/Reveal"

const badges = [
  "Keyboard navigable",
  "ARIA-conformant",
  "Reduced-motion aware",
]

export function AccessibilityBand() {
  return (
    <section className="marketing-section-pad bg-surface-0" id="about">
      <div className="marketing-wrap">
        <Reveal className="marketing-band-card marketing-band-grid items-center gap-sp10 rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 p-sp8 text-center md:p-sp16 md:text-left">
          <div className="relative z-10">
            <span className="text-caption font-semibold uppercase tracking-widest text-brand-300">
              Built accessible
            </span>
            <h2 className="mt-sp3 text-2xl font-bold tracking-tight text-primary-foreground md:text-band">
              An accessibility tool that holds itself to the standard
            </h2>
            <p className="mt-sp4 max-w-xl text-base leading-relaxed text-primary-foreground/80">
              AccessAudit is built on accessible component foundations with full
              keyboard and screen-reader support. The product is designed to
              pass the same WCAG 2.2 checks it runs on everyone else.
            </p>
            <div className="mt-sp6 flex flex-wrap gap-sp3 max-md:justify-center">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center gap-sp2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-sp3 py-sp2 text-caption font-medium leading-none text-primary-foreground"
                >
                  <Check aria-hidden="true" className="size-3 text-brand-300" />
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="relative z-10 mx-auto flex size-40 items-center justify-center rounded-full border-2 border-dashed border-primary-foreground/30">
            <div className="flex size-28 items-center justify-center rounded-lg bg-brand-500 text-primary-foreground shadow-float">
              <CheckCircle aria-hidden="true" className="size-14" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
