import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth-options"
import { authenticate, createDelegation } from "./auth"
import { McpBackendClient } from "./backend"
import { getMcpConfig, McpHttpError } from "./config"
import { mcpErrorResponse, validateMcpOrigin } from "./http"

export async function handleLinkRequest(request: Request): Promise<Response> {
  try {
    const config = getMcpConfig()
    validateMcpOrigin(request, config, true)
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) throw new McpHttpError(401, "Sign in to AccessAudit before managing MCP access.", "app_session_required")
    if (request.method === "DELETE") {
      const backend = new McpBackendClient(config, "", request.signal)
      const output = await backend.request("/link", z.object({ unlinked: z.number().int().nonnegative() }), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      return Response.json(output, { headers: { "Cache-Control": "no-store" } })
    }
    if (request.method !== "POST") throw new McpHttpError(405, "Use POST to link or DELETE to revoke MCP access.")
    const identity = await authenticate(request, config)
    const assertion = await createDelegation(identity, config)
    const backend = new McpBackendClient(config, assertion, request.signal)
    const output = await backend.request("/link", z.object({ linked: z.literal(true), user_id: z.string().uuid() }), {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}`, "X-MCP-Assertion": assertion },
    })
    return Response.json(output, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return mcpErrorResponse(error)
  }
}
