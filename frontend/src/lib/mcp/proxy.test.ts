// @vitest-environment node
import { describe, expect, it } from "vitest"
import { validateMcpOrigin } from "./http"

const config = {
  resourceUrl: "https://audit.example.com/api/mcp",
  issuer: "https://identity.example.com",
  jwksUrl: "https://identity.example.com/jwks",
  internalSecret: "test-internal-secret-of-at-least-32-bytes",
  backendUrl: "http://backend:8000",
  allowedOrigins: ["https://audit.example.com"],
}

describe("MCP authority behind a Next.js reverse proxy", () => {
  it("accepts the canonical Host when Next.js constructs an internal request URL", () => {
    const request = new Request("http://0.0.0.0:3000/api/mcp", {
      headers: { Host: "audit.example.com", Origin: "https://audit.example.com" },
    })
    expect(() => validateMcpOrigin(request, config)).not.toThrow()
    expect(() => validateMcpOrigin(request, config, true)).not.toThrow()
  })

  it("rejects a foreign Host even when the request URL is canonical", () => {
    const request = new Request(config.resourceUrl, { headers: { Host: "attacker.example.com" } })
    expect(() => validateMcpOrigin(request, config)).toThrow("Request origin is not allowed")
  })

  it("does not trust X-Forwarded-Host to override a foreign Host", () => {
    const request = new Request("http://0.0.0.0:3000/api/mcp", {
      headers: { Host: "attacker.example.com", "X-Forwarded-Host": "audit.example.com" },
    })
    expect(() => validateMcpOrigin(request, config)).toThrow("Request origin is not allowed")
  })

  it("uses the request authority for web-standard requests without a Host header", () => {
    expect(() => validateMcpOrigin(new Request(config.resourceUrl), config)).not.toThrow()
    expect(() => validateMcpOrigin(new Request("https://attacker.example.com/api/mcp"), config)).toThrow("Request origin is not allowed")
  })
})
