"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/contexts/AuthContext"

type AuthCardProps = {
  mode: "login" | "signup"
}

export function AuthCard({ mode }: AuthCardProps) {
  const router = useRouter()
  const { signIn, signUp } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isSignup = mode === "signup"

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setError("")
    setSuccess("")
    try {
      if (isSignup) {
        await signUp(name, email, password)
      } else {
        await signIn(email, password)
      }
      setSuccess(
        isSignup
          ? "Account created successfully. Opening your dashboard..."
          : "Login successful. Opening your dashboard..."
      )
      window.setTimeout(() => {
        router.replace("/")
      }, 900)
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Authentication failed."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,197,148,0.18),_transparent_30%),linear-gradient(135deg,_#f7f4ed_0%,_#eef7f1_48%,_#f5f2ea_100%)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-border bg-card/95 shadow-[0_24px_80px_rgba(20,43,33,0.18)] lg:grid-cols-[1fr_0.9fr]">
          <section className="relative hidden min-h-[620px] flex-col justify-between bg-[#12382c] p-10 text-white lg:flex">
            <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(120deg,transparent_0_48%,rgba(255,255,255,.18)_49%,transparent_50%),radial-gradient(circle_at_30%_20%,#7de0b2,transparent_25%)]" />
            <div className="relative">
              <div className="text-sm font-bold tracking-tight text-[#91f0c6]">
                AccessAudit
              </div>
              <div className="mt-1 text-xs text-white/60">BSc Project</div>
            </div>
            <div className="relative">
              <p className="mb-5 max-w-md text-4xl font-semibold leading-tight tracking-[-0.04em]">
                Keep every scan tied to a real user account.
              </p>
              <p className="max-w-sm text-sm leading-6 text-white/70">
                Save scan history, preferences, reports, and future repair workflows under a persistent user profile.
              </p>
            </div>
            <div className="relative grid grid-cols-3 gap-3 text-xs">
              {["Stored users", "Secure sessions", "Saved audits"].map((item) => (
                <div key={item} className="rounded-2xl bg-white/10 p-3 text-white/75">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-[620px] items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-sm">
              <div className="mb-8">
                <div className="mb-3 inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-primary">
                  {isSignup ? "Create account" : "Welcome back"}
                </div>
                <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
                  {isSignup ? "Sign up for AccessAudit" : "Log in to AccessAudit"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {isSignup
                    ? "Create a profile so scan records can be stored against your account."
                    : "Use your account to continue scanning and reviewing saved results."}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {isSignup && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-foreground">
                      Name
                    </span>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      required
                      minLength={2}
                    />
                  </label>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Email
                  </span>
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Password
                  </span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={isSignup ? "At least 8 characters" : "Your password"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    required
                    minLength={isSignup ? 8 : 1}
                  />
                </label>

                {error && (
                  <div className="rounded-md border border-red-600/20 bg-[var(--high-bg)] px-3 py-2 text-xs text-[var(--high-text)]">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-md border border-primary/20 bg-secondary px-3 py-2 text-xs text-primary">
                    {success}
                  </div>
                )}

                <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Please wait..."
                    : isSignup
                      ? "Create account"
                      : "Log in"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {isSignup ? "Already have an account?" : "No account yet?"}{" "}
                <Link
                  href={isSignup ? "/login" : "/signup"}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {isSignup ? "Log in" : "Sign up"}
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
