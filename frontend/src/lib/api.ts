export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"

export function authHeaders(
  token: string,
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  }
}
