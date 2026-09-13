import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [debugToken, setDebugToken] = useState('')

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMsg('')
    setBusy(true)
    try {
      const res = await api.forgotPassword({ email })
      setMsg(res.message || 'Reset link bhej diya gaya hai')
      if (res.debug_token) {
        setDebugToken(res.debug_token)
      }
    } catch (err) {
      setError(err.message || 'Kuch galat hua')
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
          <h1 className="font-display font-semibold text-xl text-offwhite">Forgot password</h1>
          <p className="text-[13px] text-muted">Apna email dalo, hum reset link bhej denge (15 min valid)</p>

          {error && (
            <div className="text-[13px] text-coral bg-coral/10 border border-coral/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {msg && (
            <div className="text-[13px] text-signal bg-signal/10 border border-signal/20 rounded-lg px-3 py-2">
              {msg}
            </div>
          )}
          {debugToken && (
            <div className="bg-ink border border-line rounded-lg p-3 space-y-2">
              <div className="text-[11px] text-muted">DEV MODE - Token (production me email se ayega):</div>
              <div className="font-mono text-[11px] text-offwhite break-all bg-surface2 p-2 rounded">{debugToken}</div>
              <Link to={`/reset-password?token=${debugToken}`} className="inline-block text-[12px] text-signal hover:underline">
                Reset page pe jao →
              </Link>
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

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-signal text-ink font-semibold text-sm py-2.5 hover:brightness-110 transition disabled:opacity-60"
          >
            {busy ? 'Sending...' : 'Send reset link'}
          </button>

          <p className="text-[13px] text-muted text-center">
            <Link to="/login" className="text-signal hover:underline">Back to login</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
