"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { AuthAlert } from "@/components/auth/AuthAlert"
import { AuthShell } from "@/components/auth/AuthShell"
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
        router.replace("/dashboard")
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
    <AuthShell>
      <section>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.035em] text-foreground">
          {isSignup ? "Sign up for AccessAudit" : "Log in to AccessAudit"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {isSignup
            ? "Create a profile so scan records can be stored against your account."
            : "Use your account to continue scanning and reviewing saved results."}
        </p>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          {isSignup && (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">Name</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
                minLength={2}
                className="h-12 text-base"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="h-12 text-base"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-foreground">Password</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 8 : 1}
              className="h-12 text-base"
            />
          </label>

          {error && <AuthAlert tone="error">{error}</AuthAlert>}
          {success && <AuthAlert tone="success">{success}</AuthAlert>}

          <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : isSignup ? "Create account" : "Log in"}
          </Button>
        </form>

        <p className="mt-7 text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account?" : "No account yet?"}{" "}
          <Link
            href={isSignup ? "/login" : "/register"}
            className="rounded-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
          >
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </p>
      </section>
    </AuthShell>
  )
}
