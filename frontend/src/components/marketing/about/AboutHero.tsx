export function AboutHero() {
  return (
    <section className="relative overflow-hidden pb-sp16 pt-sp28 text-center max-md:pt-sp20">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="marketing-hero-mesh" />
      </div>

      <div className="marketing-wrap relative z-10 mx-auto max-w-3xl">
        <span className="marketing-hero-fade text-caption font-semibold uppercase tracking-widest text-brand-500">
          About AccessAudit
        </span>
        <h1 className="marketing-hero-fade marketing-hero-fade-delay-1 mt-sp3 text-3xl font-extrabold tracking-tight text-text-pri md:text-4xl lg:text-5xl">
          The web should work for{" "}
          <span className="text-brand-500">everyone</span>
        </h1>
        <p className="marketing-hero-fade marketing-hero-fade-delay-2 mx-auto mt-sp5 max-w-2xl text-lead leading-relaxed text-text-muted">
          AccessAudit exists to make accessibility testing fast,
          understandable, and actually actionable, so teams can find what is
          broken and know exactly how to fix it.
        </p>
      </div>
    </section>
  )
}
