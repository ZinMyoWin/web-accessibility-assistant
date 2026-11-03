import { cn } from "@/lib/utils"

type AuthAlertProps = {
  tone: "error" | "success"
  children: React.ReactNode
}

const toneStyles: Record<AuthAlertProps["tone"], string> = {
  error:
    "border-severity-critical/20 bg-severity-critical-bg text-severity-critical-text",
  success: "border-brand-500/20 bg-secondary text-brand-700",
}

/**
 * Inline, accessible status message for auth flows. Errors are announced
 * assertively, confirmations politely.
 */
export function AuthAlert({ tone, children }: AuthAlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        "mb-5 rounded-xl border px-4 py-3 text-sm leading-6",
        toneStyles[tone]
      )}
    >
      {children}
    </div>
  )
}
