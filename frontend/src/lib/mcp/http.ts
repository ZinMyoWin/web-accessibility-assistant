import { createMcpHandler } from "@modelcontextprotocol/server"
import { authenticate, createDelegation } from "./auth"
import { McpBackendClient } from "./backend"
import { getMcpConfig, McpHttpError, metadataUrl, type McpConfig } from "./config"
import { createAccessAuditServer } from "./server"

export function validateMcpOrigin(request: Request, config: McpConfig, requireOrigin = false) {
  const canonical = new URL(config.resourceUrl)
  const url = new URL(request.url)
  const host = request.headers.get("host")
  const origin = request.headers.get("origin")
  // Next.js may build request.url from its internal listen address behind a proxy.
  if ((host ?? url.host) !== canonical.host ||
    (requireOrigin && origin !== canonical.origin) ||
    (origin && !config.allowedOrigins.includes(origin))) {
    throw new McpHttpError(403, "Request origin is not allowed.", "invalid_origin")
  }
}

export function mcpErrorResponse(error: unknown, config?: McpConfig): Response {
  const safe = error instanceof McpHttpError ? error : new McpHttpError(500, "MCP request failed.")
  const headers = new Headers({ "Cache-Control": "no-store" })
  if (config && (safe.status === 401 || safe.code === "insufficient_scope")) {
    headers.set("WWW-Authenticate", `Bearer resource_metadata="${metadataUrl(config)}", scope="scans:read", error="${safe.status === 401 ? "invalid_token" : "insufficient_scope"}"`)
  }
  if (safe.retryAfter) headers.set("Retry-After", safe.retryAfter)
  return Response.json({ error: safe.code, message: safe.message }, { status: safe.status, headers })
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  let config: McpConfig | undefined
  const started = Date.now()
  let status = 500
  try {
    config = getMcpConfig()
    validateMcpOrigin(request, config)
    if (new URL(request.url).pathname !== new URL(config.resourceUrl).pathname) {
      throw new McpHttpError(403, "Request resource is not allowed.", "invalid_resource")
    }
    const identity = await authenticate(request, config)
    const assertion = await createDelegation(identity, config)
    const backend = new McpBackendClient(config, assertion, request.signal)
    const { user_id: userId } = await backend.identity()
    if (request.method !== "POST") {
      throw new McpHttpError(405, "Use POST for this stateless MCP endpoint.", "method_not_allowed")
    }
    const handler = createMcpHandler(() => createAccessAuditServer(backend, userId), {
      legacy: "stateless",
      responseMode: "json",
      maxRequestBodySize: 32 * 1024,
      maxSubscriptions: 0,
    })
    const response = await handler.fetch(request, {
      authInfo: { token: assertion, clientId: userId, scopes: ["scans:read"], expiresAt: identity.expiresAt },
    })
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("X-Content-Type-Options", "nosniff")
    status = response.status
    return response
  } catch (error) {
    const response = mcpErrorResponse(error, config)
    if (response.status === 405) response.headers.set("Allow", "POST")
    status = response.status
    return response
  } finally {
    console.info(JSON.stringify({ event: "mcp_request", status, duration_ms: Date.now() - started }))
  }
}
