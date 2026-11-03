"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useId, useState, type FormEvent } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { AuthAlert } from "@/components/auth/AuthAlert"
import { PasswordField } from "@/components/auth/PasswordField"
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter"
import { Button } from "@/components/ui/button"
import { resetPassword } from "@/lib/auth"

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hintId = useId()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.")
      return
    }

    setSubmitting(true)
    setError("")
    try {
      await resetPassword(token, password)
      setDone(true)
      window.setTimeout(() => router.replace("/login"), 1500)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to reset your password. Please try again."
      )
      setSubmitting(false)
    }
  }

  return (
    <section className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1">
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em] text-foreground">
          Choose a new password
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Set a new password for your AccessAudit account.
        </p>
      </div>

      <div className="mt-6">
        {done ? (
          <AuthAlert tone="success">
            Your password has been updated. Redirecting you to log in…
          </AuthAlert>
        ) : null}
        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

        {!token ? (
          <AuthAlert tone="error">
            This reset link is missing its token. Request a new link from the
            forgot-password page.
          </AuthAlert>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <PasswordField
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              disabled={submitting || done}
              describedBy={hintId}
            >
              <PasswordStrengthMeter value={password} hintId={hintId} />
            </PasswordField>

            <Button
              type="submit"
              disabled={submitting || done}
              className="mt-2 h-12 w-full gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Updating…
                </>
              ) : (
                <>
                  Update password
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        )}
      </div>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="rounded-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
        >
          Back to log in
        </Link>
      </p>
    </section>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Loader2
            className="size-5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
