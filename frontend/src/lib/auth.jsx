import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const TOKEN_KEY = 'affaf-crm:auth-token'
const USER_KEY = 'affaf-crm:user-cache'
const AuthContext = createContext(null)

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setCachedUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCachedUser()) // reload pe instant user dikhe
  const [loading, setLoading] = useState(true)

  const loadMe = async () => {
    const token = getToken()
    if (!token) {
      setUser(null)
      setCachedUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await api.me()
      setUser(me)
      setCachedUser(me)
    } catch (err) {
      const msg = (err.message || '').toLowerCase()
      // Sirf 401 / token invalid pe logout karo, network error pe nahi
      if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('token') || msg.includes('invalid')) {
        setToken('')
        setUser(null)
        setCachedUser(null)
      } else {
        // Network error - cached user ko rehne do, reload pe login pe nahi jayega
        console.warn('me() failed but keeping cached user:', err.message)
        const cached = getCachedUser()
        if (cached) setUser(cached)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMe() }, [])

  const signup = async (name, email, password) => {
    const res = await api.signup({ name, email, password })
    setToken(res.token)
    setUser(res.user)
    setCachedUser(res.user)
    return res.user
  }

  const login = async (email, password) => {
    const res = await api.login({ email, password })
    setToken(res.token)
    setUser(res.user)
    setCachedUser(res.user)
    return res.user
  }

  const logout = () => {
    setToken('')
    setUser(null)
    setCachedUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
