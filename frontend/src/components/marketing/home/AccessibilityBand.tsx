import { Keyboard, MoveRight } from "lucide-react"

export function AccessibilityBand() {
  return (
    <section className="marketing-section-pad">
      <div className="marketing-wrap">
        <div className="grid gap-10 rounded-[24px] bg-[#e7f2ed] p-7 sm:p-12 lg:grid-cols-[1.3fr_.7fr] lg:items-center lg:p-16">
          <div>
            <h2 className="marketing-heading max-w-2xl">Accessibility belongs in the everyday.</h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#425f51]">A clear label. A visible focus ring. A description that makes an image meaningful. Small details can open up a whole experience.</p>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[#425f51]">Automated checks are a starting point. Pair the findings with keyboard, screen-reader, and real-user testing for a fuller picture.</p>
          </div>
          <div className="rounded-2xl bg-white p-6" aria-label="Example of a keyboard focus indicator">
            <Keyboard className="mb-6 size-7 text-[#236345]" aria-hidden="true" strokeWidth={1.5} />
            <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">Move through the page</div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-brand-500 p-3 text-sm font-medium text-white outline-2 outline-offset-4 outline-brand-500">Know where you are <MoveRight className="size-4" aria-hidden="true" /></div>
            <p className="mt-6 text-caption text-muted-foreground"><kbd className="rounded border border-border bg-surface-1 px-2 py-1 font-sans">Tab</kbd><span className="ml-2">A visible path, one step at a time.</span></p>
          </div>
        </div>
      </div>
    </section>
  )
}
