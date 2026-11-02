import type { BrowserContext } from "@playwright/test"
import { encode } from "next-auth/jwt"

import { BASE_URL, getAuthSecret, getSessionCookieName } from "./env"

/** Bearer token the stubbed backend endpoints expect to receive. */
export const E2E_ACCESS_TOKEN = "e2e-backend-token"

/** User identity carried by the minted NextAuth session. */
export const E2E_USER = {
  id: "e2e-user-1",
  name: "E2E Tester",
  email: "e2e@example.com",
  created_at: "2025-01-01T00:00:00Z",
}

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

/**
 * Mint a signed NextAuth JWT session cookie exactly the way the Next.js server
 * signs real sessions (same secret, same encryption/salt). This lets the
 * middleware guard pass and `useSession()` resolve an authenticated user
 * without running the credentials exchange against a live backend.
 */
export async function signInAsE2EUser(context: BrowserContext): Promise<void> {
  const maxAge = SESSION_MAX_AGE_SECONDS
  const token = await encode({
    secret: getAuthSecret(),
    maxAge,
    token: {
      sub: E2E_USER.id,
      name: E2E_USER.name,
      email: E2E_USER.email,
      accessToken: E2E_ACCESS_TOKEN,
      remember: true,
      expiresAt: Date.now() + maxAge * 1000,
      user: E2E_USER,
    },
  })

  await context.addCookies([
    {
      name: getSessionCookieName(),
      value: token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + maxAge,
    },
  ])
}
