// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ session: vi.fn(), authenticate: vi.fn(), request: vi.fn() }))
vi.mock("next-auth", () => ({ getServerSession: mocks.session }))
vi.mock("@/lib/auth-options", () => ({ authOptions: {} }))
vi.mock("./auth", () => ({ authenticate: mocks.authenticate, createDelegation: async () => "internal-assertion" }))
vi.mock("./backend", () => ({ McpBackendClient: class { request = mocks.request } }))
import { handleLinkRequest } from "./link"

beforeEach(() => {
  vi.stubEnv("MCP_PUBLIC_URL", "https://audit.example.com/api/mcp")
  vi.stubEnv("MCP_OAUTH_ISSUER", "https://identity.example.com/")
  vi.stubEnv("MCP_OAUTH_JWKS_URL", "https://identity.example.com/jwks")
  vi.stubEnv("MCP_INTERNAL_SECRET", "test-secret-that-is-at-least-32-characters")
  vi.stubEnv("AUTH_API_BASE_URL", "http://backend:8000")
  mocks.session.mockResolvedValue({ accessToken: "existing-app-session" })
  mocks.authenticate.mockResolvedValue({ subject: "external-user", issuer: "https://identity.example.com/", expiresAt: Date.now() / 1000 + 100, scopes: ["scans:read"] })
  mocks.request.mockResolvedValue({ linked: true, user_id: "2a3d98ee-124c-4a0a-84ee-eb6f205ceff4" })
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

function request(method = "POST", origin: string | null = "https://audit.example.com") {
  return new Request("https://audit.example.com/api/mcp/link", { method, headers: origin ? { Origin: origin, Authorization: "Bearer external-token" } : {} })
}

it("links only after proving both the application session and OAuth identity", async () => {
  expect((await handleLinkRequest(request())).status).toBe(200)
  expect(mocks.authenticate).toHaveBeenCalledOnce()
  expect(mocks.request).toHaveBeenCalledWith("/link", expect.anything(), {
    method: "POST", headers: { Authorization: "Bearer existing-app-session", "X-MCP-Assertion": "internal-assertion" },
  })
})

it.each([null, "https://attacker.example.com"])("rejects a link with missing or foreign Origin (%s)", async (origin) => {
  expect((await handleLinkRequest(request("POST", origin))).status).toBe(403)
  expect(mocks.request).not.toHaveBeenCalled()
})

it("requires the application session even with a valid OAuth token", async () => {
  mocks.session.mockResolvedValue(null)
  expect((await handleLinkRequest(request())).status).toBe(401)
  expect(mocks.request).not.toHaveBeenCalled()
})

it("allows revoking all caller bindings without an OAuth token", async () => {
  mocks.request.mockResolvedValue({ unlinked: 1 })
  expect((await handleLinkRequest(request("DELETE"))).status).toBe(200)
  expect(mocks.authenticate).not.toHaveBeenCalled()
  expect(mocks.request).toHaveBeenCalledWith("/link", expect.anything(), {
    method: "DELETE", headers: { Authorization: "Bearer existing-app-session" },
  })
})
