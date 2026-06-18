import type { DefaultSession } from "next-auth"
import type { JWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    accessToken: string
    user: {
      id: string
      name: string
      email: string
      created_at: string
    }
  }

  interface User {
    accessToken: string
    createdAt: string
    remember?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken: string
    remember?: boolean
    expiresAt?: number
    user: DefaultSession["user"] & {
      id: string
      name: string
      email: string
      created_at: string
    }
  }
}
