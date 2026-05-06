"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  fetchCurrentUser,
  login,
  logout,
  signup,
  type AuthUser,
} from "@/lib/auth"

const AUTH_TOKEN_KEY = "accessaudit_auth_token"

type AuthStatus = "loading" | "authenticated" | "anonymous"

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  token: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const storedToken = window.localStorage.getItem(AUTH_TOKEN_KEY)
    if (!storedToken) {
      setStatus("anonymous")
      return
    }

    setToken(storedToken)
    fetchCurrentUser(storedToken)
      .then((currentUser) => {
        setUser(currentUser)
        setStatus("authenticated")
      })
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_KEY)
        setToken(null)
        setUser(null)
        setStatus("anonymous")
      })
  }, [])

  async function signIn(email: string, password: string) {
    const response = await login({ email, password })
    persistSession(response.token, response.user)
  }

  async function signUp(name: string, email: string, password: string) {
    const response = await signup({ name, email, password })
    persistSession(response.token, response.user)
  }

  async function signOut() {
    const activeToken = token
    clearSession()
    if (activeToken) {
      await logout(activeToken)
    }
  }

  function persistSession(nextToken: string, nextUser: AuthUser) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, nextToken)
    setToken(nextToken)
    setUser(nextUser)
    setStatus("authenticated")
  }

  function clearSession() {
    window.localStorage.removeItem(AUTH_TOKEN_KEY)
    setToken(null)
    setUser(null)
    setStatus("anonymous")
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        token,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return context
}
