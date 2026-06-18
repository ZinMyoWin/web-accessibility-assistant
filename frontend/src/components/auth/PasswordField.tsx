"use client"

import { useId, useState, type ReactNode } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type PasswordFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: "current-password" | "new-password"
  placeholder?: string
  required?: boolean
  disabled?: boolean
  /** Optional content rendered under the input (e.g. strength meter). */
  describedBy?: string
  children?: ReactNode
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  required = false,
  disabled = false,
  describedBy,
  children,
}: PasswordFieldProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const ToggleIcon = visible ? EyeOff : Eye

  return (
    <div className="mb-4">
      <Label htmlFor={id} className="mb-1.5">
        {label}
        {required ? (
          <span className="text-severity-critical-text" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn(
            "h-11 bg-surface-1 pr-11 text-body focus-visible:bg-surface-0"
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "Hide password" : "Show password"}
          disabled={disabled}
          className="absolute right-1.5 top-1/2 flex -translate-y-1/2 rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <ToggleIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  )
}
