import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'

// SECURE VERSION: FB_APP_ID / SECRET frontend pe show nahi honge
// Owner sirf backend env me set karega: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
const GROUPS = [
  {
    label: 'Meta (Facebook + Instagram) - Auto fill after Connect',
    fields: [
      { key: 'META_ACCESS_TOKEN', label: 'Meta Access Token (auto)' },
      { key: 'FB_PAGE_ID', label: 'Facebook Page ID (auto)' },
      { key: 'IG_USER_ID', label: 'Instagram Business User ID (auto)' },
    ],
  },
  {
    label: 'Threads',
    fields: [
      { key: 'THREADS_USER_ID', label: 'Threads User ID' },
      { key: 'THREADS_ACCESS_TOKEN', label: 'Threads Access Token (optional)' },
    ],
  },
  {
    label: 'Twitter / X',
    fields: [
      { key: 'TWITTER_API_KEY', label: 'API Key (Consumer Key)' },
      { key: 'TWITTER_API_SECRET', label: 'API Secret (Consumer Secret)' },
      { key: 'TWITTER_ACCESS_TOKEN', label: 'Access Token' },
      { key: 'TWITTER_ACCESS_SECRET', label: 'Access Token Secret' },
    ],
  },
  {
    label: 'LinkedIn',
    fields: [
      { key: 'LINKEDIN_ACCESS_TOKEN', label: 'Access Token' },
      { key: 'LINKEDIN_ORG_ID', label: 'Company Page Org ID (optional)' },
    ],
  },
  {
    label: 'Blogger',
    fields: [
      { key: 'BLOGGER_BLOG_ID', label: 'Blog ID' },
      { key: 'BLOGGER_ACCESS_TOKEN', label: 'Google OAuth Access Token' },
    ],
  },
  {
    label: 'Medium',
    fields: [
      { key: 'MEDIUM_ACCESS_TOKEN', label: 'Integration Token' },
    ],
  },
]

export default function Settings() {
  const [connected, setConnected] = useState({})
  const [check, setCheck] = useState({})
  const [form, setForm] = usePersistentState('settings.form', {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)

  const load = async () => {
    try {
      const [keysData, checkData] = await Promise.all([
        api.getSettingsKeys(),
        api.checkSettings().catch(() => ({}))
      ])
      setConnected(keysData)
      setCheck(checkData)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { 
    load()
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'facebook') {
      setTimeout(() => load(), 1000)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleChange = (key, value) => {
    setForm((prev) => ({...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    const filled = Object.fromEntries(Object.entries(form).filter(([, v]) => (v || '').trim()!== ''))
    if (Object.keys(filled).length === 0) return
    setSaving(true)
    setError('')
    try {
      await api.saveSettingsKeys(filled)
      setForm({})
      setSaved(true)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleFacebookConnect = async () => {
    setConnecting(true)
    setError('')
    try {
      const res = await api.getFacebookLoginUrl()
      if (res.login_url) {
        window.location.href = res.login_url
      } else {
        setError('Login URL nahi mila - Admin se contact karo')
      }
    } catch (e) {
      setError(e.message || 'App not configured - Admin se contact karo')
    } finally {
      setConnecting(false)
    }
  }

  const isFbAppConfigured = check.facebook_app || check.fb_app_id_set

  return (
    <div>
      <header className="mb-8">
        <div className="font-mono text- text-signal mb-1">05 · CHANNELS</div>
        <h1 className="font-display font-bold text-2xl text-offwhite">API keys & connections</h1>
        <p className="text-muted text-sm mt-1">
          Ek baar Connect karo, hamesha connected rahega. App Secret kabhi frontend pe show nahi hota.
        </p>
      </header>

      {error && <div className="text-coral text-sm font-mono mb-4 bg-coral/10 border border-coral/20 p-3 rounded">{error}</div>}

      {/* Secure Facebook Connect - No App ID/Secret shown to users */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display font-semibold text-sm text-offwhite mb-3 flex items-center gap-2">
          Facebook & Instagram
          <span className={`w-2 h-2 rounded-full ${isFbAppConfigured ? 'bg-signal' : 'bg-coral'}`}></span>
          <span className="text-xs font-mono text-muted">{isFbAppConfigured ? 'Ready' : 'Setup needed by Admin'}</span>
        </h2>
        
        {!isFbAppConfigured ? (
          <div className="bg-ink border border-line rounded-lg p-3">
            <p className="text-xs text-coral">⚠️ Facebook App Admin ne abhi configure nahi kiya. Backend env me FACEBOOK_APP_ID set karna hai.</p>
            <p className="text-xs text-muted mt-1">Ye sirf owner ka kaam hai, users ko App ID/Secret dikhega hi nahi.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Har user sirf ye button dabayega. App ID public hai, App Secret sirf backend me safe hai - kabhi frontend pe nahi ayega.
            </p>
            <button
              id="fb-connect-btn"
              name="fb-connect-btn"
              onClick={handleFacebookConnect}
              disabled={connecting}
              className="bg-[#1877F2] text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:brightness-110 disabled:opacity-40 transition"
            >
              {connecting ? 'Redirecting...' : 'Connect with Facebook / Instagram'}
            </button>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-2">
              <div className="flex justify-between"><span className="text-muted">Meta Token</span><span className={connected.META_ACCESS_TOKEN ? 'text-signal' : 'text-muted'}>{connected.META_ACCESS_TOKEN ? '✓' : '✗'}</span></div>
              <div className="flex justify-between"><span className="text-muted">FB Page</span><span className={connected.FB_PAGE_ID ? 'text-signal' : 'text-muted'}>{connected.FB_PAGE_ID ? '✓' : '✗'}</span></div>
              <div className="flex justify-between"><span className="text-muted">Instagram</span><span className={connected.IG_USER_ID ? 'text-signal' : 'text-muted'}>{connected.IG_USER_ID ? '✓' : '✗'}</span></div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group.label} className="bg-surface border border-line rounded-xl p-5">
            <h2 className="font-display font-semibold text-sm text-offwhite mb-3">{group.label}</h2>
            <div className="space-y-3">
              {group.fields.map((f) => (
                <div key={f.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor={f.key} className="text-xs text-muted">{f.label}</label>
                    <span className={`flex items-center gap-1.5 text- font-mono ${connected[f.key]? 'text-signal' : 'text-muted'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${connected[f.key]? 'bg-signal pulse' : 'bg-line'}`} />
                      {connected[f.key]? 'Connected' : 'Not set'}
                    </span>
                  </div>
                  <input
                    id={f.key}
                    name={f.key}
                    type="password"
                    autoComplete="off"
                    value={form[f.key]?? ''}
                    onChange={(e) => handleChange(f.key, e.target.value)}
                    placeholder={f.key.includes('TOKEN') ? 'Auto-filled after Connect' : 'Enter key'}
                    className="w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/50 outline-none focus:border-signal font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-6 mt-6">
        <button
          id="save-keys-btn"
          name="save-keys-btn"
          onClick={handleSave}
          disabled={saving || Object.values(form).every((v) =>!v?.trim())}
          className="w-full bg-signal text-ink font-semibold text-sm rounded-lg py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-glow"
        >
          {saving? 'Saving…' : saved? 'Saved ✓' : 'Save keys'}
        </button>
      </div>
    </div>
  )
}
