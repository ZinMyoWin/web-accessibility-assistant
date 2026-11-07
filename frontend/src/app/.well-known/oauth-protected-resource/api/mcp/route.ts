import { getMcpConfig, protectedResourceMetadata } from "@/lib/mcp/config"
import { mcpErrorResponse } from "@/lib/mcp/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  try {
    return Response.json(protectedResourceMetadata(getMcpConfig()), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return mcpErrorResponse(error)
  }
}
