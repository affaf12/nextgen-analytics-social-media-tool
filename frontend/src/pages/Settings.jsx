import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'

// FINAL VERSION with Blogger - One-click connect like FB/Threads/LinkedIn
// Koi bhi user aaye, Connect Blogger dabaye, Google login, blog auto-connect!

const GROUPS = [
  {
    label: 'Twitter / X (Manual)',
    fields: [
      { key: 'TWITTER_API_KEY', label: 'API Key (Consumer Key)' },
      { key: 'TWITTER_API_SECRET', label: 'API Secret (Consumer Secret)' },
      { key: 'TWITTER_ACCESS_TOKEN', label: 'Access Token' },
      { key: 'TWITTER_ACCESS_SECRET', label: 'Access Token Secret' },
    ],
  },
  {
    label: 'Medium (Manual)',
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
  const [bloggerCheck, setBloggerCheck] = useState({ connected: false, has_token: false, has_blog: false })
  const [bloggerBlogs, setBloggerBlogs] = useState([])
  const [form, setForm] = usePersistentState('settings.form', {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectingThreads, setConnectingThreads] = useState(false)
  const [connectingLinkedin, setConnectingLinkedin] = useState(false)
  const [connectingBlogger, setConnectingBlogger] = useState(false)
  const [loadingBlogs, setLoadingBlogs] = useState(false)

  const load = async () => {
    try {
      const [keysData, checkData] = await Promise.all([
        api.getSettingsKeys(),
        api.checkSettings().catch(() => ({}))
      ])
      setConnected(keysData)
      setCheck(checkData)
      // Check all statuses
      try {
        const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
        const wsId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'
        const headers = { 'X-Workspace-Id': wsId }
        const [threadsRes, linkedinRes, bloggerRes] = await Promise.all([
          fetch(`${base}/api/auth/threads/status`, { headers }).then(r => r.json()).catch(() => null),
          fetch(`${base}/api/auth/linkedin/status`, { headers }).then(r => r.json()).catch(() => null),
          fetch(`${base}/api/auth/blogger/status`, { headers }).then(r => r.json()).catch(() => null)
        ])
        if (threadsRes) setThreadsCheck(threadsRes)
        if (linkedinRes) setLinkedinCheck(linkedinRes)
        if (bloggerRes) {
          setBloggerCheck(bloggerRes)
          // If connected, load blogs list
          if (bloggerRes.connected || bloggerRes.has_token) {
            loadBloggerBlogs(base, headers)
          }
        }
      } catch {}
    } catch (e) {
      setError(e.message)
    }
  }

  const loadBloggerBlogs = async (base, headers) => {
    setLoadingBlogs(true)
    try {
      const b = base || api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const h = headers || { 'X-Workspace-Id': localStorage.getItem('affaf-crm:workspace-id') || 'default' }
      const res = await fetch(`${b}/api/auth/blogger/blogs`, { headers: h })
      const data = await res.json()
      if (data.items) {
        setBloggerBlogs(data.items)
      }
    } catch (e) {
      console.log('Blogger blogs load error', e)
    } finally {
      setLoadingBlogs(false)
    }
  }

  useEffect(() => { 
    load()
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get('connected')
    
    if (connectedParam === 'facebook' || connectedParam === 'threads' || connectedParam === 'linkedin' || connectedParam === 'blogger') {
      setTimeout(() => load(), 1500)
      window.history.replaceState({}, '', window.location.pathname)
      if (connectedParam === 'blogger') {
        console.log('✅ Blogger connected!')
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
      setError(e.message || 'App not configured')
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
      setError(e.message || 'LinkedIn App not configured')
    } finally {
      setConnectingLinkedin(false)
    }
  }

  const handleBloggerConnect = async () => {
    setConnectingBlogger(true)
    setError('')
    try {
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const workspaceId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'
      const res = await fetch(`${base}/api/auth/blogger`, {
        headers: { 'X-Workspace-Id': workspaceId }
      })
      const data = await res.json()
      if (data.login_url) {
        window.location.href = data.login_url
      } else {
        setError('Blogger Login URL nahi mila - ' + JSON.stringify(data) + '. Google Cloud Console me BLOGGER_CLIENT_ID set karo!')
      }
    } catch (e) {
      setError(e.message || 'Blogger App not configured - Google Cloud Console se Client ID banao')
    } finally {
      setConnectingBlogger(false)
    }
  }

  const handleSelectBlog = async (blog) => {
    try {
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const wsId = localStorage.getItem('affaf-crm:workspace-id') || 'default'
      const res = await fetch(`${base}/api/auth/blogger/select-blog`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Workspace-Id': wsId
        },
        body: JSON.stringify({
          blog_id: blog.id,
          blog_name: blog.name,
          blog_url: blog.url
        })
      })
      const data = await res.json()
      if (data.success) {
        load()
      } else {
        setError('Blog select failed: ' + JSON.stringify(data))
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const isFbAppConfigured = check.facebook_app || check.fb_app_id_set
  const isThreadsConnected = threadsCheck.connected || (threadsCheck.threads_user_id && threadsCheck.threads_token)
  const isLinkedinConnected = linkedinCheck.connected || linkedinCheck.has_token
  const isBloggerConnected = bloggerCheck.connected || (bloggerCheck.has_token && bloggerCheck.has_blog)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
      <h1 className="font-display font-bold text-xl text-offwhite mb-2">Connect Accounts</h1>
      <p className="text-sm text-muted mb-6">Koi bhi user aaye, ek click me connect kare - Facebook, Threads, LinkedIn, Blogger sab auto!</p>
      
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 rounded-lg mb-4">{error}</div>}
      {saved && <div className="bg-signal/10 border border-signal/30 text-signal text-sm p-3 rounded-lg mb-4">Saved ✓ - Keys updated!</div>}

      {/* Facebook Connect */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-sm text-offwhite flex items-center gap-2">
              <span className="w-6 h-6 bg-[#1877F2] rounded flex items-center justify-center text-white text-[11px] font-bold">f</span>
              Facebook + Instagram (Meta)
            </h2>
            <p className="text-[12px] text-muted mt-1">Page + Instagram Business ek saath connect honge</p>
            {isFbAppConfigured ? (
              <div className="mt-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${connected.META_ACCESS_TOKEN ? 'bg-signal' : 'bg-line'}`} />
                <span className="text-[11px] text-muted">{connected.META_ACCESS_TOKEN ? 'Connected ✓' : 'Not connected'}</span>
                {connected.FB_PAGE_ID && <span className="text-[11px] text-muted">• Page: {connected.FB_PAGE_ID.slice(0,8)}...</span>}
                {connected.IG_USER_ID && <span className="text-[11px] text-muted">• IG: Connected</span>}
              </div>
            ) : (
              <div className="text-[11px] text-muted mt-2 p-2 bg-ink rounded-lg border border-line">
                <b className="text-offwhite">Setup:</b> Admin ne FB App ID 583036911532091 set kiya hai
              </div>
            )}
          </div>
          <button
            onClick={handleFacebookConnect}
            disabled={connecting || !isFbAppConfigured}
            className="shrink-0 bg-[#1877F2] text-white font-semibold text-xs rounded-lg px-4 py-2 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {connecting ? 'Connecting...' : connected.META_ACCESS_TOKEN ? 'Reconnect' : 'Connect Facebook'}
          </button>
        </div>
      </div>

      {/* Threads Connect */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-sm text-offwhite flex items-center gap-2">
              <span className="w-6 h-6 bg-black border border-white/20 rounded flex items-center justify-center text-white text-[11px]">@</span>
              Threads
            </h2>
            <p className="text-[12px] text-muted mt-1">Threads.net account connect karo - FB ko touch nahi karega</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isThreadsConnected ? 'bg-signal' : 'bg-line'}`} />
              <span className="text-[11px] text-muted">{isThreadsConnected ? `Connected ✓ ${threadsCheck.threads_user_id_value || ''}` : 'Not connected'}</span>
            </div>
            {!isThreadsConnected && (
              <div className="text-[11px] text-muted mt-2 p-2 bg-ink rounded-lg border border-line">
                <b className="text-offwhite">Setup:</b> Threads App ID 24565240526491181 global set hai. Bas Connect dabao!
              </div>
            )}
          </div>
          <button
            onClick={handleThreadsConnect}
            disabled={connectingThreads}
            className="shrink-0 bg-black border border-white/20 text-white font-semibold text-xs rounded-lg px-4 py-2 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {connectingThreads ? 'Connecting...' : isThreadsConnected ? 'Reconnect' : 'Connect Threads'}
          </button>
        </div>
      </div>

      {/* LinkedIn Connect */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-sm text-offwhite flex items-center gap-2">
              <span className="w-6 h-6 bg-[#0A66C2] rounded flex items-center justify-center text-white text-[11px] font-bold">in</span>
              LinkedIn Profile + Page
            </h2>
            <p className="text-[12px] text-muted mt-1">Profile + Company Page (108833671) dono auto-connect</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`w-2 h-2 rounded-full ${isLinkedinConnected ? 'bg-signal' : 'bg-line'}`} />
              <span className="text-[11px] text-muted">{isLinkedinConnected ? 'Connected ✓' : 'Not connected'}</span>
              {linkedinCheck.profile_name && <span className="text-[11px] text-muted">• {linkedinCheck.profile_name}</span>}
              {linkedinCheck.org_name && <span className="text-[11px] text-muted">• Page: {linkedinCheck.org_name}</span>}
            </div>
            {!isLinkedinConnected && (
              <div className="text-[11px] text-muted mt-2 p-2 bg-ink rounded-lg border border-line">
                <b className="text-offwhite">Setup:</b> Client ID 77hvhp0adef5ho global set hai. Bas Connect dabao!<br/>
                Case CAS-11821533 open hai - Community Management approve hone ke baad Page posting enable hogi.
              </div>
            )}
          </div>
          <button
            onClick={handleLinkedinConnect}
            disabled={connectingLinkedin}
            className="shrink-0 bg-[#0A66C2] text-white font-semibold text-xs rounded-lg px-4 py-2 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {connectingLinkedin ? 'Connecting...' : isLinkedinConnected ? 'Reconnect' : 'Connect LinkedIn'}
          </button>
        </div>
      </div>

      {/* BLOGGER CONNECT - NEW! */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-6 border-orange-500/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="font-display font-semibold text-sm text-offwhite flex items-center gap-2">
              <span className="w-6 h-6 bg-[#FF5722] rounded flex items-center justify-center text-white text-[11px] font-bold">B</span>
              Blogger (Google)
              <span className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">NEW</span>
            </h2>
            <p className="text-[12px] text-muted mt-1">Apna Blogger blog connect karo - ek click me! Koi bhi user connect kar sakta hai</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`w-2 h-2 rounded-full ${isBloggerConnected ? 'bg-signal' : 'bg-line'}`} />
              <span className="text-[11px] text-muted">
                {isBloggerConnected 
                  ? `Connected ✓ ${bloggerCheck.blog_name || bloggerCheck.blog_id || ''}` 
                  : bloggerCheck.has_token ? 'Token hai, Blog select karo' : 'Not connected'}
              </span>
              {bloggerCheck.blog_url && (
                <a href={bloggerCheck.blog_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#FF5722] hover:underline">
                  • {bloggerCheck.blog_url}
                </a>
              )}
            </div>
            {isBloggerConnected ? (
              <div className="mt-3 p-3 bg-ink rounded-lg border border-line">
                <div className="text-[11px] text-offwhite font-semibold mb-2">Connected Blog:</div>
                <div className="text-[12px] text-muted">
                  <div>📝 <b className="text-offwhite">{bloggerCheck.blog_name}</b></div>
                  <div className="text-[11px] mt-1">ID: {bloggerCheck.blog_id}</div>
                  <div className="text-[11px]">URL: <a href={bloggerCheck.blog_url} target="_blank" className="text-[#FF5722] hover:underline">{bloggerCheck.blog_url}</a></div>
                </div>
                {bloggerBlogs.length > 1 && (
                  <div className="mt-3">
                    <div className="text-[11px] text-muted mb-1">Aapke {bloggerBlogs.length} blogs hain - dusra select karo:</div>
                    <div className="space-y-1">
                      {bloggerBlogs.map(blog => (
                        <button
                          key={blog.id}
                          onClick={() => handleSelectBlog(blog)}
                          className={`w-full text-left text-[11px] p-2 rounded border transition ${
                            blog.id === bloggerCheck.blog_id 
                              ? 'bg-signal/10 border-signal/30 text-offwhite' 
                              : 'bg-surface border-line text-muted hover:border-orange-500/30'
                          }`}
                        >
                          {blog.name} - {blog.url} {blog.id === bloggerCheck.blog_id && '✓ Current'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-muted mt-2 p-2 bg-ink rounded-lg border border-line">
                <b className="text-offwhite">Kaise Connect Kare:</b><br/>
                1. Google Cloud Console pe jao: console.cloud.google.com<br/>
                2. Blogger API v3 Enable karo<br/>
                3. OAuth Client ID banao - Redirect URI add karo:<br/>
                <code className="text-[9px] break-all bg-black/30 p-1 rounded block mt-1">https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/blogger/callback</code>
                4. Client ID/Secret ko Settings me save karo ya /api/auth/blogger/setup pe POST karo<br/>
                5. Phir "Connect Blogger" dabao - Google login → Blog auto-select!
              </div>
            )}
          </div>
          <button
            onClick={handleBloggerConnect}
            disabled={connectingBlogger}
            className="shrink-0 bg-[#FF5722] text-white font-semibold text-xs rounded-lg px-4 py-2 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-glow"
          >
            {connectingBlogger ? 'Connecting...' : isBloggerConnected ? 'Reconnect' : 'Connect Blogger'}
          </button>
        </div>
      </div>

      {/* Auto-filled fields */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-display font-semibold text-sm text-offwhite mb-3">Meta + LinkedIn + Blogger - Auto fill after Connect</h2>
        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="text-muted">Meta Access Token</div>
            <div className="col-span-2 flex justify-end"><span className={connected.META_ACCESS_TOKEN ? 'text-signal' : 'text-muted'}>{connected.META_ACCESS_TOKEN ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">Facebook Page ID</div>
            <div className="col-span-2 flex justify-end"><span className={connected.FB_PAGE_ID ? 'text-signal' : 'text-muted'}>{connected.FB_PAGE_ID ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">Instagram User ID</div>
            <div className="col-span-2 flex justify-end"><span className={connected.IG_USER_ID ? 'text-signal' : 'text-muted'}>{connected.IG_USER_ID ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">Threads User ID</div>
            <div className="col-span-2 flex justify-end"><span className={connected.THREADS_USER_ID ? 'text-signal' : 'text-muted'}>{connected.THREADS_USER_ID ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">LinkedIn Access Token</div>
            <div className="col-span-2 flex justify-end"><span className={connected.LINKEDIN_ACCESS_TOKEN ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_ACCESS_TOKEN ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">LinkedIn Person ID</div>
            <div className="col-span-2 flex justify-end"><span className={connected.LINKEDIN_PERSON_ID ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_PERSON_ID ? `• ${String(connected.LINKEDIN_PERSON_ID).slice(0,10)}...` : 'Not set'}</span></div>
            <div className="text-muted">LinkedIn Org ID</div>
            <div className="col-span-2 flex justify-end"><span className={connected.LINKEDIN_ORG_ID ? 'text-signal' : 'text-muted'}>{connected.LINKEDIN_ORG_ID ? `• ${connected.LINKEDIN_ORG_NAME || connected.LINKEDIN_ORG_ID}` : 'Not set'}</span></div>
            <div className="text-muted">Blogger Access Token</div>
            <div className="col-span-2 flex justify-end"><span className={connected.BLOGGER_ACCESS_TOKEN ? 'text-signal' : 'text-muted'}>{connected.BLOGGER_ACCESS_TOKEN ? '• Connected' : 'Not set'}</span></div>
            <div className="text-muted">Blogger Blog ID</div>
            <div className="col-span-2 flex justify-end"><span className={connected.BLOGGER_BLOG_ID ? 'text-signal' : 'text-muted'}>{connected.BLOGGER_BLOG_ID ? `• ${connected.BLOGGER_BLOG_NAME || connected.BLOGGER_BLOG_ID}` : 'Not set'}</span></div>
            <div className="text-muted">Blogger Blog URL</div>
            <div className="col-span-2 flex justify-end"><span className={connected.BLOGGER_BLOG_URL ? 'text-signal' : 'text-muted'}>{connected.BLOGGER_BLOG_URL ? `• ${String(connected.BLOGGER_BLOG_URL).slice(0,25)}...` : 'Not set'}</span></div>
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

      {/* Google OAuth Setup Helper */}
      <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-xl p-5 mt-6">
        <h2 className="font-display font-semibold text-sm text-offwhite mb-2 flex items-center gap-2">
          🔧 Blogger Setup - Admin ke liye (Ek baar karna hai)
        </h2>
        <div className="text-[11px] text-muted space-y-2">
          <div><b className="text-offwhite">Step 1:</b> https://console.cloud.google.com/ → New Project "NextGen Analytics"</div>
          <div><b className="text-offwhite">Step 2:</b> APIs & Services → Library → "Blogger API v3" → Enable</div>
          <div><b className="text-offwhite">Step 3:</b> Credentials → Create Credentials → OAuth Client ID → Web Application</div>
          <div><b className="text-offwhite">Step 4:</b> Authorized Redirect URIs me add karo:</div>
          <code className="block bg-black/40 p-2 rounded text-[9px] break-all mt-1">
            https://nextgen-analytics-social-media-tool.fastapicloud.dev/api/auth/blogger/callback<br/>
            http://localhost:8000/api/auth/blogger/callback
          </code>
          <div><b className="text-offwhite">Step 5:</b> Client ID aur Secret copy karo aur neeche paste karke Save karo, ya API call karo:</div>
          <code className="block bg-black/40 p-2 rounded text-[9px] break-all">
            POST /api/auth/blogger/setup<br/>
            {'{'} "client_id": "YOUR_ID.apps.googleusercontent.com", "client_secret": "GOCSPX-..." {'}'}
          </code>
          <div className="text-[10px] text-orange-300 mt-2">⚡ Ek baar credentials save karne ke baad, koi bhi user bina Client ID ke Connect Blogger kar sakta hai!</div>
        </div>
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
