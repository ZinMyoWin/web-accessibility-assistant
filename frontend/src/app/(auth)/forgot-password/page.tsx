"use client"

import Link from "next/link"
import { useId, useState, type FormEvent } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { AuthAlert } from "@/components/auth/AuthAlert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset } from "@/lib/auth"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage() {
  const emailId = useId()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid email address.")
      return
    }

    setSubmitting(true)
    setError("")
    try {
      const message = await requestPasswordReset(email)
      setConfirmation(message)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to send a reset link. Please try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Reset your password
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enter your account email and we&apos;ll send you a link to set a new
          password.
        </p>
      </div>

      <div className="mt-6">
        {confirmation ? (
          <AuthAlert tone="success">{confirmation}</AuthAlert>
        ) : null}
        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-6">
            <Label htmlFor={emailId} className="mb-1.5">
              Email
              <span className="text-severity-critical-text" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id={emailId}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
              required
              aria-required="true"
              disabled={submitting}
              className="h-11 bg-surface-1 text-body focus-visible:bg-surface-0"
            />
          </div>

          <Button type="submit" disabled={submitting} className="h-11 w-full gap-2">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Sending link…
              </>
            ) : (
              <>
                Send reset link
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-caption text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-700 hover:underline"
        >
          Back to log in
        </Link>
      </p>
    </section>
  )
}
