export class McpHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "request_failed",
    public readonly retryAfter?: string,
  ) {
    super(message)
  }
}

export type McpConfig = {
  resourceUrl: string
  issuer: string
  jwksUrl: string
  internalSecret: string
  backendUrl: string
  allowedOrigins: string[]
}

function configuredUrl(value: string | undefined, publicEndpoint = true): URL {
  const url = new URL(value ?? "")
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    url.username || url.password || url.search || url.hash ||
    !["http:", "https:"].includes(url.protocol) ||
    (publicEndpoint && url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && loopback))
  ) throw new Error("Invalid URL")
  return url
}

export function getMcpConfig(): McpConfig {
  try {
    const resource = configuredUrl(process.env.MCP_PUBLIC_URL)
    if (resource.pathname !== "/api/mcp") throw new Error("Invalid MCP path")
    configuredUrl(process.env.MCP_OAUTH_ISSUER)
    const jwks = configuredUrl(process.env.MCP_OAUTH_JWKS_URL)
    const backend = configuredUrl(process.env.AUTH_API_BASE_URL, false)
    const internalSecret = process.env.MCP_INTERNAL_SECRET ?? ""
    if (Buffer.byteLength(internalSecret) < 32) throw new Error("Missing secret")
    const allowedOrigins = [resource.origin]
    for (const value of (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean)) {
      const origin = configuredUrl(value.trim())
      if (origin.pathname !== "/") throw new Error("Invalid origin")
      allowedOrigins.push(origin.origin)
    }
    return {
      resourceUrl: resource.href,
      issuer: process.env.MCP_OAUTH_ISSUER!,
      jwksUrl: jwks.href,
      internalSecret,
      backendUrl: backend.href.replace(/\/$/, ""),
      allowedOrigins,
    }
  } catch {
    throw new McpHttpError(503, "MCP is not configured.", "not_configured")
  }
}

export function metadataUrl(config: McpConfig): string {
  return new URL("/.well-known/oauth-protected-resource/api/mcp", config.resourceUrl).href
}

export function protectedResourceMetadata(config: McpConfig) {
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.issuer],
    scopes_supported: ["scans:read"],
    bearer_methods_supported: ["header"],
    resource_name: "AccessAudit saved accessibility scans",
  }
}
