import { Reveal } from "@/components/marketing/Reveal"

const stats = [
  {
    value: "~96%",
    label: "of home pages have detectable WCAG failures (WebAIM Million, 2025)",
  },
  {
    value: "WCAG 2.2",
    label: "success criteria checked on every scan",
  },
  {
    value: "axe-core",
    label: "industry-standard engine, plus custom rules",
  },
]

export function TrustStrip() {
  return (
    <section className="border-y border-border-soft bg-surface-1">
      <Reveal className="marketing-wrap flex flex-wrap items-center justify-center gap-sp10 py-sp10 lg:gap-sp16">
        {stats.map((stat) => (
          <div key={stat.value} className="text-center">
            <div className="text-3xl font-bold tracking-tight text-brand-700">
              {stat.value}
            </div>
            <p className="mt-sp2 max-w-44 text-caption text-text-muted">
              {stat.label}
            </p>
          </div>
        ))}
      </Reveal>
    </section>
  )
}
