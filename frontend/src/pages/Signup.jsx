import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signup(name, email, password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message || 'Account nahi ban saka')
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
          <h1 className="font-display font-semibold text-xl text-offwhite">Create your account</h1>

          {error && (
            <div className="text-[13px] text-coral bg-coral/10 border border-coral/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[13px] text-muted mb-1.5">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-surface2 border border-line px-3 py-2.5 text-sm text-offwhite focus:border-signal outline-none"
              placeholder="Your name"
            />
          </div>

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
            <label className="block text-[13px] text-muted mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-surface2 border border-line px-3 py-2.5 text-sm text-offwhite focus:border-signal outline-none"
              placeholder="At least 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-signal text-ink font-semibold text-sm py-2.5 hover:brightness-110 transition disabled:opacity-60"
          >
            {busy ? 'Creating account...' : 'Sign up'}
          </button>

          <p className="text-[13px] text-muted text-center">
            Pehle se account hai? <Link to="/login" className="text-signal hover:underline">Log in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
