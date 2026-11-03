"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useState, type FormEvent } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { AuthAlert } from "@/components/auth/AuthAlert"
import { GoogleButton } from "@/components/auth/GoogleButton"
import { PasswordField } from "@/components/auth/PasswordField"
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/contexts/AuthContext"
import type { RegisterInput } from "@/lib/types/auth"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const router = useRouter()
  const { signUp, signIn } = useAuth()
  const nameId = useId()
  const emailId = useId()
  const hintId = useId()
  const termsId = useId()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    if (name.trim().length < 2) {
      setError("Enter your full name.")
      return
    }
    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid email address.")
      return
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.")
      return
    }
    if (!acceptedTerms) {
      setError("Please accept the Terms of Service and Privacy Policy.")
      return
    }

    const input: RegisterInput = {
      name: name.trim(),
      email,
      password,
      acceptedTerms,
    }
    setSubmitting(true)
    setError("")
    try {
      await signUp(input.name, input.email, input.password)
      // Log the new account straight in, then open the dashboard.
      await signIn(input.email, input.password, true)
      router.replace("/dashboard")
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create your account. Please try again."
      )
      setSubmitting(false)
    }
  }

  return (
    <section className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1">
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em] text-foreground">
          Create your account
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Start auditing for free. No card required.
        </p>
      </div>

      <div className="mt-6">
        <GoogleButton label="Sign up with Google" onError={setError} />
      </div>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-border-soft" />
        <span className="text-caption text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border-soft" />
      </div>

      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <Label htmlFor={nameId} className="mb-1.5">
            Full name
            <span className="text-severity-critical-text" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id={nameId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="Jane Developer"
            required
            aria-required="true"
            disabled={submitting}
            className="h-12 bg-surface-0 text-base"
          />
        </div>

        <div className="mb-4">
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
            className="h-12 bg-surface-0 text-base"
          />
        </div>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          disabled={submitting}
          describedBy={hintId}
        >
          <PasswordStrengthMeter value={password} hintId={hintId} />
        </PasswordField>

        <Label
          htmlFor={termsId}
          className="my-2 mb-6 items-start gap-2 text-sm font-normal leading-relaxed text-muted-foreground"
        >
          <Checkbox
            id={termsId}
            checked={acceptedTerms}
            onCheckedChange={(value) => setAcceptedTerms(value === true)}
            required
            aria-required="true"
            disabled={submitting}
            className="mt-0.5"
          />
          <span>
            I agree to the{" "}
            <Link href="#" className="rounded-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="#" className="rounded-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              Privacy Policy
            </Link>
            .
          </span>
        </Label>

        <Button
          type="submit"
          disabled={submitting || !acceptedTerms}
          className="h-12 w-full gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Creating account…
            </>
          ) : (
            <>
              Create account
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="rounded-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
        >
          Log in
        </Link>
      </p>
    </section>
  )
}
