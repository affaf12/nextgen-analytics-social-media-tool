import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'

// FINAL VERSION with LinkedIn Profile + Page - Auto fill after Connect
// Meta (FB+IG+Threads) and LinkedIn dono ke liye one-click connect

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
  const [linkedinCheck, setLinkedinCheck] = useState({ connected: false, profile_connected: false, page_connected: false })
  const [form, setForm] = usePersistentState('settings.form', {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectingThreads, setConnectingThreads] = useState(false)
  const [connectingLinkedin, setConnectingLinkedin] = useState(false)

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
        const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
        const wsId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'
        const headers = { 'X-Workspace-Id': wsId }
        const [threadsRes, linkedinRes] = await Promise.all([
          fetch(`${base}/api/auth/threads/status`, { headers }).then(r => r.json()).catch(() => null),
          fetch(`${base}/api/auth/linkedin/status`, { headers }).then(r => r.json()).catch(() => null)
        ])
        if (threadsRes) setThreadsCheck(threadsRes)
        if (linkedinRes) setLinkedinCheck(linkedinRes)
      } catch {}
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { 
    load()
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get('connected')
    
    if (connectedParam === 'facebook' || connectedParam === 'threads' || connectedParam === 'linkedin') {
      setTimeout(() => load(), 1500)
      window.history.replaceState({}, '', window.location.pathname)
      if (connectedParam === 'threads') {
        console.log('✅ Threads connected!')
      }
      if (connectedParam === 'linkedin') {
        console.log('✅ LinkedIn connected!')
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
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const workspaceId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'
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

  const handleLinkedinConnect = async () => {
    setConnectingLinkedin(true)
    setError('')
    try {
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const workspaceId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'
      const res = await fetch(`${base}/api/auth/linkedin`, {
        headers: { 'X-Workspace-Id': workspaceId }
      })
      const data = await res.json()
      if (data.login_url) {
        window.location.href = data.login_url
      } else {
        setError('LinkedIn Login URL nahi mila - ' + JSON.stringify(data))
      }
    } catch (e) {
      setError(e.message || 'LinkedIn App not configured - Admin ne Client ID/Secret set nahi kiya')
    } finally {
      setConnectingLinkedin(false)
    }
  }

  const isFbAppConfigured = check.facebook_app || check.fb_app_id_set
  const isThreadsConnected = threadsCheck.connected || (connected.THREADS_USER_ID && connected.THREADS_ACCESS_TOKEN)
  const isFbConnected = connected.META_ACCESS_TOKEN && connected.FB_PAGE_ID
  const isLinkedinConnected = linkedinCheck.connected || linkedinCheck.has_token || connected.LINKEDIN_ACCESS_TOKEN
  const isLinkedinProfileConnected = linkedinCheck.profile_connected || linkedinCheck.has_person
  const isLinkedinPageConnected = linkedinCheck.page_connected || linkedinCheck.has_org

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
        
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Owner ek baar App ID/Secret backend me set karega. Uske baad har user sirf Connect button dabayega.
          </p>
          
          <button
            id="fb-connect-btn"
            name="fb-connect-btn"
            onClick={handleFacebookConnect}
            disabled={connecting || !isFbAppConfigured}
            className="bg-[#1877F2] text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            <span>📘</span>
            {connecting ? 'Redirecting to Facebook...' : isFbConnected ? '✓ Connected - Re-connect Facebook' : 'Connect with Facebook / Instagram'}
          </button>

          <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-2">
            <div className="flex justify-between"><span className="text-muted">Meta Token</span><span className={connected.META_ACCESS_TOKEN ? 'text-signal' : 'text-muted'}>{connected.META_ACCESS_TOKEN ? '✓' : '✗'}</span></div>
            <div className="flex justify-between"><span className="text-muted">FB Page</span><span className={connected.FB_PAGE_ID ? 'text-signal' : 'text-muted'}>{connected.FB_PAGE_ID ? '✓' : '✗'}</span></div>
            <div className="flex justify-between"><span className="text-muted">Instagram</span><span className={connected.IG_USER_ID ? 'text-signal' : 'text-muted'}>{connected.IG_USER_ID ? '✓' : '✗'}</span></div>
          </div>
        </div>
      </div>

      {/* Threads Connect */}
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
        </div>
      </div>

      {/* LinkedIn Connect - NEW */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-20 h-20 bg-[#0A66C2]/10 rounded-full blur-xl"></div>
        <h2 className="font-display font-semibold text-sm text-offwhite mb-3 flex items-center gap-2">
          <span className="text-lg">💼</span> LinkedIn - Profile + Page
          <span className={`w-2 h-2 rounded-full ${isLinkedinConnected ? 'bg-signal' : 'bg-line'}`}></span>
          <span className="text-xs font-mono text-muted">{isLinkedinConnected ? 'Connected' : 'Not Connected'}</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[#0A66C2]/20 text-[#0A66C2] border border-[#0A66C2]/30">NEW</span>
        </h2>
        
        <div className="space-y-3">
          <p className="text-xs text-muted">
            LinkedIn <b className="text-offwhite">Profile + Company Page</b> pe post karne ke liye connect karo. Dusra user aaye to bina API key copy kiye seedha connect ho jayega.
          </p>
          <p className="text-[11px] text-muted/70">
            Profile: w_member_social | Page: w_organization_social (auto)
          </p>
          
          <button
            id="linkedin-connect-btn"
            name="linkedin-connect-btn"
            onClick={handleLinkedinConnect}
            disabled={connectingLinkedin}
            className={`${isLinkedinConnected ? 'bg-[#0A66C2]/10 border border-[#0A66C2]/30 text-[#0A66C2]' : 'bg-[#0A66C2] text-white'} text-sm font-semibold rounded-lg px-5 py-2.5 hover:brightness-110 disabled:opacity-40 transition flex items-center gap-2 w-full sm:w-auto justify-center`}
          >
            <span className="text-lg">💼</span>
            {connectingLinkedin ? 'Redirecting to LinkedIn...' : isLinkedinConnected ? '✓ Connected - Re-connect LinkedIn' : 'Connect with LinkedIn'}
          </button>

          <div className="grid grid-cols-3 gap-2 text-xs font-mono mt-2">
            <div className="flex justify-between"><span className="text-muted">Profile</span><span className={isLinkedinProfileConnected || connected.LINKEDIN_PERSON_ID ? 'text-signal' : 'text-muted'}>{isLinkedinProfileConnected || connected.LINKEDIN_PERSON_ID ? '✓' : '✗'}</span></div>
            <div className="flex justify-between"><span className="text-muted">Page</span><span className={isLinkedinPageConnected || connected.LINKEDIN_ORG_ID ? 'text-signal' : 'text-muted'}>{isLinkedinPageConnected || connected.LINKEDIN_ORG_ID ? '✓' : '✗'}</span></div>
            <div className="flex justify-between"><span className="text-muted">Token</span><span className={connected.LINKEDIN_ACCESS_TOKEN || linkedinCheck.has_token ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_ACCESS_TOKEN || linkedinCheck.has_token ? '✓' : '✗'}</span></div>
          </div>
          
          {isLinkedinConnected ? (
            <div className="text-xs text-signal mt-2 p-2 bg-signal/10 rounded-lg border border-signal/20">
              ✓ LinkedIn Connected! Ab Publish page pe LinkedIn Profile + Page select karke post kar sakte ho. Dusra user bina API key ke connect ho jayega.
              {linkedinCheck.org_name && <><br/>Page: {linkedinCheck.org_name}</>}
              {linkedinCheck.profile_name && <><br/>Profile: {linkedinCheck.profile_name}</>}
            </div>
          ) : (
            <div className="text-[11px] text-muted mt-2 p-2 bg-ink rounded-lg border border-line">
              <b className="text-offwhite">Setup:</b> Admin ne Client ID 77hvhp0adef5ho set kiya hai. Redirect URL add karo:<br/>
              <code className="text-[10px] break-all">https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/linkedin/callback</code><br/>
              Scopes: r_liteprofile, r_emailaddress, w_member_social, w_organization_social
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

      {/* LinkedIn Auto fill - NEW */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display font-semibold text-sm text-offwhite mb-3 flex items-center gap-2">
          <span>💼</span> LinkedIn (Profile + Page) - Auto fill after Connect
        </h2>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="text-muted">LinkedIn Access Token (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.LINKEDIN_ACCESS_TOKEN ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_ACCESS_TOKEN ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">LinkedIn Person ID (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.LINKEDIN_PERSON_ID ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_PERSON_ID ? `• ${String(connected.LINKEDIN_PERSON_ID).slice(0,10)}...` : 'Not set'}</span></div>
            <div className="text-muted">LinkedIn Person URN (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.LINKEDIN_PERSON_URN ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_PERSON_URN ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">LinkedIn Org ID / Page (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.LINKEDIN_ORG_ID ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_ORG_ID ? `• ${connected.LINKEDIN_ORG_NAME || connected.LINKEDIN_ORG_ID}` : 'Not set'}</span></div>
            <div className="text-muted">LinkedIn Org URN (auto)</div>
            <div className="col-span-2 flex justify-end"><span className={connected.LINKEDIN_ORG_URN ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_ORG_URN ? '• Connected' : 'Not set'}</span></div>
          </div>
        </div>
        {!isLinkedinConnected && (
          <div className="mt-3 text-[11px] text-muted bg-ink p-2 rounded border border-line">
            LinkedIn connect karne ke liye upar <b className="text-offwhite">Connect with LinkedIn</b> button dabao. Profile + Page dono auto fill ho jayenge. Dusra user bina API key ke connect ho jayega kyunki Client ID <code>77hvhp0adef5ho</code> global set hai.
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
