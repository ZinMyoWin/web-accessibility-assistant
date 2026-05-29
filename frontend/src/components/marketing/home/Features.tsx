import {
  BarChart3,
  CheckCircle,
  Globe,
  Sparkles,
} from "lucide-react"
import { Reveal } from "@/components/marketing/Reveal"
import { SectionHeading } from "./SectionHeading"

const features = [
  {
    icon: Globe,
    title: "Multi-page crawling",
    body: "Point AccessAudit at any public URL and it discovers and scans connected pages automatically, so a single run covers more than just the home page.",
  },
  {
    icon: CheckCircle,
    title: "WCAG 2.2 detection",
    body: "The axe-core engine and a layer of custom rules flag violations against WCAG 2.2 criteria, each tagged by severity and the exact success criterion it breaks.",
  },
  {
    icon: Sparkles,
    title: "AI-powered repair guidance",
    body: "Every finding comes with a written explanation and a suggested code-level fix, framed as developer guidance rather than a blind auto-fix, generated at detection time.",
  },
  {
    icon: BarChart3,
    title: "Scores & shareable reports",
    body: "Each scan produces an accessibility score, a severity breakdown, and an exportable report so progress is easy to track and easy to share with the team.",
  },
]

export function Features() {
  return (
    <section className="marketing-section-pad bg-surface-0" id="features">
      <div className="marketing-wrap">
        <Reveal>
          <SectionHeading
            kicker="What it does"
            title="Everything you need to audit and repair"
          >
            From the first crawl to the final fix, AccessAudit covers the full
            accessibility workflow in one place.
          </SectionHeading>
        </Reveal>

        <div className="grid gap-sp5 md:grid-cols-2">
          {features.map((feature) => (
            <Reveal
              key={feature.title}
              className="rounded-lg border border-border-soft bg-surface-0 p-sp8 transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-card"
            >
              <div className="mb-sp5 flex size-11 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                <feature.icon aria-hidden="true" className="size-6" />
              </div>
              <h3 className="text-lg font-semibold leading-snug text-text-pri">
                {feature.title}
              </h3>
              <p className="mt-sp3 text-sm leading-relaxed text-text-muted">
                {feature.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
