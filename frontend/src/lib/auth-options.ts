import type { AuthOptions, User } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { API_BASE_URL } from "@/lib/api"
import type { AuthResponse } from "@/lib/auth"

const AUTH_API_BASE_URL = process.env.AUTH_API_BASE_URL ?? API_BASE_URL

type Credentials = {
  name?: string
  email?: string
  password?: string
  mode?: string
}

export const authOptions: AuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        name: { label: "Name", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mode: { label: "Mode", type: "text" },
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
        } satisfies User
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken
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
      session.accessToken = token.accessToken
      session.user = token.user
      return session
    },
  },
}
