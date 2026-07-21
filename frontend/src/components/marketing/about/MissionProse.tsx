import { Reveal } from "@/components/marketing/Reveal"

export function MissionProse() {
  return (
    <section className="marketing-section-pad bg-surface-0">
      <Reveal className="marketing-wrap mx-auto max-w-2xl">
        {/* Mock applies an inline margin-bottom: var(--sp10) override here. */}
        <div className="mb-sp10 text-center">
          <span className="text-caption font-semibold uppercase tracking-widest text-brand-500">
            Our mission
          </span>
          <h2 className="mt-sp3 text-3xl font-bold tracking-tight text-text-pri md:text-section">
            Close the gap between finding issues and fixing them
          </h2>
        </div>

        <p className="text-base leading-loose text-text-pri">
          Plenty of tools can tell a developer that something is wrong. Far
          fewer explain what to do about it in terms that fit into a normal
          working day. That gap is where accessibility work tends to stall.
        </p>
        <p className="mt-sp5 text-base leading-loose text-text-muted">
          AccessAudit was built to close it. Every scan does more than flag a
          violation: it explains the problem in plain language, ties it to the
          exact WCAG 2.2 criterion it breaks, and offers a concrete, code-level
          repair suggestion the developer can review and apply. The aim is
          guidance a team can act on, not a wall of red that gets ignored.
        </p>
      </Reveal>
    </section>
  )
}
