import type { AuthOptions, User } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { API_BASE_URL } from "@/lib/api"
import type { AuthResponse } from "@/lib/auth"

const AUTH_API_BASE_URL = process.env.AUTH_API_BASE_URL ?? API_BASE_URL

// Session lifetimes (seconds). The backend session JWT expires in 7 days, so we
// cap the "remember me" lifetime to match; without it we use a short-lived
// session that effectively ends soon after the browser is closed.
const REMEMBER_MAX_AGE = 7 * 24 * 60 * 60
const DEFAULT_MAX_AGE = 12 * 60 * 60

type Credentials = {
  name?: string
  email?: string
  password?: string
  mode?: string
  remember?: string
}

const providers: AuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email and password",
    credentials: {
      name: { label: "Name", type: "text" },
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      mode: { label: "Mode", type: "text" },
      remember: { label: "Remember", type: "text" },
    },
    async authorize(rawCredentials) {
      const credentials = rawCredentials as Credentials | undefined
      const email = credentials?.email?.trim().toLowerCase()
      const password = credentials?.password ?? ""
      const mode = credentials?.mode === "signup" ? "signup" : "login"

      if (!email || !password) {
        return null
      }

      const response = await fetch(`${AUTH_API_BASE_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup"
            ? {
                name: credentials?.name?.trim() ?? "",
                email,
                password,
              }
            : { email, password }
        ),
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as AuthResponse
      return {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        createdAt: data.user.created_at,
        accessToken: data.token,
        remember: credentials?.remember === "true",
      } satisfies User
    },
  }),
]

export const authOptions: AuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: REMEMBER_MAX_AGE,
  },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const remember = user.remember === true
        token.accessToken = user.accessToken
        token.remember = remember
        token.expiresAt =
          Date.now() + (remember ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE) * 1000
        token.user = {
          id: user.id,
          name: user.name ?? "",
          email: user.email ?? "",
          created_at: user.createdAt,
        }
      }
      return token
    },
    session({ session, token }) {
      // Enforce the logical "remember me" lifetime even though the cookie may
      // live longer; an expired session is returned without an access token so
      // guarded routes treat the user as anonymous.
      if (token.expiresAt && Date.now() > token.expiresAt) {
        session.accessToken = ""
        return session
      }
      session.accessToken = token.accessToken
      session.user = token.user
      return session
    },
  },
}
