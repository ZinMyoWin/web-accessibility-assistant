import { handleLinkRequest } from "@/lib/mcp/link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const POST = handleLinkRequest
export const DELETE = handleLinkRequest
