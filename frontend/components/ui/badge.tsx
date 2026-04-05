import * as React from "react"
import { cn } from "@/lib/utils"

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "critical"
  | "serious"
  | "moderate"
  | "minor"

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "border-transparent bg-primary text-primary-foreground",
  secondary:
    "border-transparent bg-secondary text-secondary-foreground",
  destructive:
    "border-transparent bg-destructive text-white",
  outline: "text-foreground",
  critical:
    "border-severity-critical-bg bg-severity-critical-bg text-severity-critical-text",
  serious:
    "border-severity-serious-bg bg-severity-serious-bg text-severity-serious-text",
  moderate:
    "border-severity-moderate-bg bg-severity-moderate-bg text-severity-moderate-text",
  minor:
    "border-severity-minor-bg bg-severity-minor-bg text-severity-minor-text",
}

interface BadgeProps extends React.ComponentProps<"span"> {
  variant?: BadgeVariant
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
export type { BadgeProps, BadgeVariant }
