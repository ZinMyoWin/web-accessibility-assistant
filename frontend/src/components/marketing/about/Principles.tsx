import { CheckCircle, Code2, Eye, Search } from "lucide-react"
import { Reveal } from "@/components/marketing/Reveal"

const principles = [
  {
    icon: CheckCircle,
    title: "Accessible by default",
    body: "An accessibility tool should hold itself to the standard it checks. AccessAudit is built to pass the same WCAG 2.2 criteria it runs on everyone else.",
  },
  {
    icon: Code2,
    title: "Guidance, not blind fixes",
    body: "Repair suggestions are framed as developer guidance to review and apply, never silent automated changes that hide the real problem from the team.",
  },
  {
    icon: Search,
    title: "Built on trusted standards",
    body: "Detection runs on the industry-standard axe-core engine, extended with custom rules, and maps cleanly to published WCAG 2.2 success criteria.",
  },
  {
    icon: Eye,
    title: "Clear and honest",
    body: "Scores, severities, and the reasoning behind every finding are shown plainly, so results are easy to trust, share, and act on.",
  },
]

export function Principles() {
  return (
    <section className="marketing-section-pad border-y border-border-soft bg-surface-1">
      <div className="marketing-wrap">
        <Reveal className="mx-auto mb-sp16 max-w-2xl text-center">
          <span className="text-caption font-semibold uppercase tracking-widest text-brand-500">
            What guides us
          </span>
          <h2 className="mt-sp3 text-3xl font-bold tracking-tight text-text-pri md:text-section">
            The principles behind the product
          </h2>
        </Reveal>

        <div className="grid gap-sp5 md:grid-cols-2">
          {principles.map((principle) => (
            <Reveal
              key={principle.title}
              className="flex gap-sp4 rounded-lg border border-border-soft bg-surface-0 p-sp6 transition-all hover:border-brand-300 hover:shadow-card"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                <principle.icon aria-hidden="true" className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold leading-snug text-text-pri">
                  {principle.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                  {principle.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
