import { Reveal } from "@/components/marketing/Reveal"
import { SectionHeading } from "./SectionHeading"

const steps = [
  {
    number: "1",
    title: "Enter a URL",
    body: "Drop in any public web address. AccessAudit crawls the site and queues the pages it finds.",
  },
  {
    number: "2",
    title: "Run the audit",
    body: "Each page is rendered and checked against WCAG 2.2, with findings grouped and ranked by severity.",
  },
  {
    number: "3",
    title: "Get guided fixes",
    body: "Review the report, read the AI repair suggestions, and apply the recommended code changes.",
  },
]

export function HowItWorks() {
  return (
    <section className="marketing-section-pad bg-surface-1" id="how">
      <div className="marketing-wrap">
        <Reveal>
          <SectionHeading
            kicker="How it works"
            title="Three steps from URL to fix"
          >
            No setup, no browser extensions. Paste a link and let the audit
            run.
          </SectionHeading>
        </Reveal>

        <div className="marketing-dashed-connector relative grid gap-sp10 md:grid-cols-3 md:gap-sp6">
          {steps.map((step) => (
            <Reveal key={step.number} className="relative text-center">
              <div className="relative z-10 mx-auto mb-sp5 flex size-14 items-center justify-center rounded-full border-2 border-brand-300 bg-surface-0 text-xl font-bold leading-none text-brand-700 shadow-card">
                {step.number}
              </div>
              <h3 className="text-base font-semibold leading-snug text-text-pri">
                {step.title}
              </h3>
              <p className="mx-auto mt-sp2 max-w-xs text-sm leading-relaxed text-text-muted">
                {step.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
