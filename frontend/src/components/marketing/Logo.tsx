import { Accessibility } from "lucide-react"

export function MarketingLogo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand-500 text-white">
        <Accessibility aria-hidden="true" className="size-6" strokeWidth={1.8} />
      </span>
      <span className="text-lg font-bold leading-none tracking-[-0.045em] text-foreground">AccessAudit</span>
    </span>
  )
}
