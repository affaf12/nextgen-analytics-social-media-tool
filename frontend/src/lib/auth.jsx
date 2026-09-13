import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const TOKEN_KEY = 'affaf-crm:auth-token'
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadMe = async () => {
    if (!getToken()) { setUser(null); setLoading(false); return }
    try {
      const me = await api.me()
      setUser(me)
    } catch {
      setToken('')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMe() }, [])

  const signup = async (name, email, password) => {
    const res = await api.signup({ name, email, password })
    setToken(res.token)
    setUser(res.user)
    return res.user
  }

  const login = async (email, password) => {
    const res = await api.login({ email, password })
    setToken(res.token)
    setUser(res.user)
    return res.user
  }

  const logout = () => {
    setToken('')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
