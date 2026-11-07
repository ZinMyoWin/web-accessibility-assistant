// @vitest-environment node
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { handleMcpRequest } from "./http"

const resourceUrl = "https://audit.example.com/api/mcp"
const issuer = "https://identity.example.com/"
const secret = "mcp-test-internal-secret-at-least-32-characters"
const scanId = "b853ca2a-decd-4c60-b973-e0255f26aceb"
const originalFetch = globalThis.fetch
let keys: Awaited<ReturnType<typeof generateKeyPair>>
let jwksServer: Server
let jwksUrl: string
let accessToken: string
let backendStatus = 200
let backendDataStatus = 200
let backendInvalidJson = false
let backendOversized = false
let backendCalls: Array<{ path: string; subject: string; token: string }> = []
const clients: Client[] = []

beforeAll(async () => {
  keys = await generateKeyPair("ES256")
  const publicJwk = { ...(await exportJWK(keys.publicKey)), kid: "http-test-key", alg: "ES256", use: "sig" }
  jwksServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ keys: [publicJwk] }))
  })
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve))
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/jwks`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => jwksServer.close((error) => error ? reject(error) : resolve()))
})

async function sign(subject = "user-alpha", scope = "scans:read") {
  return new SignJWT({ scope }).setSubject(subject).setIssuer(issuer).setAudience(resourceUrl)
    .setIssuedAt().setExpirationTime("5m").setProtectedHeader({ alg: "ES256", kid: "http-test-key", typ: "at+jwt" }).sign(keys.privateKey)
}

function summary(subject = "user-alpha") {
  return { id: scanId, url: `https://${subject}.example.com/`, status: "complete", mode: "single", pages_scanned: 1,
    started_at: "2026-11-03T12:00:00+00:00", completed_at: "2026-11-03T12:00:02+00:00", score: 88,
    summary: { total_issues: 1, high: 1, medium: 0, low: 0 } }
}

beforeEach(async () => {
  vi.stubEnv("MCP_PUBLIC_URL", resourceUrl)
  vi.stubEnv("MCP_OAUTH_ISSUER", issuer)
  vi.stubEnv("MCP_OAUTH_JWKS_URL", jwksUrl)
  vi.stubEnv("MCP_INTERNAL_SECRET", secret)
  vi.stubEnv("AUTH_API_BASE_URL", "http://backend:8000")
  vi.stubEnv("MCP_ALLOWED_ORIGINS", "")
  backendCalls = []
  backendStatus = 200
  backendDataStatus = 200
  backendInvalidJson = false
  backendOversized = false
  accessToken = await sign()
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    if (!request.url.startsWith("http://backend:8000/")) return originalFetch(input, init)
    if (request.signal.aborted) throw request.signal.reason
    const delegation = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
    const { payload } = await jwtVerify(delegation, new TextEncoder().encode(secret), { issuer: "waa-mcp", audience: "waa-mcp-backend", algorithms: ["HS256"] })
    const path = new URL(request.url).pathname
    const subject = String(payload.sub)
    backendCalls.push({ path, subject, token: delegation })
    const status = path === "/mcp/identity" ? backendStatus : backendDataStatus
    if (status !== 200) return Response.json({ detail: "INTERNAL_SECRET_DO_NOT_LEAK" }, { status, headers: status === 429 ? { "Retry-After": "12" } : {} })
    if (backendInvalidJson) return Response.json({ unexpected: "invalid upstream schema" })
    if (path === "/mcp/identity") return Response.json({ user_id: "78a701da-376f-4f88-ac94-f344b0b7ca43" })
    if (backendOversized) return new Response("x".repeat(512 * 1024 + 1))
    if (path === "/mcp/scans") return Response.json({ total: 1, limit: 20, offset: 0, items: [summary(subject)] })
    if (path === `/mcp/scans/${scanId}/issues`) return Response.json({ scan_id: scanId, total: 1, limit: 20, offset: 0, items: [{ rule_id: "image-alt", severity: "high", element: "img", message: "Image lacks alternative text", recommendation: "Add descriptive alternative text", page_url: "https://example.com/", wcag_criteria: ["1.1.1"] }] })
    if (path === `/mcp/scans/${scanId}`) return Response.json(summary(subject))
    return Response.json({ detail: "not found" }, { status: 404 })
  }))
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function connect(token = accessToken, modern = false) {
  const client = new Client({ name: "mcp-security-test", version: "1.0.0" }, modern ? { versionNegotiation: { mode: "auto" } } : {})
  clients.push(client)
  const transport = new StreamableHTTPClientTransport(new URL(resourceUrl), {
    authProvider: { token: async () => token },
    fetch: (input, init) => handleMcpRequest(new Request(input, init)),
  })
  await client.connect(transport)
  return client
}

async function rpc(method: string, params: Record<string, unknown> = {}, options: { token?: string; headers?: Record<string, string>; url?: string; body?: string } = {}) {
  return handleMcpRequest(new Request(options.url ?? resourceUrl, { method: "POST", headers: {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25",
    Authorization: `Bearer ${options.token ?? accessToken}`, ...options.headers,
  }, body: options.body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }))
}

describe("MCP Streamable HTTP integration", () => {
  it.each([false, true])("supports official SDK discovery and tools (modern=%s)", async (modern) => {
    const client = await connect(accessToken, modern)
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(["get_scan_summary", "list_scan_issues", "list_scans"])
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
    const result = await client.callTool({ name: "list_scans", arguments: {} })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({ total: 1, items: [summary()] })
    expect(backendCalls.some((call) => call.path === "/mcp/identity")).toBe(true)
    expect(backendCalls.every((call) => call.token !== accessToken && call.subject === "user-alpha")).toBe(true)
  })

  it("executes scan detail and bounded issue retrieval through the authorized backend", async () => {
    const client = await connect()
    const detail = await client.callTool({ name: "get_scan_summary", arguments: { scan_id: scanId } })
    expect(detail.structuredContent).toMatchObject(summary())
    const issues = await client.callTool({ name: "list_scan_issues", arguments: { scan_id: scanId, limit: 20, offset: 0 } })
    expect(issues.structuredContent).toMatchObject({ scan_id: scanId, total: 1, items: [{ rule_id: "image-alt" }] })
    expect(JSON.stringify(issues)).not.toContain("screenshot_data_url")
  })

  it("discovers and reads the guide and review prompt", async () => {
    const client = await connect()
    const { resources } = await client.listResources()
    expect(resources).toMatchObject([{ uri: "accessaudit://guide" }])
    const guide = await client.readResource({ uri: "accessaudit://guide" })
    expect(guide.contents[0]).toMatchObject({ mimeType: "text/plain" })
    const { prompts } = await client.listPrompts()
    expect(prompts).toMatchObject([{ name: "review_accessibility_scan" }])
    const prompt = await client.getPrompt({ name: "review_accessibility_scan", arguments: { scan_id: scanId } })
    expect(JSON.stringify(prompt)).toContain(scanId)
    expect(JSON.stringify(prompt)).toContain("untrusted")
  })

  it("requires OAuth before tool discovery and advertises protected resource metadata", async () => {
    const response = await handleMcpRequest(new Request(resourceUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=")
    expect(response.headers.get("www-authenticate")).toContain("scans:read")
    expect(backendCalls).toEqual([])
  })

  it.each(["https://evil.example.com", "null"])("rejects an untrusted Origin (%s)", async (origin) => {
    expect((await rpc("tools/list", {}, { headers: { Origin: origin } })).status).toBe(403)
    expect(backendCalls).toEqual([])
  })

  it("rejects a request addressed to another host", async () => {
    expect((await rpc("tools/list", {}, { url: "https://attacker.example.com/api/mcp" })).status).toBe(403)
    expect(backendCalls).toEqual([])
  })

  it("rejects requests addressed to another path on the canonical host", async () => {
    expect((await rpc("tools/list", {}, { url: "https://audit.example.com/another-endpoint" })).status).toBe(403)
    expect(backendCalls).toEqual([])
  })

  it("checks access token scopes before initializing the transport", async () => {
    const response = await rpc("tools/list", {}, { token: await sign("user-alpha", "preferences:write") })
    expect(response.status).toBe(403)
    expect(response.headers.get("www-authenticate")).toContain("insufficient_scope")
    expect(backendCalls).toEqual([])
  })

  it("propagates safe rate-limit retry information", async () => {
    backendStatus = 429
    const response = await rpc("tools/list")
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("12")
    expect(await response.text()).not.toContain("INTERNAL_SECRET_DO_NOT_LEAK")
  })

  it("rejects unlinked identities before discovery or execution", async () => {
    backendStatus = 403
    const response = await rpc("tools/list")
    expect(response.status).toBe(403)
    expect(await response.text()).toContain("Link your OAuth identity")
    expect(backendCalls).toHaveLength(1)
    expect(backendCalls[0].path).toBe("/mcp/identity")
  })

  it("honors cancellation of the request before backend work", async () => {
    const controller = new AbortController()
    controller.abort()
    const response = await handleMcpRequest(new Request(resourceUrl, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: "{}", signal: controller.signal }))
    expect(response.status).toBe(504)
    expect(backendCalls).toEqual([])
  })

  it("rejects bodies larger than 32 KiB", async () => {
    const response = await rpc("tools/list", {}, { body: " ".repeat(32769) })
    expect(response.status).toBe(413)
  })

  it("handles malformed JSON without leaking implementation details", async () => {
    const response = await rpc("tools/list", {}, { body: "{" })
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("SyntaxError")
  })

  it.each([
    ["list_scans", { user_id: "someone-else" }],
    ["list_scans", { limit: 101 }],
    ["list_scans", { offset: -1 }],
    ["get_scan_summary", { scan_id: "../../auth/me" }],
    ["list_scan_issues", { scan_id: scanId, limit: 101 }],
    ["delete_scans", {}],
  ])("rejects unauthorized or invalid tool arguments for %s", async (name, args) => {
    const client = await connect()
    const result = await client.callTool({ name, arguments: args }).catch(() => ({ isError: true }))
    expect(result.isError).toBe(true)
    expect(backendCalls.filter((call) => call.path !== "/mcp/identity")).toEqual([])
  })

  it("keeps concurrent clients bound to their own verified identity", async () => {
    const [alpha, beta] = await Promise.all([connect(await sign("alpha")), connect(await sign("beta"))])
    const results = await Promise.all([alpha, beta].map((client) => client.callTool({ name: "list_scans", arguments: {} })))
    expect(results[0].structuredContent).toMatchObject({ items: [{ url: "https://alpha.example.com/" }] })
    expect(results[1].structuredContent).toMatchObject({ items: [{ url: "https://beta.example.com/" }] })
  })

  it("does not leak backend error details", async () => {
    backendStatus = 500
    const response = await rpc("tools/list")
    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(await response.text()).not.toContain("INTERNAL_SECRET_DO_NOT_LEAK")
  })

  it("returns safe MCP tool errors when a scan is inaccessible", async () => {
    const client = await connect()
    backendDataStatus = 404
    const result = await client.callTool({ name: "get_scan_summary", arguments: { scan_id: scanId } })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain("Scan not found")
    expect(JSON.stringify(result)).not.toContain("INTERNAL_SECRET_DO_NOT_LEAK")
  })

  it("bounds upstream tool response bytes", async () => {
    const client = await connect()
    backendOversized = true
    const result = await client.callTool({ name: "list_scans", arguments: {} })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain("smaller page")
  })

  it("rejects invalid upstream responses", async () => {
    backendInvalidJson = true
    const response = await rpc("tools/list")
    expect(response.status).toBeGreaterThanOrEqual(500)
  })
})
