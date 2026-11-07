import { z } from "zod"
import { McpHttpError, type McpConfig } from "./config"

const count = z.number().int().nonnegative()
export const scanSummarySchema = z.object({
  id: z.string().uuid(),
  url: z.string().max(2048),
  status: z.enum(["queued", "running", "complete", "error", "cancelled"]),
  mode: z.enum(["single", "multi"]),
  pages_scanned: count,
  started_at: z.string().max(100),
  completed_at: z.string().max(100).nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  summary: z.object({ total_issues: count, high: count, medium: count, low: count }),
})
export const scanListSchema = z.object({
  total: count,
  limit: z.number().int().min(1).max(20),
  offset: count,
  items: z.array(scanSummarySchema).max(20),
})
export const issueListSchema = z.object({
  scan_id: z.string().uuid(),
  total: count,
  limit: z.number().int().min(1).max(50),
  offset: count,
  items: z.array(z.object({
    rule_id: z.string().max(128),
    severity: z.string().max(32),
    element: z.string().max(2000),
    message: z.string().max(2000),
    recommendation: z.string().max(2000),
    page_url: z.string().max(2048).nullable(),
    wcag_criteria: z.array(z.string().max(100)).max(20),
  })).max(50),
})

export const listScansInput = z.strictObject({
  limit: z.number().int().min(1).max(20).default(10),
  offset: z.number().int().min(0).max(100000).default(0),
  status: z.enum(["queued", "running", "complete", "error", "cancelled"]).optional(),
  q: z.string().trim().max(200).optional(),
})
export const scanIdInput = z.strictObject({ scan_id: z.string().uuid() })
export const listIssuesInput = z.strictObject({
  scan_id: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(100000).default(0),
  severity: z.enum(["high", "medium", "low"]).optional(),
})

export async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw new McpHttpError(502, "Response is too large; request a smaller page.", "response_too_large")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export class McpBackendClient {
  constructor(
    private readonly config: McpConfig,
    private readonly assertion: string,
    private readonly signal: AbortSignal,
  ) {}

  async request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    const signal = AbortSignal.any([this.signal, AbortSignal.timeout(10000)])
    try {
      const response = await fetch(`${this.config.backendUrl}/mcp${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.assertion}`,
          ...init?.headers,
        },
        cache: "no-store",
        redirect: "error",
        signal,
      })
      if (!response.ok) {
        await response.body?.cancel()
        const messages: Record<number, string> = {
          401: "Account authorization is no longer valid.",
          403: "Link your OAuth identity to your AccessAudit account before connecting.",
          404: "Scan not found.",
          409: "This OAuth identity is already linked to another account.",
          429: "Too many MCP requests; retry later.",
        }
        const status = messages[response.status] ? response.status : 502
        const retry = response.headers.get("retry-after")
        throw new McpHttpError(status, messages[status] ?? "The scan service is unavailable.",
          status === 429 ? "rate_limited" : "backend_error", retry && /^\d{1,5}$/.test(retry) ? retry : undefined)
      }
      const bytes = await readBoundedBody(response, 512 * 1024)
      return schema.parse(JSON.parse(new TextDecoder().decode(bytes)))
    } catch (error) {
      if (error instanceof McpHttpError) throw error
      if (signal.aborted) throw new McpHttpError(504, "The request timed out or was cancelled.", "timeout")
      throw new McpHttpError(502, "The scan service returned an invalid response.", "backend_error")
    }
  }

  identity() {
    return this.request("/identity", z.object({ user_id: z.string().uuid() }))
  }

  listScans(input: z.infer<typeof listScansInput>) {
    const query = new URLSearchParams({ limit: String(input.limit), offset: String(input.offset) })
    if (input.status) query.set("status", input.status)
    if (input.q) query.set("q", input.q)
    return this.request(`/scans?${query}`, scanListSchema)
  }

  getScan(input: z.infer<typeof scanIdInput>) {
    return this.request(`/scans/${input.scan_id}`, scanSummarySchema)
  }

  listIssues(input: z.infer<typeof listIssuesInput>) {
    const query = new URLSearchParams({ limit: String(input.limit), offset: String(input.offset) })
    if (input.severity) query.set("severity", input.severity)
    return this.request(`/scans/${input.scan_id}/issues?${query}`, issueListSchema)
  }
}
