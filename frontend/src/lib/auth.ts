import { API_BASE_URL } from "@/lib/api"

export type AuthUser = {
  id: string
  name: string
  email: string
  created_at: string
}

export type AuthResponse = {
  token: string
  user: AuthUser
}

type ApiErrorBody = {
  detail?: string
}

export async function signup(payload: {
  name: string
  email: string
  password: string
}): Promise<AuthResponse> {
  return authRequest("/auth/signup", payload)
}

export async function login(payload: {
  email: string
  password: string
}): Promise<AuthResponse> {
  return authRequest("/auth/login", payload)
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as AuthUser
}

export async function requestPasswordReset(email: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  const data = (await response.json()) as { message: string }
  return data.message
}

export async function resetPassword(
  token: string,
  password: string
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  const data = (await response.json()) as { message: string }
  return data.message
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

async function authRequest(
  path: string,
  payload: Record<string, string>
): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return (await response.json()) as AuthResponse
}

async function getApiErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.detail || "Request failed."
  } catch {
    return "Request failed."
  }
}
