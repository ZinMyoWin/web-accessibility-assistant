import { CheckCircle } from "lucide-react"

export function MarketingLogo() {
  return (
    <span className="flex items-center gap-sp2">
      <span className="flex size-8 items-center justify-center rounded-sm bg-brand-500 text-primary-foreground shadow-card">
        <CheckCircle aria-hidden="true" className="size-5" strokeWidth={2} />
      </span>
      <span className="text-base font-bold leading-none tracking-tight text-brand-900">
        AccessAudit
      </span>
    </span>
  )
}
