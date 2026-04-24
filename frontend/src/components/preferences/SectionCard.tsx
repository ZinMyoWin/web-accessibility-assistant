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
    <div
      id={id}
      className={cn(
        "overflow-hidden rounded-xl border-[0.5px] bg-card",
        danger ? "border-[var(--high-text)]/20" : "border-border"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b-[0.5px] px-5 py-4",
          danger ? "border-[var(--high-text)]/15" : "border-border"
        )}
      >
        <div
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded",
            iconClass
          )}
        >
          {icon}
        </div>
        <div className="flex-1">
          <div
            className={cn(
              "text-sm font-semibold",
              danger ? "text-[var(--high-text)]" : "text-foreground"
            )}
          >
            {title}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {subtitle}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
    </div>
  )
}

/* Reusable horizontal field row */
export function FieldRow({
  label,
  hint,
  children,
  horizontal,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  horizontal?: boolean
}) {
  if (horizontal) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-foreground">{label}</span>
          {hint && (
            <span className="mt-0.5 text-[11px] text-muted-foreground">
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
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      )}
    </div>
  )
}
