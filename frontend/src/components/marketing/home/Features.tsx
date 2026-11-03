import { BarChart3, CheckCircle2, Globe, ScanSearch, Sparkles } from "lucide-react"

const features = [
  { icon: Globe, title: "Look beyond the home page", body: "Follow connected pages in one scan. See where barriers appear across your site, with the page and element attached to every finding." },
  { icon: CheckCircle2, title: "Find the issues that matter", body: "Check against WCAG criteria with axe-core and custom rules. Clear severity levels help you decide what to work on first." },
  { icon: Sparkles, title: "Understand the next step", body: "Read plain-language explanations and generate AI-assisted repair suggestions. Review the guidance, then apply the changes yourself." },
  { icon: BarChart3, title: "Make progress visible", body: "Return to saved scans, compare results, and export reports. Keep the evidence close as your website improves." },
]

export function Features() {
  return (
    <section id="features" className="marketing-section-pad">
      <div className="marketing-wrap grid gap-12 lg:grid-cols-[.8fr_1.3fr] lg:gap-20">
        <div>
          <h2 className="marketing-heading">From finding a barrier to knowing what to fix.</h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">One connected workspace for the whole audit. Less time interpreting results. More time making your site work for people.</p>
          <div className="mt-8 flex items-center gap-3 rounded-2xl bg-brand-50 p-5 text-sm text-brand-900">
            <ScanSearch className="size-6 shrink-0 text-primary" aria-hidden="true" />
            <p>Every finding has context: what happened, where it happened, and a way forward.</p>
          </div>
        </div>
        <div className="grid gap-x-8 sm:grid-cols-2">
          {features.map((feature, index) => (
            <div key={feature.title} className="border-t border-border py-7 first:pt-7">
              <span className={`mb-5 inline-flex size-11 items-center justify-center rounded-xl ${["bg-brand-50 text-brand-700", "bg-[#e5f4ec] text-[#236345]", "bg-[#f0eafa] text-[#7145a2]", "bg-[#fff3db] text-[#825114]"][index]}`}><feature.icon className="size-5" aria-hidden="true" strokeWidth={1.7} /></span>
              <h3 className="text-lg font-semibold leading-snug tracking-tight">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
