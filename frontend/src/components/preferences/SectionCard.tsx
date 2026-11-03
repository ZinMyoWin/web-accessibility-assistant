import { cn } from "@/lib/utils"

interface SectionCardProps {
  id: string
  title: string
  subtitle: string
  iconClass: string
  icon: React.ReactNode
  danger?: boolean
  children: React.ReactNode
}

export function SectionCard({
  id,
  title,
  subtitle,
  iconClass,
  icon,
  danger,
  children,
}: SectionCardProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-6 overflow-hidden rounded-[18px] border bg-card",
        danger ? "border-[var(--high-text)]/20" : "border-border"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b px-5 py-5 sm:px-6",
          danger ? "border-[var(--high-text)]/15" : "border-border"
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
            iconClass
          )}
        >
          {icon}
        </div>
        <div className="flex-1">
          <h2
            id={`${id}-title`}
            className={cn(
              "text-base font-semibold",
              danger ? "text-[var(--high-text)]" : "text-foreground"
            )}
          >
            {title}
          </h2>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {subtitle}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6 px-5 py-6 sm:px-6">{children}</div>
    </section>
  )
}

/* Reusable horizontal field row */
export function FieldRow({
  label,
  hint,
  children,
  horizontal,
  htmlFor,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  horizontal?: boolean
  htmlFor?: string
}) {
  if (horizontal) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          {htmlFor ? <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label> : <span className="text-sm font-medium text-foreground">{label}</span>}
          {hint && (
            <span className="mt-0.5 text-xs text-muted-foreground">
              {hint}
            </span>
          )}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {htmlFor ? <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label> : <span className="text-sm font-medium text-foreground">{label}</span>}
      {children}
      {hint && (
        <span className="text-xs text-muted-foreground">{hint}</span>
      )}
    </div>
  )
}
