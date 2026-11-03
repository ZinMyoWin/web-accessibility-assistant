import { CheckCircle2, Code2, Eye, Search } from "lucide-react"

const principles = [
  { icon: CheckCircle2, title: "Practice what we test", body: "Visible focus, meaningful labels, keyboard access, and reduced motion belong in this product too. Accessibility is an ongoing practice." },
  { icon: Code2, title: "Keep people in control", body: "Repair suggestions are guidance to review and apply. Your code stays yours; the assistant helps you make an informed change." },
  { icon: Search, title: "Start with established standards", body: "axe-core and custom rules map findings to WCAG criteria, keeping the evidence connected to a shared, understandable standard." },
  { icon: Eye, title: "Be clear about the limits", body: "Automated checks uncover many common barriers. They work best alongside manual testing and feedback from people using assistive technology." },
]

export function Principles() {
  return (
    <section className="marketing-section-pad bg-surface-1">
      <div className="marketing-wrap"><h2 className="marketing-heading mb-12 max-w-2xl">Good guidance starts with clear principles.</h2>
        <div className="grid gap-x-12 sm:grid-cols-2">{principles.map(principle => <div key={principle.title} className="flex gap-4 border-t border-border py-8"><principle.icon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="text-xl font-semibold tracking-tight">{principle.title}</h3><p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">{principle.body}</p></div></div>)}</div>
      </div>
    </section>
  )
}
