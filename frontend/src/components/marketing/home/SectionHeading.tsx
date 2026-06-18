type SectionHeadingProps = {
  kicker: string
  title: string
  children: string
}

export function SectionHeading({ kicker, title, children }: SectionHeadingProps) {
  return (
    <div className="mx-auto mb-sp16 max-w-2xl text-center">
      <span className="text-caption font-semibold uppercase tracking-widest text-brand-500">
        {kicker}
      </span>
      <h2 className="mt-sp3 text-3xl font-bold tracking-tight text-text-pri md:text-section">
        {title}
      </h2>
      <p className="mt-sp4 text-base leading-relaxed text-text-muted">
        {children}
      </p>
    </div>
  )
}
