"use client"

import { cn } from "@/lib/utils"

type PasswordStrengthMeterProps = {
  value: string
  hintId: string
}

function scorePassword(value: string): 0 | 1 | 2 | 3 {
  let score = 0
  if (value.length >= 8) score++
  if (/[A-Za-z]/.test(value) && /\d/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value) && value.length >= 10) score++
  return score as 0 | 1 | 2 | 3
}

// Token-driven fill colour per strength level (never inline styles).
const fillByScore: Record<0 | 1 | 2 | 3, string> = {
  0: "",
  1: "bg-severity-critical-text",
  2: "bg-severity-serious-text",
  3: "bg-brand-500",
}

export function PasswordStrengthMeter({
  value,
  hintId,
}: PasswordStrengthMeterProps) {
  const score = scorePassword(value)
  const fill = fillByScore[score]

  return (
    <>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index < score ? fill : "bg-surface-2"
            )}
          />
        ))}
      </div>
      <p id={hintId} className="mt-1.5 text-caption text-muted-foreground">
        Use 8+ characters with a mix of letters and numbers.
      </p>
    </>
  )
}
