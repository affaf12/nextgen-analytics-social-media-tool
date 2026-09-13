import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const tokenFromUrl = searchParams.get('token') || ''

  const [token, setToken] = useState(tokenFromUrl)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl)
  }, [tokenFromUrl])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Password match nahi kar rahe')
      return
    }
    if (newPassword.length < 6) {
      setError('Password kam se kam 6 characters ka ho')
      return
    }
    setBusy(true)
    try {
      await api.resetPassword({ token, new_password: newPassword })
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err) {
      setError(err.message || 'Reset nahi ho saka')
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
          <h1 className="font-display font-semibold text-xl text-offwhite">Reset password</h1>

          {error && (
            <div className="text-[13px] text-coral bg-coral/10 border border-coral/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-[13px] text-signal bg-signal/10 border border-signal/20 rounded-lg px-3 py-2">
              Password reset ho gaya! Login pe redirect ho rahe ho...
            </div>
          )}

          <div>
            <label className="block text-[13px] text-muted mb-1.5">Reset Token</label>
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-lg bg-surface2 border border-line px-3 py-2.5 text-[12px] font-mono text-offwhite focus:border-signal outline-none"
              placeholder="Token from email/link"
            />
          </div>

          <div>
            <label className="block text-[13px] text-muted mb-1.5">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg bg-surface2 border border-line px-3 py-2.5 text-sm text-offwhite focus:border-signal outline-none"
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label className="block text-[13px] text-muted mb-1.5">Confirm Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg bg-surface2 border border-line px-3 py-2.5 text-sm text-offwhite focus:border-signal outline-none"
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            disabled={busy || success}
            className="w-full rounded-lg bg-signal text-ink font-semibold text-sm py-2.5 hover:brightness-110 transition disabled:opacity-60"
          >
            {busy ? 'Resetting...' : 'Reset password'}
          </button>

          <p className="text-[13px] text-muted text-center">
            <Link to="/login" className="text-signal hover:underline">Back to login</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
