import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose"
import { McpHttpError, type McpConfig } from "./config"

export type McpIdentity = {
  subject: string
  issuer: string
  expiresAt: number
  scopes: string[]
}

let keyCache: { url: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined

export async function authenticate(request: Request, config: McpConfig): Promise<McpIdentity> {
  const authorization = request.headers.get("authorization") ?? ""
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(authorization)
  if (!match || match[1].length > 16384) {
    throw new McpHttpError(401, "A valid OAuth access token is required.", "invalid_token")
  }
  if (keyCache?.url !== config.jwksUrl) {
    keyCache = {
      url: config.jwksUrl,
      keys: createRemoteJWKSet(new URL(config.jwksUrl), {
        timeoutDuration: 5000,
        cooldownDuration: 30000,
        cacheMaxAge: 600000,
      }),
    }
  }
  let payload
  try {
    ;({ payload } = await jwtVerify(match[1], keyCache.keys, {
      issuer: config.issuer,
      audience: config.resourceUrl,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["sub", "exp", "iat"],
    }))
  } catch {
    throw new McpHttpError(401, "A valid OAuth access token is required.", "invalid_token")
  }
  if (
    typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 512 ||
    typeof payload.exp !== "number" || typeof payload.iat !== "number" ||
    payload.iat > Date.now() / 1000 || payload.token_use === "id"
  ) throw new McpHttpError(401, "A valid OAuth access token is required.", "invalid_token")
  const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : []
  if (!scopes.includes("scans:read")) {
    throw new McpHttpError(403, "The scans:read scope is required.", "insufficient_scope")
  }
  return { subject: payload.sub, issuer: config.issuer, expiresAt: payload.exp, scopes }
}

export async function createDelegation(identity: McpIdentity, config: McpConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    typ: "mcp-delegation",
    oauth_issuer: identity.issuer,
    scope: "scans:read",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("waa-mcp")
    .setAudience("waa-mcp-backend")
    .setSubject(identity.subject)
    .setIssuedAt(now)
    .setExpirationTime(Math.min(now + 60, Math.floor(identity.expiresAt)))
    .sign(new TextEncoder().encode(config.internalSecret))
}
