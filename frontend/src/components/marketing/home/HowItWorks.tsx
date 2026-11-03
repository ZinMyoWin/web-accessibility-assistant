const steps = [
  { title: "Start with a website", body: "Enter a public URL. Scan a single page or follow connected pages to cover more of the site." },
  { title: "See the full picture", body: "Review the findings by severity, page, and category. Inspect the exact element behind each issue." },
  { title: "Turn findings into fixes", body: "Review repair guidance, make your changes, and scan again to see how the results compare." },
]

export function HowItWorks() {
  return (
    <section id="how" className="marketing-section-pad bg-surface-1">
      <div className="marketing-wrap">
        <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <h2 className="marketing-heading max-w-xl">A clear path to a better website.</h2>
          <p className="max-w-sm text-base leading-relaxed text-muted-foreground">No extension to install. Start with a link, leave with a plan.</p>
        </div>
        <ol className="grid gap-8 md:grid-cols-3 md:gap-12">
          {steps.map((step, index) => (
            <li key={step.title} className="border-t border-border pt-6">
              <span className="mb-7 flex size-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand-700" aria-label={`Step ${index + 1}`}>{index + 1}</span>
              <h3 className="text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
