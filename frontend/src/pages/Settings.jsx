import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { startOpenRouterConnect, consumePendingOpenRouterCode } from '../lib/openrouterOAuth.js'

export default function Settings() {
  const [connected, setConnected] = useState({})
  const [threadsCheck, setThreadsCheck] = useState({ connected: false })
  const [linkedinCheck, setLinkedinCheck] = useState({ connected: false })
  const [bloggerCheck, setBloggerCheck] = useState({ connected: false, has_token: false, has_blog: false, blog_name: '' })
  const [tiktokCheck, setTiktokCheck] = useState({ connected: false, has_token: false })
  const [substackCheck, setSubstackCheck] = useState({ connected: false, has_sid: false, publication_url: '' })
  const [youtubeCheck, setYoutubeCheck] = useState({ connected: false, has_token: false, channel_title: '' })
  const [gbCheck, setGbCheck] = useState({ connected: false, has_token: false, location_name: '' })
  const [openrouterCheck, setOpenrouterCheck] = useState({ connected: false })
  const [bloggerBlogs, setBloggerBlogs] = useState([])
  const [gbLocations, setGbLocations] = useState([])
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [connecting, setConnecting] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingBlogs, setLoadingBlogs] = useState(false)
  const [loadingGb, setLoadingGb] = useState(false)
  const [aiConnecting, setAiConnecting] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  
  const [showSubstackModal, setShowSubstackModal] = useState(false)
  const [subPubUrl, setSubPubUrl] = useState('')
  const [subSid, setSubSid] = useState('')
  const [subEmail, setSubEmail] = useState('')

  const loadBloggerBlogs = async (base, headers) => {
    setLoadingBlogs(true)
    try {
      const res = await fetch(`${base}/api/auth/blogger/blogs`, { headers })
      const data = await res.json()
      if (data.items) setBloggerBlogs(data.items)
    } catch (e) { console.log(e) }
    finally { setLoadingBlogs(false) }
  }

  const loadGbLocations = async (base, headers) => {
    setLoadingGb(true)
    try {
      const res = await fetch(`${base}/api/auth/google-business/locations`, { headers })
      const data = await res.json()
      if (data.locations) setGbLocations(data.locations)
    } catch (e) { console.log(e) }
    finally { setLoadingGb(false) }
  }

  const load = async () => {
    setLoading(true)
    try {
      const keysData = await api.getSettingsKeys().catch(() => ({}))
      setConnected(keysData)
      setOpenrouterCheck({ connected: !!keysData.OPENROUTER_API_KEY })
      
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
        if (bloggerRes.connected || bloggerRes.has_token) loadBloggerBlogs(base, headers)
      }
      if (tiktokRes) setTiktokCheck(tiktokRes)
      if (substackRes) {
        setSubstackCheck(substackRes)
        if (substackRes.publication_url) setSubPubUrl(substackRes.publication_url)
      }
      if (youtubeRes) setYoutubeCheck(youtubeRes)
      if (gbRes) {
        setGbCheck(gbRes)
        if (gbRes.connected || gbRes.has_token) loadGbLocations(base, headers)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    load()
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get('connected')
    const errorParam = params.get('error')
    const messageParam = params.get('message')
    
    if (connectedParam) {
      if (['facebook', 'threads', 'linkedin', 'blogger', 'tiktok', 'substack', 'youtube', 'google_business', 'google-business', 'openrouter'].includes(connectedParam)) {
        setSuccessMsg(`${connectedParam} Successfully Connected ✓`)
        setTimeout(() => load(), 1200)
      }
      window.history.replaceState({}, '', window.location.pathname)
    }
    
    if (errorParam || messageParam) {
      setError(`Connection failed: ${messageParam || errorParam || 'Unknown error'}`)
      window.history.replaceState({}, '', window.location.pathname)
    }

    // OpenRouter OAuth - button ke through
    const pending = consumePendingOpenRouterCode()
    if (pending) {
      setAiConnecting(true)
      setAiMsg('OpenRouter se connect ho raha hai...')
      api.exchangeOpenRouterCode(pending.code, pending.verifier)
        .then(() => {
          setAiMsg('OpenRouter connected ✓ — Free models ready')
          setSuccessMsg('AI Content Generation Connected ✓ — Bina card ke free')
          load()
        })
        .catch((e) => setError('OpenRouter connect failed: ' + e.message))
        .finally(() => setAiConnecting(false))
    }
  }, [])

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

      if (platform === 'openrouter') {
        setAiConnecting(true)
        setAiMsg('OpenRouter pe redirect ho raha hai...')
        await startOpenRouterConnect()
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
      } else if (platform === 'google_business') {
        endpoint = `${base}/api/auth/google-business`
      }
      
      if (endpoint) {
        const res = await fetch(endpoint, { headers: { 'X-Workspace-Id': workspaceId } })
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
      if (platform === 'openrouter') {
        setAiConnecting(false)
      }
    }
  }

  const handleSubstackConnect = async () => {
    if (!subSid || !subPubUrl) {
      setError('Substack SID aur Publication URL dono chahiye')
      return
    }
    setConnecting('substack')
    try {
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const wsId = localStorage.getItem('affaf-crm:workspace-id') || 'default'
      const res = await fetch(`${base}/api/auth/substack/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
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
      await fetch(`${base}/api/auth/substack/disconnect`, { method: 'POST', headers: { 'X-Workspace-Id': wsId } })
      setSuccessMsg('Substack Disconnected')
      load()
    } catch (e) { setError(e.message) }
  }

  const handleSelectBlog = async (blog) => {
    try {
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const wsId = localStorage.getItem('affaf-crm:workspace-id') || 'default'
      const res = await fetch(`${base}/api/auth/blogger/select-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': wsId },
        body: JSON.stringify({ blog_id: blog.id, blog_name: blog.name, blog_url: blog.url })
      })
      const data = await res.json()
      if (data.success) {
        setSuccessMsg(`Blog switched to ${blog.name}`)
        load()
      } else {
        setError('Blog select failed')
      }
    } catch (e) { setError(e.message) }
  }

  const isFbConnected = !!connected.META_ACCESS_TOKEN || !!connected.FB_PAGE_ID
  const isThreadsConnected = threadsCheck.connected || threadsCheck.has_token
  const isLinkedinConnected = linkedinCheck.connected || linkedinCheck.has_token
  const isBloggerConnected = bloggerCheck.connected || (bloggerCheck.has_token && bloggerCheck.has_blog)
  const isTiktokConnected = tiktokCheck.connected || tiktokCheck.has_token
  const isSubstackConnected = substackCheck.connected || substackCheck.has_sid
  const isYoutubeConnected = youtubeCheck.connected || youtubeCheck.has_token
  const isGbConnected = gbCheck.connected || gbCheck.has_token
  const isAiConnected = openrouterCheck.connected

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
        <p className="text-sm text-muted leading-relaxed">9 Platforms — Sirf Connect button dabao, koi manual API key nahi. Bina card ke AI bhi free.</p>
      </div>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-[13px] p-4 rounded-xl mb-4 flex items-start gap-3">
          <span className="text-red-400 mt-0.5">!</span>
          <span className="leading-relaxed">{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-200">X</button>
        </div>
      )}
      
      {successMsg && (
        <div className="bg-signal/10 border border-signal/20 text-signal text-[13px] p-4 rounded-xl mb-6 flex items-center gap-3">
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      <div className="space-y-4">

        {/* AI Content Generation - FIRST - Button only */}
        <div className="group relative bg-surface border border-line hover:border-signal/40 rounded-[16px] p-5 sm:p-6 transition-all ring-1 ring-signal/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-signal rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-black font-black text-[16px]">AI</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  AI Content Generation
                  {isAiConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                  <span className="text-[10px] bg-signal/20 text-signal border border-signal/30 px-2 py-0.5 rounded-full font-bold">FREE - NO CARD</span>
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">OpenRouter — Llama, Mistral, Gemma free. Ek click me connect.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isAiConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isAiConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {aiMsg && <span className="text-[11px] text-signal">{aiMsg}</span>}
                </div>
                {isAiConnected && (
                  <div className="mt-2 text-[11px] text-muted/70">Free models: llama-3.1-8b:free, mistral-7b:free, gemma-2-9b:free</div>
                )}
              </div>
            </div>
            <button
              onClick={() => handleConnect('openrouter')}
              disabled={aiConnecting || !!connecting}
              className={`shrink-0 font-bold text-[12.5px] rounded-[10px] px-5 py-2.5 transition-all ${isAiConnected ? 'bg-ink border border-line text-muted hover:text-offwhite' : 'bg-signal text-black hover:brightness-110 shadow-glow'}`}
            >
              {aiConnecting ? 'Connecting...' : isAiConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Facebook */}
        <div className="group relative bg-surface border border-line hover:border-[#1877F2]/40 rounded-[16px] p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#1877F2] rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[18px]">f</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Facebook & Instagram
                  {isFbConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Page + Instagram Business ek saath connect honge.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isFbConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isFbConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={() => handleConnect('facebook')} disabled={!!connecting} className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${isFbConnected ? 'bg-ink border border-line text-muted' : 'bg-[#1877F2] text-white'}`}>
              {isFbConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Threads */}
        <div className="group relative bg-surface border border-line rounded-[16px] p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-black border border-white/[0.08] rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-[15px]">@</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Threads
                  {isThreadsConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Threads.net account.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isThreadsConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isThreadsConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={() => handleConnect('threads')} disabled={!!connecting} className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${isThreadsConnected ? 'bg-ink border border-line text-muted' : 'bg-white text-black'}`}>
              {isThreadsConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* LinkedIn */}
        <div className="group relative bg-surface border border-line rounded-[16px] p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#0A66C2] rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[13px]">in</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  LinkedIn
                  {isLinkedinConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Profile auto-connect.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isLinkedinConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isLinkedinConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={() => handleConnect('linkedin')} disabled={!!connecting} className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${isLinkedinConnected ? 'bg-ink border border-line text-muted' : 'bg-[#0A66C2] text-white'}`}>
              {isLinkedinConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Blogger */}
        <div className="group relative bg-surface border border-line rounded-[16px] p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#FF5722] rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[16px]">B</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Blogger
                  {isBloggerConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Google Blogger blog auto posting.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isBloggerConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isBloggerConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {isBloggerConnected && bloggerCheck.blog_name && <span className="text-[11px] text-muted/70">{bloggerCheck.blog_name}</span>}
                </div>
                {bloggerBlogs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-[11px] text-muted">{loadingBlogs ? 'Loading blogs...' : `${bloggerBlogs.length} blogs found`}</div>
                    <div className="flex flex-wrap gap-2">
                      {bloggerBlogs.map((blog) => (
                        <button key={blog.id} onClick={() => handleSelectBlog(blog)} className="text-[11px] px-2.5 py-1 rounded-full bg-ink border border-line text-muted hover:text-offwhite">{blog.name}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => handleConnect('blogger')} disabled={!!connecting} className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${isBloggerConnected ? 'bg-ink border border-line text-muted' : 'bg-[#FF5722] text-white'}`}>
              {isBloggerConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* TikTok */}
        <div className="group relative bg-surface border border-line rounded-[16px] p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-black rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[16px]">T</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  TikTok
                  {isTiktokConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Video auto posting - MP4/MOV required.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isTiktokConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isTiktokConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={() => handleConnect('tiktok')} disabled={!!connecting} className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${isTiktokConnected ? 'bg-ink border border-line text-muted' : 'bg-black text-white border border-white/10'}`}>
              {isTiktokConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Substack */}
        <div className="group relative bg-surface border border-line rounded-[16px] p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#FF6719] rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[16px]">S</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Substack
                  {isSubstackConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Newsletter publishing - cookie auth.</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isSubstackConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isSubstackConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isSubstackConnected && <button onClick={handleSubstackDisconnect} className="shrink-0 font-medium text-[11px] rounded-[10px] px-3 py-2.5 bg-ink border border-line text-muted hover:text-red-400">Disconnect</button>}
              <button onClick={() => handleConnect('substack')} disabled={!!connecting} className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${isSubstackConnected ? 'bg-ink border border-line text-muted' : 'bg-[#FF6719] text-white'}`}>
                {isSubstackConnected ? 'Reconnect' : 'Connect'}
              </button>
            </div>
          </div>
        </div>

        {/* YouTube */}
        <div className="group relative bg-surface border border-line hover:border-[#FF0000]/40 rounded-[16px] p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#FF0000] rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[12px]">YT</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  YouTube
                  {isYoutubeConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Video upload — direct to channel.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isYoutubeConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isYoutubeConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {isYoutubeConnected && youtubeCheck.channel_title && <span className="text-[11px] text-muted/70 truncate max-w-[160px]">{youtubeCheck.channel_title}</span>}
                </div>
              </div>
            </div>
            <button onClick={() => handleConnect('youtube')} disabled={!!connecting} className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${isYoutubeConnected ? 'bg-ink border border-line text-muted' : 'bg-[#FF0000] text-white'}`}>
              {isYoutubeConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Google Business */}
        <div className="group relative bg-surface border border-line hover:border-[#4285F4]/40 rounded-[16px] p-5 sm:p-6 transition-all">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#4285F4] rounded-[12px] flex items-center justify-center shrink-0">
                <span className="text-white font-black text-[14px]">G</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Google Business
                  {isGbConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Google Business Profile — posts, photos, offers.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${isGbConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'}`}>
                    {isGbConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {isGbConnected && gbCheck.location_name && <span className="text-[11px] text-muted/70 truncate max-w-[160px]">{gbCheck.location_name}</span>}
                </div>
              </div>
            </div>
            <button onClick={() => handleConnect('google_business')} disabled={!!connecting} className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${isGbConnected ? 'bg-ink border border-line text-muted' : 'bg-[#4285F4] text-white'}`}>
              {isGbConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </div>

      {showSubstackModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-line rounded-[20px] p-6 w-full max-w-[440px]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-[#FF6719] rounded-[10px] flex items-center justify-center">
                <span className="text-white font-black">S</span>
              </div>
              <div>
                <h2 className="font-bold text-[16px] text-offwhite">Connect Substack</h2>
                <p className="text-[11px] text-muted">2 min - No API key</p>
              </div>
              <button onClick={()=>setShowSubstackModal(false)} className="ml-auto w-8 h-8 rounded-full bg-ink flex items-center justify-center text-muted hover:text-offwhite">X</button>
            </div>
            <div className="bg-[#FF6719]/10 border border-[#FF6719]/20 p-3 rounded-[12px] mb-4">
              <div className="text-[11px] font-bold text-[#FF6719] mb-1">Kaise SID Lena Hai:</div>
              <div className="text-[11px] text-muted leading-[1.6]">1. substack.com pe login karo<br/>2. F12 - Application - Cookies - substack.com<br/>3. substack.sid ka Value copy karo</div>
            </div>
            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-offwhite">Publication URL *</label>
                <input value={subPubUrl} onChange={e=>setSubPubUrl(e.target.value)} placeholder="https://yoursite.substack.com" className="w-full mt-1.5 p-3 rounded-[10px] bg-ink border border-line text-[13px] text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-offwhite">substack.sid Cookie *</label>
                <textarea value={subSid} onChange={e=>setSubSid(e.target.value)} placeholder="Paste sid here..." className="w-full mt-1.5 p-3 rounded-[10px] bg-ink border border-line text-[12px] font-mono text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none h-[80px] resize-none" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-offwhite">Email (optional)</label>
                <input value={subEmail} onChange={e=>setSubEmail(e.target.value)} placeholder="your@email.com" className="w-full mt-1.5 p-3 rounded-[10px] bg-ink border border-line text-[13px] text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2.5 mt-6">
              <button onClick={()=>setShowSubstackModal(false)} className="flex-1 py-3 rounded-[12px] bg-ink border border-line text-[13px] font-semibold text-muted hover:text-offwhite">Cancel</button>
              <button onClick={handleSubstackConnect} disabled={connecting==='substack'} className="flex-1 py-3 rounded-[12px] bg-[#FF6719] text-white text-[13px] font-bold hover:bg-[#FF6719]/90 disabled:opacity-50">
                {connecting === 'substack' ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-ink/40 border border-line/60 rounded-[12px]">
        <div className="text-[12px] font-semibold text-offwhite">9 Platforms — Sirf Connect Button, Koi Manual Key Nahi</div>
        <div className="text-[11.5px] text-muted/80 mt-1 leading-[1.5]">AI Content Generation bhi button se connect hoga — OpenRouter pe Authorize karo, Credit limit 0 rakho, bina card ke free models chalenge.</div>
      </div>
    </div>
  )
}
