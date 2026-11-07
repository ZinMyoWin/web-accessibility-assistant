// @vitest-environment node
import { createServer, type Server } from "node:http"
import { AddressInfo } from "node:net"
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authenticate, createDelegation } from "./auth"

const resourceUrl = "https://audit.example.com/api/mcp"
const issuer = "https://identity.example.com/"
const secret = "mcp-test-internal-secret-at-least-32-characters"
let keys: Awaited<ReturnType<typeof generateKeyPair>>
let server: Server
let jwksUrl: string
let jwksRequests = 0

beforeAll(async () => {
  keys = await generateKeyPair("ES256")
  const publicJwk = { ...(await exportJWK(keys.publicKey)), kid: "test-key", alg: "ES256", use: "sig" }
  server = createServer((_request, response) => {
    jwksRequests += 1
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ keys: [publicJwk] }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

function config() {
  return { resourceUrl, issuer, jwksUrl, internalSecret: secret, backendUrl: "http://backend:8000", allowedOrigins: ["https://audit.example.com"] }
}

async function token(overrides: Record<string, unknown> = {}, signingKey?: CryptoKey) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ sub: "user-alpha", iss: issuer, aud: resourceUrl, iat: now, exp: now + 300, scope: "scans:read", ...overrides })
    .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "at+jwt" })
    .sign(signingKey ?? keys.privateKey)
}

function request(accessToken?: string) {
  return new Request(resourceUrl, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
}

describe("MCP OAuth access tokens", () => {
  it("validates a real issuer-signed access token against an HTTP JWKS endpoint", async () => {
    const accessToken = await token()
    const identity = await authenticate(request(accessToken), config())
    expect(identity).toMatchObject({ subject: "user-alpha", issuer, scopes: ["scans:read"] })
    expect(identity.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it.each([
    ["audience", { aud: "https://another.example.com/api/mcp" }],
    ["issuer", { iss: "https://attacker.example.com/" }],
    ["expiration", { exp: Math.floor(Date.now() / 1000) - 120 }],
    ["missing expiration", { exp: undefined }],
    ["missing subject", { sub: undefined }],
    ["empty subject", { sub: "" }],
    ["not-before", { nbf: Math.floor(Date.now() / 1000) + 300 }],
    ["missing issued-at", { iat: undefined }],
    ["future issued-at", { iat: Math.floor(Date.now() / 1000) + 300 }],
    ["ID token", { token_use: "id" }],
    ["oversized subject", { sub: "x".repeat(513) }],
    ["missing scope", { scope: undefined }],
    ["wrong scope", { scope: "preferences:write" }],
  ])("rejects an invalid %s", async (_label, overrides) => {
    await expect(authenticate(request(await token(overrides)), config())).rejects.toThrow()
  })

  it("rejects a token signed by an untrusted key", async () => {
    const attacker = await generateKeyPair("ES256")
    await expect(authenticate(request(await token({}, attacker.privateKey)), config())).rejects.toThrow()
  })

  it("caches issuer signing keys across authenticated requests", async () => {
    await authenticate(request(await token()), config())
    const requestsAfterWarmup = jwksRequests
    await Promise.all([authenticate(request(await token()), config()), authenticate(request(await token({ sub: "another-user" })), config())])
    expect(jwksRequests).toBe(requestsAfterWarmup)
  })

  it.each([undefined, "not-a-jwt"])("rejects missing or malformed authentication (%s)", async (accessToken) => {
    await expect(authenticate(request(accessToken), config())).rejects.toThrow()
  })

  it("creates a short-lived, audience-bound internal assertion instead of forwarding the external token", async () => {
    const accessToken = await token({ scope: "scans:read scans:cancel" })
    const identity = await authenticate(request(accessToken), config())
    const delegation = await createDelegation(identity, config())
    expect(delegation).not.toBe(accessToken)
    const { payload, protectedHeader } = await jwtVerify(delegation, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], issuer: "waa-mcp", audience: "waa-mcp-backend",
    })
    expect(protectedHeader.alg).toBe("HS256")
    expect(payload).toMatchObject({ typ: "mcp-delegation", oauth_issuer: issuer, sub: "user-alpha", scope: "scans:read" })
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60)
    expect(payload.exp).toBeLessThanOrEqual(identity.expiresAt)
  })

  it("keeps concurrent users isolated", async () => {
    const identities = await Promise.all(["alpha", "beta", "gamma"].map(async (subject) => {
      const identity = await authenticate(request(await token({ sub: subject })), config())
      const delegation = await createDelegation(identity, config())
      return (await jwtVerify(delegation, new TextEncoder().encode(secret))).payload.sub
    }))
    expect(identities).toEqual(["alpha", "beta", "gamma"])
  })
})
