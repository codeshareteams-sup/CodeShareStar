import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:4000' 
    : window.location.origin)
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // null = guest
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)  // true during initial token validation

  // Always start as Guest on fresh load
  useEffect(() => {
    setLoading(false)
  }, [])

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback((tokenValue, userData) => {
    localStorage.setItem('cs_token', tokenValue)
    localStorage.setItem('cs_user', JSON.stringify(userData))
    setToken(tokenValue)
    setUser(userData)
  }, [])

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem('cs_token')
    localStorage.removeItem('cs_user')
    setToken(null)
    setUser(null)
  }, [])

  // ── Update plan after pricing page selection ────────────────────────────────
  const updatePlan = useCallback((plan) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, plan, planChosen: true }
      localStorage.setItem('cs_user', JSON.stringify(updated))
      return updated
    })
  }, [])

  const isAuthenticated = !!user

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, login, logout, updatePlan }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export const BACKEND_URL = BACKEND
