import { Accessibility } from "lucide-react"

export function AboutHero() {
  return (
    <section className="marketing-hero">
      <div className="marketing-wrap grid gap-10 lg:grid-cols-[1.4fr_.6fr] lg:items-end">
        <div><h1 className="max-w-4xl text-[clamp(3rem,6vw,5.5rem)] font-semibold leading-[1.06] tracking-[-0.065em]">The web should work for everyone.</h1><p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">We’re making accessibility testing easier to understand, so finding a barrier becomes the beginning of a better experience.</p></div>
        <div className="flex aspect-[1.6] items-center justify-center rounded-[24px] bg-brand-100 lg:aspect-square" aria-hidden="true"><Accessibility className="size-28 text-brand-700" strokeWidth={1.1} /></div>
      </div>
    </section>
  )
}
