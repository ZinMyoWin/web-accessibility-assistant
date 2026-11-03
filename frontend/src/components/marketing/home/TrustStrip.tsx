import { Check, FileCheck2, Layers, ShieldCheck } from "lucide-react"

export function TrustStrip() {
  return (
    <section aria-label="Audit foundations" className="border-y border-border-soft">
      <div className="marketing-wrap flex flex-wrap items-center justify-between gap-x-10 gap-y-5 py-7">
        <p className="text-sm text-muted-foreground">Clear findings. Established standards.</p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-sm font-medium">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-primary" aria-hidden="true" /> WCAG 2.2</span>
          <span className="inline-flex items-center gap-2"><Check className="size-4 text-primary" aria-hidden="true" /> Powered by axe-core</span>
          <span className="inline-flex items-center gap-2"><Layers className="size-4 text-primary" aria-hidden="true" /> Multi-page scans</span>
          <span className="inline-flex items-center gap-2"><FileCheck2 className="size-4 text-primary" aria-hidden="true" /> Exportable reports</span>
        </div>
      </div>
    </section>
  )
}
