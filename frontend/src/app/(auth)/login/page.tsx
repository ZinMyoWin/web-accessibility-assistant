"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useId, useState, type FormEvent } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { AuthAlert } from "@/components/auth/AuthAlert"
import { GoogleButton } from "@/components/auth/GoogleButton"
import { PasswordField } from "@/components/auth/PasswordField"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/contexts/AuthContext"
import type { LoginInput } from "@/lib/types/auth"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn } = useAuth()
  const emailId = useId()
  const rememberId = useId()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = searchParams.get("callbackUrl") || "/dashboard"

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter a valid email address.")
      return
    }
    if (!password) {
      setError("Enter your password.")
      return
    }

    const input: LoginInput = { email, password, remember }
    setSubmitting(true)
    setError("")
    try {
      await signIn(input.email, input.password, input.remember)
      router.replace(redirectTo)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to log in. Please try again."
      )
      setSubmitting(false)
    }
  }

  return (
    <section className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome back
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Log in to run scans and view your reports.
        </p>
      </div>

      <div className="mt-6">
        <GoogleButton label="Continue with Google" onError={setError} />
      </div>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border-soft" />
        <span className="text-caption text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border-soft" />
      </div>

      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

      <form onSubmit={handleSubmit} noValidate>
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
            className="h-11 bg-surface-1 text-body focus-visible:bg-surface-0"
          />
        </div>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          disabled={submitting}
        />

        <div className="mb-6 flex items-center justify-between">
          <Label
            htmlFor={rememberId}
            className="gap-2 text-caption font-normal text-muted-foreground"
          >
            <Checkbox
              id={rememberId}
              checked={remember}
              onCheckedChange={(value) => setRemember(value === true)}
              disabled={submitting}
            />
            Remember me
          </Label>
          <Link
            href="/forgot-password"
            className="text-label font-medium text-brand-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" disabled={submitting} className="h-11 w-full gap-2">
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Logging in…
            </>
          ) : (
            <>
              Log in
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-caption text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-semibold text-brand-700 hover:underline"
        >
          Sign up free
        </Link>
      </p>
    </section>
  )
}

export default function LoginPage() {
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
      <LoginForm />
    </Suspense>
  )
}
