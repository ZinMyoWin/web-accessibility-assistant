import { Reveal } from "@/components/marketing/Reveal"

// Origin story copy is kept isolated here so it can be edited or removed in one
// place without touching the rest of the About page.
const story = {
  kicker: "The story",
  title: "From a final-year project to a tool anyone can use",
  paragraphs: [
    "AccessAudit began as a final-year computing project at the University of Roehampton: a full-stack application built to crawl public websites, detect WCAG 2.2 violations, and generate AI-assisted repair guidance.",
    "What started as an academic build kept proving useful beyond the brief, so it is now opening up for anyone who wants to audit a site. The goal stays the same as it was on day one: make accessibility testing approachable enough that teams actually do it.",
  ],
}

export function StoryBand() {
  return (
    <section className="marketing-section-pad bg-surface-0">
      <div className="marketing-wrap">
        <Reveal className="marketing-band-card rounded-2xl bg-gradient-to-br from-brand-900 to-brand-700 p-sp12 text-primary-foreground md:p-sp16">
          <div className="relative z-10 max-w-2xl">
            <span className="text-caption font-semibold uppercase tracking-widest text-brand-300">
              {story.kicker}
            </span>
            <h2 className="mt-sp3 text-2xl font-bold tracking-tight md:text-band">
              {story.title}
            </h2>
            {story.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 24)}
                className="mt-sp4 text-base leading-relaxed text-primary-foreground/80"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
