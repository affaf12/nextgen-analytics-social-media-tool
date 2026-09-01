import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'

// SECURE VERSION: FB_APP_ID / SECRET frontend pe show nahi honge
// Owner sirf backend env me set karega: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
// THREADS: Alag se Connect button - Facebook/Instagram ko touch nahi karega

const GROUPS = [
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
  const [threadsCheck, setThreadsCheck] = useState({ connected: false })
  const [form, setForm] = usePersistentState('settings.form', {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectingThreads, setConnectingThreads] = useState(false)

  const load = async () => {
    try {
      const [keysData, checkData] = await Promise.all([
        api.getSettingsKeys(),
        api.checkSettings().catch(() => ({}))
      ])
      setConnected(keysData)
      setCheck(checkData)
      // Also check threads status
      try {
        const threadsRes = await fetch(`${api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'}/api/auth/threads/status`, {
          headers: { 'X-Workspace-Id': localStorage.getItem('workspaceId') || 'default' }
        }).then(r => r.json()).catch(() => null)
        if (threadsRes) setThreadsCheck(threadsRes)
      } catch {}
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { 
    load()
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get('connected')
    
    if (connectedParam === 'facebook' || connectedParam === 'threads') {
      setTimeout(() => load(), 1500)
      window.history.replaceState({}, '', window.location.pathname)
      if (connectedParam === 'threads') {
        // Optional toast
        console.log('✅ Threads connected!')
      }
    }
    if (params.get('connected')?.includes('error')) {
      setError(`Connection failed: ${params.get('message') || params.get('error')}`)
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

  const handleThreadsConnect = async () => {
    setConnectingThreads(true)
    setError('')
    try {
      // Direct fetch because api.js may not have threads method yet
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const workspaceId = localStorage.getItem('workspaceId') || 'default'
      const res = await fetch(`${base}/api/auth/threads`, {
        headers: { 'X-Workspace-Id': workspaceId }
      })
      const data = await res.json()
      if (data.login_url) {
        window.location.href = data.login_url
      } else {
        setError('Threads Login URL nahi mila - ' + JSON.stringify(data))
      }
    } catch (e) {
      setError(e.message || 'Threads App not configured')
    } finally {
      setConnectingThreads(false)
    }
  }

  const isFbAppConfigured = check.facebook_app || check.fb_app_id_set
  const isThreadsConnected = threadsCheck.connected || (connected.THREADS_USER_ID && connected.THREADS_ACCESS_TOKEN)
  const isFbConnected = connected.META_ACCESS_TOKEN && connected.FB_PAGE_ID

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

      {/* Secure Facebook & Instagram Connect */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display font-semibold text-sm text-offwhite mb-3 flex items-center gap-2">
          Facebook & Instagram
          <span className={`w-2 h-2 rounded-full ${isFbAppConfigured ? 'bg-signal' : 'bg-coral'}`}></span>
          <span className="text-xs font-mono text-muted">{isFbAppConfigured ? 'Ready' : 'Setup needed by Admin'}</span>
        </h2>
        
        {!isFbAppConfigured ? (
          <div className="bg-ink border border-line rounded-lg p-3">
            <p className="text-xs text-coral">⚠ Facebook App Admin ne abhi configure nahi kiya. Backend env me FACEBOOK_APP_ID set karna hai.</p>
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
              className="bg-[#1877F2] text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:brightness-110 disabled:opacity-40 transition flex items-center gap-2"
            >
              <span className="text-lg">📘</span>
              {connecting ? 'Redirecting...' : 'Connect with Facebook / Instagram'}
            </button>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-2">
              <div className="flex justify-between"><span className="text-muted">Meta Token</span><span className={connected.META_ACCESS_TOKEN ? 'text-signal' : 'text-muted'}>{connected.META_ACCESS_TOKEN ? '✓' : '✗'}</span></div>
              <div className="flex justify-between"><span className="text-muted">FB Page</span><span className={connected.FB_PAGE_ID ? 'text-signal' : 'text-muted'}>{connected.FB_PAGE_ID ? '✓' : '✗'}</span></div>
              <div className="flex justify-between"><span className="text-muted">Instagram</span><span className={connected.IG_USER_ID ? 'text-signal' : 'text-muted'}>{connected.IG_USER_ID ? '✓' : '✗'}</span></div>
            </div>
            {isFbConnected && (
              <div className="text-xs text-signal mt-2">✓ Facebook Page + Instagram Connected - Post ja rahi hai</div>
            )}
          </div>
        )}
      </div>

      {/* NEW: Threads Connect - Alag se, FB/IG ko touch nahi karega */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full blur-xl"></div>
        <h2 className="font-display font-semibold text-sm text-offwhite mb-3 flex items-center gap-2">
          <span className="text-lg">🧵</span> Threads
          <span className={`w-2 h-2 rounded-full ${isThreadsConnected ? 'bg-signal' : 'bg-line'}`}></span>
          <span className="text-xs font-mono text-muted">{isThreadsConnected ? 'Connected' : 'Not Connected'}</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white">NEW</span>
        </h2>
        
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Threads pe <b className="text-offwhite">video aur image</b> post karne ke liye alag se connect karo. Ye Facebook/Instagram ko touch nahi karega.
          </p>
          <p className="text-[11px] text-muted/70">
            Video: MP4, MOV, WEBM (max 3 min) | Image: JPG, PNG | Caption max 500 chars
          </p>
          
          <button
            id="threads-connect-btn"
            name="threads-connect-btn"
            onClick={handleThreadsConnect}
            disabled={connectingThreads}
            className={`${isThreadsConnected ? 'bg-white/10 border border-white/20 text-white' : 'bg-white text-black'} text-sm font-semibold rounded-lg px-5 py-2.5 hover:brightness-110 disabled:opacity-40 transition flex items-center gap-2 w-full sm:w-auto justify-center`}
          >
            <span className="text-lg">🧵</span>
            {connectingThreads ? 'Redirecting to threads.net...' : isThreadsConnected ? '✓ Connected - Re-connect Threads' : 'Connect with Threads'}
          </button>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-2">
            <div className="flex justify-between"><span className="text-muted">Threads User ID</span><span className={connected.THREADS_USER_ID ? 'text-signal' : 'text-muted'}>{connected.THREADS_USER_ID ? '✓' : '✗'}</span></div>
            <div className="flex justify-between"><span className="text-muted">Threads Token</span><span className={connected.THREADS_ACCESS_TOKEN || threadsCheck.connected ? 'text-signal' : 'text-muted'}>{connected.THREADS_ACCESS_TOKEN || threadsCheck.connected ? '✓' : '✗'}</span></div>
          </div>
          
          {isThreadsConnected ? (
            <div className="text-xs text-signal mt-2 p-2 bg-signal/10 rounded-lg border border-signal/20">
              ✓ Threads Connected! Ab Publish page pe Threads select karke video/image post kar sakte ho.
            </div>
          ) : (
            <div className="text-[11px] text-muted mt-2 p-2 bg-ink rounded-lg border border-line">
              <b className="text-offwhite">Note:</b> Meta Dashboard me Threads product enable karna zaroori hai aur Redirect URI add karni hai:<br/>
              <code className="text-[10px] break-all">https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/threads/callback</code>
            </div>
          )}
        </div>
      </div>

      {/* Auto-filled fields - Readonly info */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display font-semibold text-sm text-offwhite mb-3">Meta (Facebook + Instagram + Threads) - Auto fill after Connect</h2>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="text-muted">Meta Access Token (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.META_ACCESS_TOKEN ? 'text-signal' : 'text-muted'}>{connected.META_ACCESS_TOKEN ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">Facebook Page ID (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.FB_PAGE_ID ? 'text-signal' : 'text-muted'}>{connected.FB_PAGE_ID ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">Instagram Business User ID (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.IG_USER_ID ? 'text-signal' : 'text-muted'}>{connected.IG_USER_ID ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">Threads User ID (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.THREADS_USER_ID ? 'text-signal' : 'text-muted'}>{connected.THREADS_USER_ID ? '• Connected' : 'Not set'}</span></div>
          </div>
        </div>
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
