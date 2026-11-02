import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Environment helpers shared by the Playwright config and the E2E specs.
 *
 * Next.js loads `frontend/.env.local` for the dev server, but the Playwright
 * process is a plain Node process, so the helpers read the same file to reuse
 * the dev server's `AUTH_SECRET` and `NEXTAUTH_URL` outside CI. In CI the
 * values come from the workflow `env:` block.
 */

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"

function readLocalEnv(): Record<string, string> {
  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    const values: Record<string, string> = {}

    for (const line of contents.split(/\r?\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line.trim())
      if (match) {
        values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
      }
    }

    return values
  } catch {
    return {}
  }
}

const localEnv = readLocalEnv()

export function getAuthSecret(): string {
  const secret =
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    localEnv.AUTH_SECRET ??
    localEnv.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error(
      "E2E setup: AUTH_SECRET is missing. Set it in the environment or in frontend/.env.local so the test session can be signed the same way as the dev server."
    )
  }

  return secret
}

/**
 * NextAuth prefixer: secure cookies are used only when the configured auth URL
 * is HTTPS. The dev server (and CI webServer) uses http://127.0.0.1:3000.
 */
export function getSessionCookieName(): string {
  const authUrl = process.env.NEXTAUTH_URL ?? localEnv.NEXTAUTH_URL ?? BASE_URL
  return authUrl.startsWith("https://")
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token"
}
