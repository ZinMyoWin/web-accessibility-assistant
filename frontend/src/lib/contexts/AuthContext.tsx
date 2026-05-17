"use client"

import {
  createContext,
  useContext,
  type ReactNode,
} from "react"
import {
  SessionProvider,
  signIn as authSignIn,
  signOut as authSignOut,
  useSession,
} from "next-auth/react"
import { logout, type AuthUser } from "@/lib/auth"

type AuthStatus = "loading" | "authenticated" | "anonymous"

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  token: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthContextProvider>{children}</AuthContextProvider>
    </SessionProvider>
  )
}

function AuthContextProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession()
  const status: AuthStatus =
    sessionStatus === "loading"
      ? "loading"
      : session?.accessToken
        ? "authenticated"
        : "anonymous"
  const token = session?.accessToken ?? null
  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        created_at: session.user.created_at,
      }
    : null

  async function signIn(email: string, password: string) {
    const response = await authSignIn("credentials", {
      email,
      password,
      mode: "login",
      redirect: false,
    })

    if (!response?.ok) {
      throw new Error("Invalid email or password.")
    }
  }

  async function signUp(name: string, email: string, password: string) {
    const response = await authSignIn("credentials", {
      name,
      email,
      password,
      mode: "signup",
      redirect: false,
    })

    if (!response?.ok) {
      throw new Error("Unable to create account. The email may already be registered.")
    }
  }

  async function signOut() {
    if (token) {
      await logout(token)
    }
    await authSignOut({ redirect: false })
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        token,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return context
}
