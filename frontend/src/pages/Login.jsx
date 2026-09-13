import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const from = location.state?.from || '/app'

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Login nahi ho saka')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display font-bold text-lg tracking-tight text-offwhite">
            NextGen Analytics
          </div>
          <div className="font-mono text-[11px] text-muted mt-0.5">Social Media Tool</div>
        </div>

        <form onSubmit={onSubmit} className="bg-surface border border-line rounded-xl p-6 space-y-4">
          <h1 className="font-display font-semibold text-xl text-offwhite">Log in</h1>

          {error && (
            <div className="text-[13px] text-coral bg-coral/10 border border-coral/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[13px] text-muted mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-surface2 border border-line px-3 py-2.5 text-sm text-offwhite focus:border-signal outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[13px] text-muted">Password</label>
              <Link to="/forgot-password" className="text-[12px] text-signal hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-surface2 border border-line px-3 py-2.5 text-sm text-offwhite focus:border-signal outline-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-signal text-ink font-semibold text-sm py-2.5 hover:brightness-110 transition disabled:opacity-60"
          >
            {busy ? 'Logging in...' : 'Log in'}
          </button>

          <p className="text-[13px] text-muted text-center">
            Naya account? <Link to="/signup" className="text-signal hover:underline">Sign up</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
