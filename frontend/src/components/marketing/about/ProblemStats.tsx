import { Reveal } from "@/components/marketing/Reveal"
import { SectionHeading } from "@/components/marketing/home/SectionHeading"

// NOTE: These figures are rounded and illustrative for the marketing page.
// Source-verify each statistic (WHO disability prevalence, WebAIM Million 2025)
// against the latest published data before a public launch.
const stats = [
  {
    value: "1 in 6",
    title: "people live with a significant disability",
    detail:
      "An estimated 1.3 billion people worldwide, according to the World Health Organization.",
  },
  {
    value: "~96%",
    title: "of home pages have detectable WCAG failures",
    detail:
      "From the WebAIM Million 2025 analysis of the top one million home pages.",
  },
  {
    value: "Legal",
    title: "accessibility is a duty, not a nicety",
    detail:
      "Public-sector bodies and many organisations are required by regulation to meet accessibility standards.",
  },
]

export function ProblemStats() {
  return (
    <section className="marketing-section-pad border-y border-border-soft bg-surface-1">
      <div className="marketing-wrap">
        <Reveal>
          <SectionHeading
            kicker="Why it matters"
            title="Most of the web still isn't accessible"
          >
            Accessibility is a basic part of building for real users, yet the
            gap between intention and reality stays stubbornly wide.
          </SectionHeading>
        </Reveal>

        <div className="grid gap-sp5 md:grid-cols-3">
          {stats.map((stat) => (
            <Reveal
              key={stat.value}
              className="rounded-lg border border-border-soft bg-surface-0 p-sp8 text-center"
            >
              <strong className="block text-4xl font-extrabold tracking-tight text-brand-700">
                {stat.value}
              </strong>
              <div className="mt-sp3 text-sm font-semibold leading-snug text-text-pri">
                {stat.title}
              </div>
              <div className="mt-sp2 text-caption leading-relaxed text-text-muted">
                {stat.detail}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
