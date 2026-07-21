import type { AuthOptions, User } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { API_BASE_URL } from "@/lib/api"
import type { AuthResponse } from "@/lib/auth"

const AUTH_API_BASE_URL = process.env.AUTH_API_BASE_URL ?? API_BASE_URL

// Session lifetimes (seconds). The backend session JWT expires in 7 days, so we
// cap the "remember me" lifetime to match; without it we use a short-lived
// session that effectively ends soon after the browser is closed.
const REMEMBER_MAX_AGE = 7 * 24 * 60 * 60
const DEFAULT_MAX_AGE = 12 * 60 * 60

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

type Credentials = {
  name?: string
  email?: string
  password?: string
  mode?: string
  remember?: string
}

/**
 * Exchange a Google-verified profile for a backend session token. The backend
 * authorizes API calls with its own bearer token, so social sign-in must mint
 * one through /auth/google rather than relying on the NextAuth session alone.
 */
async function exchangeGoogleProfile(profile: {
  email: string
  name: string
  sub: string
}): Promise<User | null> {
  const proxySecret = process.env.OAUTH_PROXY_SECRET
  if (!proxySecret) {
    console.error(
      "[auth] OAUTH_PROXY_SECRET is not set; cannot exchange Google profile for a backend token."
    )
    return null
  }

  const response = await fetch(`${AUTH_API_BASE_URL}/auth/google`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OAuth-Proxy-Secret": proxySecret,
    },
    body: JSON.stringify({
      email: profile.email,
      name: profile.name,
      google_sub: profile.sub,
    }),
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
  } satisfies User
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

// Only register Google when credentials are configured so local builds without
// OAuth credentials keep working.
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
    })
  )
}

export const isGoogleAuthEnabled = Boolean(
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
)

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
    async signIn({ account, user, profile }) {
      if (account?.provider !== "google") {
        return true
      }

      // Replace the Google identity with a backend-issued session token.
      const googleProfile = profile as
        | { email?: string; name?: string; sub?: string }
        | undefined
      const email = googleProfile?.email ?? user.email ?? ""
      const sub = googleProfile?.sub ?? account.providerAccountId
      if (!email || !sub) {
        return false
      }

      const exchanged = await exchangeGoogleProfile({
        email,
        name: googleProfile?.name ?? user.name ?? email.split("@")[0],
        sub,
      })
      if (!exchanged) {
        return false
      }

      // Carry the backend token onto the user so the jwt callback can persist it.
      user.id = exchanged.id
      user.name = exchanged.name
      user.email = exchanged.email
      user.accessToken = exchanged.accessToken
      user.createdAt = exchanged.createdAt
      // Social sign-in always uses the longer "remembered" lifetime.
      user.remember = true
      return true
    },
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
