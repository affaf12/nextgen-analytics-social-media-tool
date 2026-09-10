import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'
import { startOpenRouterConnect, consumePendingOpenRouterCode } from '../lib/openrouterOAuth.js'

// ===================== GROUPS FROM FILE 2 - MANUAL KEYS =====================
const GROUPS = [
  {
    label: 'AI Content Generation (OpenRouter — free)',
    id: 'ai',
    fields: [
      { key: 'OPENROUTER_MODEL', label: 'Model override (optional — khaali chodo, free model khud try hoga)', type: 'text' },
    ],
  },
  {
    label: 'Meta (Facebook + Instagram)',
    fields: [
      { key: 'META_ACCESS_TOKEN', label: 'Meta Access Token' },
      { key: 'FB_PAGE_ID', label: 'Facebook Page ID' },
      { key: 'IG_USER_ID', label: 'Instagram Business User ID' },
    ],
  },
  {
    label: 'Threads',
    fields: [
      { key: 'THREADS_USER_ID', label: 'Threads User ID' },
      { key: 'THREADS_ACCESS_TOKEN', label: 'Threads Access Token (optional, defaults to Meta token)' },
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
      { key: 'LINKEDIN_ORG_URN', label: 'Company Page Org URN (optional, urn:li:organization:...)' },
      { key: 'LINKEDIN_PERSON_URN', label: 'Person URN (optional, auto-fetched otherwise)' },
    ],
  },
  {
    label: 'Blogger',
    fields: [
      { key: 'BLOGGER_BLOG_ID', label: 'Blog ID' },
      { key: 'BLOGGER_ACCESS_TOKEN', label: 'Google OAuth Access Token (blogger scope)' },
      { key: 'BLOGGER_REFRESH_TOKEN', label: 'Refresh Token (optional — token auto-refresh ke liye)' },
      { key: 'BLOGGER_CLIENT_ID', label: 'OAuth Client ID (refresh ke liye zaroori)' },
      { key: 'BLOGGER_CLIENT_SECRET', label: 'OAuth Client Secret (refresh ke liye zaroori)' },
    ],
  },
  {
    label: 'Medium',
    fields: [
      { key: 'MEDIUM_ACCESS_TOKEN', label: 'Integration Token' },
    ],
  },
  {
    label: 'Substack (UNOFFICIAL — Substack ka koi official posting API nahi hai)',
    id: 'substack',
    fields: [
      { key: 'SUBSTACK_PUBLICATION_URL', label: 'Publication URL (jaise yourname.substack.com)' },
      { key: 'SUBSTACK_EMAIL', label: 'Substack login email (auto cookie-refresh ke liye)' },
      { key: 'SUBSTACK_PASSWORD', label: 'Substack login password (auto cookie-refresh ke liye)' },
      { key: 'SUBSTACK_COOKIE', label: 'Session Cookie (substack.sid) — manual bhi daal sakte ho, ya neeche "Refresh" button use karo' },
    ],
  },
  {
    label: 'Media hosting',
    fields: [
      { key: 'PUBLIC_BASE_URL', label: 'Public Base URL (optional — khaali chorne par khud free public hosting use hogi)' },
    ],
  },
]

export default function Settings() {
  // ===================== STATES FROM FILE 1 - OAUTH CONNECT =====================
  const [connected, setConnected] = useState({})
  const [threadsCheck, setThreadsCheck] = useState({ connected: false })
  const [linkedinCheck, setLinkedinCheck] = useState({ connected: false })
  const [bloggerCheck, setBloggerCheck] = useState({ connected: false, has_token: false, has_blog: false })
  const [tiktokCheck, setTiktokCheck] = useState({ connected: false, has_token: false })
  const [substackCheck, setSubstackCheck] = useState({ connected: false, has_sid: false, publication_url: '' })
  const [youtubeCheck, setYoutubeCheck] = useState({ connected: false, has_token: false, channel_title: '' })
  const [gbCheck, setGbCheck] = useState({ connected: false, has_token: false, location_name: '' })
  const [bloggerBlogs, setBloggerBlogs] = useState([])
  const [gbLocations, setGbLocations] = useState([])
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [connecting, setConnecting] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingBlogs, setLoadingBlogs] = useState(false)
  const [loadingGb, setLoadingGb] = useState(false)

  const [showSubstackModal, setShowSubstackModal] = useState(false)
  const [subPubUrl, setSubPubUrl] = useState('')
  const [subSid, setSubSid] = useState('')
  const [subEmail, setSubEmail] = useState('')

  // ===================== STATES FROM FILE 2 - MANUAL KEYS =====================
  const [form, setForm] = usePersistentState('settings.form', {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [substackRefreshing, setSubstackRefreshing] = useState(false)
  const [substackRefreshMsg, setSubstackRefreshMsg] = useState('')
  const [aiConnecting, setAiConnecting] = useState(false)
  const [aiMsg, setAiMsg] = useState('')

  // ===================== LOAD FUNCTIONS FROM FILE 1 =====================
  const load = async () => {
    setLoading(true)
    try {
      const keysData = await api.getSettingsKeys().catch(() => ({}))
      setConnected(keysData)

      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const wsId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'
      const headers = { 'X-Workspace-Id': wsId }

      const [threadsRes, linkedinRes, bloggerRes, tiktokRes, substackRes, youtubeRes, gbRes] = await Promise.all([
        fetch(`${base}/api/auth/threads/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/linkedin/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/blogger/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/tiktok/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/substack/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/youtube/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/google-business/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false }))
      ])

      if (threadsRes) setThreadsCheck(threadsRes)
      if (linkedinRes) setLinkedinCheck(linkedinRes)
      if (bloggerRes) {
        setBloggerCheck(bloggerRes)
        if (bloggerRes.connected || bloggerRes.has_token) {
          loadBloggerBlogs(base, headers)
        }
      }
      if (tiktokRes) setTiktokCheck(tiktokRes)
      if (substackRes) {
        setSubstackCheck(substackRes)
        if (substackRes.publication_url) {
          setSubPubUrl(substackRes.publication_url)
        }
      }
      if (youtubeRes) setYoutubeCheck(youtubeRes)
      if (gbRes) {
        setGbCheck(gbRes)
        if (gbRes.connected || gbRes.has_token) {
          loadGbLocations(base, headers)
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
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

  const loadGbLocations = async (base, headers) => {
    setLoadingGb(true)
    try {
      const b = base || api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const h = headers || { 'X-Workspace-Id': localStorage.getItem('affaf-crm:workspace-id') || 'default' }
      const res = await fetch(`${b}/api/auth/google-business/locations`, { headers: h })
      const data = await res.json()
      if (data.locations) {
        setGbLocations(data.locations)
      }
    } catch (e) {
      console.log('GB locations load error', e)
    } finally {
      setLoadingGb(false)
    }
  }

  // ===================== USE EFFECT - COMBINED FROM BOTH FILES =====================
  useEffect(() => {
    load()
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get('connected')
    const errorParam = params.get('error')
    const messageParam = params.get('message')

    if (connectedParam) {
      if (['facebook', 'threads', 'linkedin', 'blogger', 'tiktok', 'substack', 'youtube', 'google_business', 'google-business'].includes(connectedParam)) {
        setSuccessMsg(`${connectedParam} Successfully Connected`)
        setTimeout(() => load(), 1200)
      }
      window.history.replaceState({}, '', window.location.pathname)
    }

    if (errorParam || messageParam) {
      setError(`Connection failed: ${messageParam || errorParam || 'Unknown error'}`)
      window.history.replaceState({}, '', window.location.pathname)
    }

    // From File 2 - OpenRouter pending code logic
    const pending = consumePendingOpenRouterCode()
    if (pending) {
      setAiConnecting(true)
      setAiMsg('OpenRouter se connect ho raha hai…')
      api.exchangeOpenRouterCode(pending.code, pending.verifier)
       .then(() => {
          setAiMsg('OpenRouter connected ✓ — ab Generator live AI use karega')
          load()
        })
       .catch((e) => setError(e.message))
       .finally(() => setAiConnecting(false))
    }
  }, [])

  // ===================== HANDLERS FROM FILE 1 =====================
  const handleConnect = async (platform) => {
    setConnecting(platform)
    setError('')
    setSuccessMsg('')
    try {
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const workspaceId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'

      if (platform === 'substack') {
        setShowSubstackModal(true)
        setConnecting('')
        return
      }

      let endpoint = ''
      if (platform === 'facebook') {
        const res = await api.getFacebookLoginUrl()
        if (res.login_url) {
          window.location.href = res.login_url
          return
        }
        throw new Error('Facebook not configured by admin')
      } else if (platform === 'threads') {
        endpoint = `${base}/api/auth/threads`
      } else if (platform === 'linkedin') {
        endpoint = `${base}/api/auth/linkedin`
      } else if (platform === 'blogger') {
        endpoint = `${base}/api/auth/blogger`
      } else if (platform === 'tiktok') {
        endpoint = `${base}/api/auth/tiktok`
      } else if (platform === 'youtube') {
        endpoint = `${base}/api/auth/youtube`
      } else if (platform === 'google_business' || platform === 'gb') {
        endpoint = `${base}/api/auth/google-business`
      }

      if (endpoint) {
        const res = await fetch(endpoint, {
          headers: { 'X-Workspace-Id': workspaceId }
        })
        const data = await res.json()
        if (data.login_url) {
          window.location.href = data.login_url
        } else {
          throw new Error(`${platform} Login URL missing. ${data.error || ''}`)
        }
      }
    } catch (e) {
      setError(e.message || `${platform} connection failed`)
    } finally {
      setConnecting('')
    }
  }

  const handleSubstackConnect = async () => {
    if (!subSid ||!subPubUrl) {
      setError('Substack SID aur Publication URL dono chahiye')
      return
    }
    setConnecting('substack')
    try {
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const wsId = localStorage.getItem('affaf-crm:workspace-id') || 'default'
      const res = await fetch(`${base}/api/auth/substack/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': wsId
        },
        body: JSON.stringify({
          sid: subSid,
          publication_url: subPubUrl,
          email: subEmail,
          publication_name: subPubUrl.replace('https://','').replace('.substack.com','')
        })
      })
      const data = await res.json()
      if (data.success) {
        setSuccessMsg(`Substack Connected: ${subPubUrl}`)
        setShowSubstackModal(false)
        setSubSid('')
        load()
      } else {
        setError(data.message || 'Substack connect failed')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setConnecting('')
    }
  }

  const handleSubstackDisconnect = async () => {
    try {
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const wsId = localStorage.getItem('affaf-crm:workspace-id') || 'default'
      await fetch(`${base}/api/auth/substack/disconnect`, {
        method: 'POST',
        headers: { 'X-Workspace-Id': wsId }
      })
      setSuccessMsg('Substack Disconnected')
      load()
    } catch (e) {
      setError(e.message)
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
        setSuccessMsg(`Blog switched to ${blog.name}`)
        load()
      } else {
        setError('Blog select failed: ' + JSON.stringify(data))
      }
    } catch (e) {
      setError(e.message)
    }
  }

  // ===================== HANDLERS FROM FILE 2 =====================
  const handleOpenRouterConnect = () => {
    setError('')
    startOpenRouterConnect()
  }

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

  const handleSubstackRefresh = async () => {
    setSubstackRefreshing(true)
    setSubstackRefreshMsg('')
    setError('')
    try {
      await api.refreshSubstackCookie()
      setSubstackRefreshMsg('Cookie refresh ho gayi ✓')
      load()
    } catch (e) {
      setSubstackRefreshMsg('')
      setError(e.message)
    } finally {
      setSubstackRefreshing(false)
    }
  }

  const isFbConnected =!!connected.META_ACCESS_TOKEN ||!!connected.FB_PAGE_ID
  const isThreadsConnected = threadsCheck.connected || threadsCheck.has_token
  const isLinkedinConnected = linkedinCheck.connected || linkedinCheck.has_token
  const isBloggerConnected = bloggerCheck.connected || (bloggerCheck.has_token && bloggerCheck.has_blog)
  const isTiktokConnected = tiktokCheck.connected || tiktokCheck.has_token
  const isSubstackConnected = substackCheck.connected || substackCheck.has_sid
  const isYoutubeConnected = youtubeCheck.connected || youtubeCheck.has_token
  const isGbConnected = gbCheck.connected || gbCheck.has_token

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-signal border-t-transparent rounded-full animate-spin" />
          <div className="text-muted text-sm">Loading your connections...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-28">
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-offwhite mb-2 tracking-tight">Connect Accounts</h1>
        <p className="text-sm text-muted leading-relaxed">8 Platforms — Facebook, Threads, LinkedIn, Blogger, TikTok, Substack, YouTube, Google Business. Ek click me connect.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 text- p-4 rounded-xl mb-4 flex items-start gap-3">
          <span className="text-red-400 mt-0.5">!</span>
          <span className="leading-relaxed">{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-200">X</button>
        </div>
      )}

      {successMsg && (
        <div className="bg-signal/10 border border-signal/20 text-signal text- p-4 rounded-xl mb-6 flex items-center gap-3">
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Facebook */}
        <div className="group relative bg-surface border border-line hover:border-[#1877F2]/40 rounded- p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#1877F2] rounded- flex items-center justify-center shrink-0">
                <span className="text-white font-black text-">f</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text- text-offwhite flex items-center gap-2.5">
                  Facebook & Instagram
                  {isFbConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Page + Instagram Business ek saath connect honge.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text- px-2.5 py-1 rounded-full font-medium border ${
                    isFbConnected? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isFbConnected? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('facebook')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded- px-5 py-2.5 ${
                isFbConnected? 'bg-ink border border-line text-muted' : 'bg-[#1877F2] text-white'
              }`}
            >
              {isFbConnected? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Threads */}
        <div className="group relative bg-surface border border-line rounded- p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-black border border-white/[0.08] rounded- flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-">@</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text- text-offwhite flex items-center gap-2.5">
                  Threads
                  {isThreadsConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Threads.net account.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text- px-2.5 py-1 rounded-full font-medium border ${
                    isThreadsConnected? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isThreadsConnected? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('threads')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded- px-5 py-2.5 ${
                isThreadsConnected? 'bg-ink border border-line text-muted' : 'bg-white text-black'
              }`}
            >
              {isThreadsConnected? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* LinkedIn */}
        <div className="group relative bg-surface border border-line rounded- p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#0A66C2] rounded- flex items-center justify-center shrink-0">
                <span className="text-white font-black text-">in</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text- text-offwhite flex items-center gap-2.5">
                  LinkedIn
                  {isLinkedinConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Profile auto-connect.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text- px-2.5 py-1 rounded-full font-medium border ${
                    isLinkedinConnected? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isLinkedinConnected? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('linkedin')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded- px-5 py-2.5 ${
                isLinkedinConnected? 'bg-ink border border-line text-muted' : 'bg-[#0A66C2] text-white'
              }`}
            >
              {isLinkedinConnected? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Blogger */}
        <div className="group relative bg-surface border border-line rounded- p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#FF5722] rounded- flex items-center justify-center shrink-0">
                <span className="text-white font-black text-">B</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text- text-offwhite flex items-center gap-2.5">
                  Blogger
                  {isBloggerConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Google Blogger blog auto posting.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text- px-2.5 py-1 rounded-full font-medium border ${
                    isBloggerConnected? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isBloggerConnected? 'Connected' : 'Not Connected'}
                  </span>
                  {isBloggerConnected && bloggerCheck.blog_name && (
                    <span className="text- text-muted/70">{bloggerCheck.blog_name}</span>
                  )}
                </div>
                {bloggerBlogs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text- text-muted">{loadingBlogs? 'Loading blogs...' : `${bloggerBlogs.length} blogs found`}</div>
                    <div className="flex flex-wrap gap-2">
                      {bloggerBlogs.map((blog) => (
                        <button key={blog.id} onClick={() => handleSelectBlog(blog)} className="text- px-2.5 py-1 rounded-full bg-ink border border-line text-muted hover:text-offwhite">
                          {blog.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => handleConnect('blogger')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded- px-5 py-2.5 ${
                isBloggerConnected? 'bg-ink border border-line text-muted' : 'bg-[#FF5722] text-white'
              }`}
            >
              {isBloggerConnected? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* TikTok */}
        <div className="group relative bg-surface border border-line rounded- p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-black rounded- flex items-center justify-center shrink-0">
                <span className="text-white font-black text-">T</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text- text-offwhite flex items-center gap-2.5">
                  TikTok
                  {isTiktokConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                  <span className="text- bg-[#FF0050]/20 text-[#FF0050] border border-[#FF0050]/30 px-2 py-0.5 rounded-full font-bold">NEW</span>
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Video auto posting - MP4/MOV required.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text- px-2.5 py-1 rounded-full font-medium border ${
                    isTiktokConnected? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isTiktokConnected? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('tiktok')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded- px-5 py-2.5 ${
                isTiktokConnected? 'bg-ink border border-line text-muted' : 'bg-black text-white border border-white/10'
              }`}
            >
              {isTiktokConnected? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Substack */}
        <div className="group relative bg-surface border border-line rounded- p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#FF6719] rounded- flex items-center justify-center shrink-0">
                <span className="text-white font-black text-">S</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text- text-offwhite flex items-center gap-2.5">
                  Substack
                  {isSubstackConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                  <span className="text- bg-[#FF6719]/20 text-[#FF6719] border border-[#FF6719]/30 px-2 py-0.5 rounded-full font-bold">NEW</span>
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Newsletter publishing - cookie auth.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text- px-2.5 py-1 rounded-full font-medium border ${
                    isSubstackConnected? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isSubstackConnected? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isSubstackConnected && (
                <button
                  onClick={handleSubstackDisconnect}
                  className="shrink-0 font-medium text- rounded- px-3 py-2.5 bg-ink border border-line text-muted hover:text-red-400"
                >
                  Disconnect
                </button>
              )}
              <button
                onClick={() => handleConnect('substack')}
                disabled={!!connecting}
                className={`shrink-0 font-semibold text-[12.5px] rounded- px-5 py-2.5 ${
                  isSubstackConnected? 'bg-ink border border-line text-muted' : 'bg-[#FF6719] text-white'
                }`}
              >
                {isSubstackConnected? 'Reconnect' : 'Connect'}
              </button>
            </div>
          </div>
        </div>

        {/* YouTube */}
        <div className="group relative bg-surface border border-line hover:border-[#FF0000]/40 rounded- p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#FF0000] rounded- flex items-center justify-center shrink-0">
                <span className="text-white font-black text-">YT</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text- text-offwhite flex items-center gap-2.5">
                  YouTube
                  {isYoutubeConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                  <span className="text- bg-[#FF0000]/20 text-[#FF0000] border border-[#FF0000]/30 px-2 py-0.5 rounded-full font-bold">NEW</span>
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Video upload — direct to channel.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text- px-2.5 py-1 rounded-full font-medium border ${
                    isYoutubeConnected? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isYoutubeConnected? 'Connected' : 'Not Connected'}
                  </span>
                  {isYoutubeConnected && youtubeCheck.channel_title && (
                    <span className="text- text-muted/70 truncate max-w-">{youtubeCheck.channel_title}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('youtube')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded- px-5 py-2.5 ${
                isYoutubeConnected? 'bg-ink border border-line text-muted' : 'bg-[#FF0000] text-white'
              }`}
            >
              {isYoutubeConnected? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Google Business - 8th Platform - NEW */}
        <div className="group relative bg-surface border border-line hover:border-[#4285F4]/40 rounded- p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#4285F4] rounded- flex items-center justify-center shrink-0">
                <span className="text-white font-black text-">G</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text- text-offwhite flex items-center gap-2.5">
                  Google Business
                  {isGbConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                  <span className="text- bg-[#4285F4]/20 text-[#4285F4] border border-[#4285F4]/30 px-2 py-0.5 rounded-full font-bold">NEW</span>
                  <span className="text- bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">8th Platform</span>
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Google Business Profile — posts, photos, offers. 265 interactions wali profile.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text- px-2.5 py-1 rounded-full font-medium border ${
                    isGbConnected? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isGbConnected? 'Connected' : 'Not Connected'}
                  </span>
                  {isGbConnected && gbCheck.location_name && (
                    <span className="text- text-muted/70 truncate max-w-">{gbCheck.location_name}</span>
                  )}
                  {isGbConnected && gbLocations.length > 0 && (
                    <span className="text- text-muted/70">{gbLocations.length} locations</span>
                  )}
                </div>
                {isGbConnected && gbLocations.length > 1 && (
                  <div className="mt-2 text- text-muted">
                    {loadingGb? 'Loading locations...' : `${gbLocations.length} locations found — first will be used`}
                  </div>
                )}
                {gbLocations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {gbLocations.map((loc, idx) => (
                      <span key={idx} className="text- px-2.5 py-1 rounded-full bg-ink border border-line text-muted">
                        {loc.name || loc.title || `Location ${idx+1}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => handleConnect('google_business')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded- px-5 py-2.5 ${
                isGbConnected? 'bg-ink border border-line text-muted' : 'bg-[#4285F4] text-white'
              }`}
            >
              {isGbConnected? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </div>

      {/* ===================== PART 2: MANUAL API KEYS FROM FILE 2 ===================== */}
      <div className="mt-12">
        <header className="mb-8">
          <div className="font-mono text- text-signal mb-1">05 · CHANNELS — MANUAL KEYS</div>
          <h1 className="font-display font-bold text-2xl text-offwhite">API keys & connections</h1>
          <p className="text-muted text-sm mt-1">
            Ek baar keys save karo, hamesha yahan se hi connected rahenge — dobara <code className="text-saffron">.env</code> edit nahi karna padega.
          </p>
        </header>

        <div className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group.label} className="bg-surface border border-line rounded-xl p-5">
              <h2 className="font-display font-semibold text-sm text-offwhite mb-3">{group.label}</h2>
              <div className="space-y-3">
                {group.fields.map((f) => (
                  <div key={f.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-muted">{f.label}</label>
                      <span className={`flex items-center gap-1.5 text- font-mono ${connected[f.key]? 'text-signal' : 'text-muted'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${connected[f.key]? 'bg-signal pulse' : 'bg-line'}`} />
                        {connected[f.key]? 'Connected' : 'Not set'}
                      </span>
                    </div>
                    <input
                      type={f.type || 'password'}
                      value={form[f.key]?? ''}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      placeholder="Enter your API key"
                      className="w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/50 outline-none focus:border-signal font-mono"
                    />
                  </div>
                ))}
              </div>
              {group.id === 'ai' && (
                <div className="mt-4 pt-4 border-t border-line">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <button
                        onClick={handleOpenRouterConnect}
                        disabled={aiConnecting}
                        className="text-xs font-medium text-signal border border-signal/40 rounded-lg px-3 py-1.5 hover:bg-signal/10 disabled:opacity-50"
                      >
                        {aiConnecting? 'Connecting…' : connected.OPENROUTER_API_KEY? 'Reconnect with OpenRouter' : 'Connect with OpenRouter (Free)'}
                      </button>
                      {aiMsg && <span className="ml-3 text-xs text-signal">{aiMsg}</span>}
                    </div>
                    <span className={`flex items-center gap-1.5 text- font-mono ${connected.OPENROUTER_API_KEY? 'text-signal' : 'text-muted'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${connected.OPENROUTER_API_KEY? 'bg-signal pulse' : 'bg-line'}`} />
                      {connected.OPENROUTER_API_KEY? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <p className="text- text-muted mt-2">
                    Ek click mein OpenRouter par login karo — koi API key copy-paste nahi karni. OpenRouter khud is
                    app ke naam ek fresh, revoke-able key bana kar bhej deta hai jo yahan save ho jati hai.
                    Generator phir isi se free models (Llama, Mistral, Gemma) try karega; agar sab busy hon to
                    template caption fallback ke tor par milta hai.
                  </p>
                </div>
              )}
              {group.id === 'substack' && (
                <div className="mt-4 pt-4 border-t border-line">
                  <button
                    onClick={handleSubstackRefresh}
                    disabled={substackRefreshing}
                    className="text-xs font-medium text-signal border border-signal/40 rounded-lg px-3 py-1.5 hover:bg-signal/10 disabled:opacity-50"
                  >
                    {substackRefreshing? 'Refreshing…' : 'Refresh cookie now (email/password se)'}
                  </button>
                  {substackRefreshMsg && <span className="ml-3 text-xs text-signal">{substackRefreshMsg}</span>}
                  <p className="text- text-muted mt-2">
                    Pehle upar Email + Password save karo, phir ye button dabao — naya session cookie khud le kar save ho jayegi (koi DevTools nahi kholni parti).
                    Agar Substack login pe captcha maang le to ye automation fail hogi, tab manual cookie hi copy karni paregi.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sticky bottom-6 mt-6">
          <button
            onClick={handleSave}
            disabled={saving || Object.values(form).every((v) =>!v?.trim())}
            className="w-full bg-signal text-ink font-semibold text-sm rounded-lg py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-glow"
          >
            {saving? 'Saving…' : saved? 'Saved ✓' : 'Save keys'}
          </button>
        </div>
      </div>

      {/* Substack Modal */}
      {showSubstackModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-line rounded- p-6 w-full max-w-">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-[#FF6719] rounded- flex items-center justify-center">
                <span className="text-white font-black">S</span>
              </div>
              <div>
                <h2 className="font-bold text- text-offwhite">Connect Substack</h2>
                <p className="text- text-muted">2 min - No API key</p>
              </div>
              <button onClick={()=>setShowSubstackModal(false)} className="ml-auto w-8 h-8 rounded-full bg-ink flex items-center justify-center text-muted hover:text-offwhite">X</button>
            </div>

            <div className="bg-[#FF6719]/10 border border-[#FF6719]/20 p-3 rounded- mb-4">
              <div className="text- font-bold text-[#FF6719] mb-1">Kaise SID Lena Hai:</div>
              <div className="text- text-muted leading-[1.6]">
                1. substack.com pe login karo<br/>
                2. F12 - Application - Cookies - substack.com<br/>
                3. substack.sid ka Value copy karo
              </div>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text- font-bold text-offwhite">Publication URL *</label>
                <input
                  value={subPubUrl}
                  onChange={e=>setSubPubUrl(e.target.value)}
                  placeholder="https://yoursite.substack.com"
                  className="w-full mt-1.5 p-3 rounded- bg-ink border border-line text- text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text- font-bold text-offwhite">substack.sid Cookie *</label>
                <textarea
                  value={subSid}
                  onChange={e=>setSubSid(e.target.value)}
                  placeholder="Paste sid here..."
                  className="w-full mt-1.5 p-3 rounded- bg-ink border border-line text- font-mono text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none h- resize-none"
                />
              </div>
              <div>
                <label className="text- font-bold text-offwhite">Email (optional)</label>
                <input
                  value={subEmail}
                  onChange={e=>setSubEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full mt-1.5 p-3 rounded- bg-ink border border-line text- text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2.5 mt-6">
              <button onClick={()=>setShowSubstackModal(false)} className="flex-1 py-3 rounded- bg-ink border border-line text- font-semibold text-muted hover:text-offwhite">Cancel</button>
              <button onClick={handleSubstackConnect} disabled={connecting==='substack'} className="flex-1 py-3 rounded- bg-[#FF6719] text-white text- font-bold hover:bg-[#FF6719]/90 disabled:opacity-50">
                {connecting === 'substack'? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-ink/40 border border-line/60 rounded-">
        <div className="flex gap-3">
          <div>
            <div className="text- font-semibold text-offwhite">8 Platforms Active — FB, Threads, LinkedIn, Blogger, TikTok, Substack, YouTube, Google Business</div>
            <div className="text-[11.5px] text-muted/80 mt-1 leading-[1.5]">
              Google Business: 265 interactions wali profile pe post, photo, offer. Posts 7 din me expire hote hain — scheduler se auto re-post kar sakte ho. Blogger/YouTube wala Client ID reuse karo, bas Business Profile API enable karo.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
