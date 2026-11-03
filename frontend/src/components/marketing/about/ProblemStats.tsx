const barriers = [
  { symbol: "Tab", title: "A page you can move through", detail: "Keyboard users need a logical path, visible focus, and controls they can reach.", color: "bg-brand-50 text-brand-700" },
  { symbol: "Aa", title: "Content you can read", detail: "Clear contrast and legible text help people understand and use what you’ve built.", color: "bg-[#e7f2ed] text-[#236345]" },
  { symbol: "alt", title: "Meaning beyond the visual", detail: "Useful labels, image descriptions, and page structure give assistive technology the context it needs.", color: "bg-[#fff3db] text-[#825114]" },
]

export function ProblemStats() {
  return (
    <section className="border-y border-border-soft bg-surface-1 py-14 sm:py-20">
      <div className="marketing-wrap grid gap-8 md:grid-cols-3 md:gap-12">
        {barriers.map(barrier => <div key={barrier.symbol}><span className={`inline-flex h-14 min-w-14 items-center justify-center rounded-2xl px-3 text-xl font-semibold ${barrier.color}`} aria-hidden="true">{barrier.symbol}</span><h2 className="mt-6 text-xl font-semibold tracking-tight">{barrier.title}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{barrier.detail}</p></div>)}
      </div>
    </section>
  )
}
