// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getMcpConfig } from "./config"
import { GET as getResourceMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/route"
import { GET as getRootResourceMetadata } from "@/app/.well-known/oauth-protected-resource/route"

beforeEach(() => {
  vi.stubEnv("MCP_PUBLIC_URL", "https://audit.example.com/api/mcp")
  vi.stubEnv("MCP_OAUTH_ISSUER", "https://identity.example.com/")
  vi.stubEnv("MCP_OAUTH_JWKS_URL", "https://identity.example.com/jwks")
  vi.stubEnv("MCP_INTERNAL_SECRET", "test-mcp-internal-secret-at-least-32-characters")
  vi.stubEnv("AUTH_API_BASE_URL", "http://backend:8000")
})

afterEach(() => vi.unstubAllEnvs())

describe("MCP configuration fails closed", () => {
  it("accepts explicit secure resource and issuer configuration", () => {
    expect(getMcpConfig()).toMatchObject({ resourceUrl: "https://audit.example.com/api/mcp", issuer: "https://identity.example.com/", backendUrl: "http://backend:8000" })
  })

  it("preserves the provider's exact issuer identifier without adding a trailing slash", () => {
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://identity.example.com")
    expect(getMcpConfig().issuer).toBe("https://identity.example.com")
  })

  it("publishes matching RFC 9728 resource metadata at both discovery paths", async () => {
    for (const get of [getResourceMetadata, getRootResourceMetadata]) {
      const response = get()
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toMatchObject({
        resource: "https://audit.example.com/api/mcp",
        authorization_servers: ["https://identity.example.com/"],
        scopes_supported: ["scans:read"],
        bearer_methods_supported: ["header"],
      })
    }
  })

  it("returns service unavailable from metadata discovery when unconfigured", async () => {
    vi.stubEnv("MCP_INTERNAL_SECRET", "")
    const response = getResourceMetadata()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("test-mcp-internal-secret")
  })

  it("permits local HTTP development only outside production", () => {
    vi.stubEnv("MCP_PUBLIC_URL", "http://127.0.0.1:3000/api/mcp")
    expect(getMcpConfig().resourceUrl).toBe("http://127.0.0.1:3000/api/mcp")
    vi.stubEnv("NODE_ENV", "production")
    expect(getMcpConfig).toThrow()
  })

  it.each(["MCP_PUBLIC_URL", "MCP_OAUTH_ISSUER", "MCP_OAUTH_JWKS_URL", "MCP_INTERNAL_SECRET", "AUTH_API_BASE_URL"])("requires %s", (variable) => {
    vi.stubEnv(variable, "")
    expect(getMcpConfig).toThrow()
  })

  it.each([
    ["MCP_PUBLIC_URL", "http://audit.example.com/api/mcp"],
    ["MCP_PUBLIC_URL", "https://audit.example.com/not-mcp"],
    ["MCP_PUBLIC_URL", "https://user:password@audit.example.com/api/mcp"],
    ["MCP_PUBLIC_URL", "https://audit.example.com/api/mcp?token=secret"],
    ["MCP_PUBLIC_URL", "https://audit.example.com/api/mcp#fragment"],
    ["MCP_OAUTH_ISSUER", "http://identity.example.com/"],
    ["MCP_OAUTH_JWKS_URL", "http://identity.example.com/jwks"],
    ["MCP_INTERNAL_SECRET", "too-short"],
    ["AUTH_API_BASE_URL", "not-a-url"],
  ])("rejects insecure or malformed %s", (variable, value) => {
    vi.stubEnv(variable, value)
    expect(getMcpConfig).toThrow()
  })
})
