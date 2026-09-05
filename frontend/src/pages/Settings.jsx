import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// UPGRADED VERSION - WITH SUBSTACK - 6 Platforms
// Facebook, Threads, LinkedIn, Blogger, TikTok, Substack

export default function Settings() {
  const [connected, setConnected] = useState({})
  const [threadsCheck, setThreadsCheck] = useState({ connected: false })
  const [linkedinCheck, setLinkedinCheck] = useState({ connected: false })
  const [bloggerCheck, setBloggerCheck] = useState({ connected: false, has_token: false, has_blog: false })
  const [tiktokCheck, setTiktokCheck] = useState({ connected: false, has_token: false })
  const [substackCheck, setSubstackCheck] = useState({ connected: false, has_sid: false, publication_url: '' })
  const [bloggerBlogs, setBloggerBlogs] = useState([])
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [connecting, setConnecting] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingBlogs, setLoadingBlogs] = useState(false)
  
  // Substack Modal
  const [showSubstackModal, setShowSubstackModal] = useState(false)
  const [subPubUrl, setSubPubUrl] = useState('')
  const [subSid, setSubSid] = useState('')
  const [subEmail, setSubEmail] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const keysData = await api.getSettingsKeys().catch(() => ({}))
      setConnected(keysData)
      
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const wsId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'
      const headers = { 'X-Workspace-Id': wsId }
      
      const [threadsRes, linkedinRes, bloggerRes, tiktokRes, substackRes] = await Promise.all([
        fetch(`${base}/api/auth/threads/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/linkedin/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/blogger/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/tiktok/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/substack/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false }))
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

  useEffect(() => { 
    load()
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get('connected')
    const errorParam = params.get('error')
    const messageParam = params.get('message')
    
    if (connectedParam) {
      if (['facebook', 'threads', 'linkedin', 'blogger', 'tiktok', 'substack'].includes(connectedParam)) {
        setSuccessMsg(`${connectedParam.charAt(0).toUpperCase() + connectedParam.slice(1)} Successfully Connected! ✓`)
        setTimeout(() => load(), 1200)
      }
      window.history.replaceState({}, '', window.location.pathname)
    }
    
    if (errorParam || params.get('connected')?.includes('error') || messageParam) {
      setError(`Connection failed: ${messageParam || params.get('error') || errorParam || 'Unknown error'}`)
      window.history.replaceState({}, '', window.location.pathname)
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
        // Substack uses modal, not redirect
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
      }
      
      if (endpoint) {
        const res = await fetch(endpoint, {
          headers: { 'X-Workspace-Id': workspaceId }
        })
        const data = await res.json()
        if (data.login_url) {
          window.location.href = data.login_url
        } else {
          throw new Error(`${platform} Login URL missing. ${data.error || ''} Admin setup: ${data.instructions || ''}`)
        }
      }
    } catch (e) {
      setError(e.message || `${platform} connection failed`)
    } finally {
      setConnecting('')
    }
  }

  const handleSubstackConnect = async () => {
    if (!subSid || !subPubUrl) {
      setError('Substack SID aur Publication URL dono chahiye!')
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
          publication_name: subPubUrl.replace('https://','').replace('.substack.com','').replace('.',' ')
        })
      })
      const data = await res.json()
      if (data.success) {
        setSuccessMsg(`Substack Connected! ${subPubUrl} ✓`)
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
        setSuccessMsg(`Blog switched to ${blog.name} ✓`)
        load()
      } else {
        setError('Blog select failed: ' + JSON.stringify(data))
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const isFbConnected = !!connected.META_ACCESS_TOKEN || !!connected.FB_PAGE_ID
  const isThreadsConnected = threadsCheck.connected || threadsCheck.has_token || !!threadsCheck.threads_user_id_value || !!threadsCheck.threads_user_id
  const isLinkedinConnected = linkedinCheck.connected || linkedinCheck.has_token || linkedinCheck.profile_connected
  const isBloggerConnected = bloggerCheck.connected || (bloggerCheck.has_token && bloggerCheck.has_blog)
  const isTiktokConnected = tiktokCheck.connected || tiktokCheck.has_token || !!tiktokCheck.open_id
  const isSubstackConnected = substackCheck.connected || substackCheck.has_sid || !!substackCheck.publication_url

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
        <p className="text-sm text-muted leading-relaxed">Ek click me connect karo — Facebook, Threads, LinkedIn, Blogger, TikTok, Substack auto! Koi key ki zaroorat nahi.</p>
      </div>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-[13px] p-4 rounded-xl mb-4 flex items-start gap-3 backdrop-blur">
          <span className="text-red-400 mt-0.5">⚠</span>
          <span className="leading-relaxed">{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-200">✕</button>
        </div>
      )}
      
      {successMsg && (
        <div className="bg-signal/10 border border-signal/20 text-signal text-[13px] p-4 rounded-xl mb-6 flex items-center gap-3 backdrop-blur">
          <span className="text-[14px]">✅</span>
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Facebook + Instagram */}
        <div className="group relative bg-surface border border-line hover:border-[#1877F2]/40 rounded-[16px] p-5 sm:p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(24,119,242,0.12)] hover:-translate-y-[1px]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#1877F2] rounded-[12px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(24,119,242,0.3)]">
                <span className="text-white font-black text-[18px] tracking-tighter">f</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Facebook & Instagram
                  {isFbConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.5)]" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5 leading-[1.5]">Page + Instagram Business ek saath connect honge.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border transition ${
                    isFbConnected 
                      ? 'bg-signal/10 text-signal border-signal/20' 
                      : 'bg-ink text-muted/80 border-line'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isFbConnected ? 'bg-signal' : 'bg-muted'}`} />
                    {isFbConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('facebook')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-4 sm:px-5 py-2.5 transition-all duration-200 active:scale-[0.98] ${
                isFbConnected
                  ? 'bg-ink border border-line text-muted hover:border-[#1877F2]/30 hover:text-offwhite hover:bg-surface'
                  : 'bg-[#1877F2] text-white hover:brightness-110 shadow-[0_4px_14px_rgba(24,119,242,0.35)]'
              } disabled:opacity-50`}
            >
              {connecting === 'facebook' ? '...' : isFbConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Threads */}
        <div className="group relative bg-surface border border-line hover:border-white/20 rounded-[16px] p-5 sm:p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(255,255,255,0.06)] hover:-translate-y-[1px]">
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
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${
                    isThreadsConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isThreadsConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('threads')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${
                isThreadsConnected ? 'bg-ink border border-line text-muted' : 'bg-white text-black'
              }`}
            >
              {isThreadsConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* LinkedIn */}
        <div className="group relative bg-surface border border-line hover:border-[#0A66C2]/40 rounded-[16px] p-5 sm:p-6 transition-all">
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
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${
                    isLinkedinConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isLinkedinConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('linkedin')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${
                isLinkedinConnected ? 'bg-ink border border-line text-muted' : 'bg-[#0A66C2] text-white'
              }`}
            >
              {isLinkedinConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Blogger */}
        <div className="group relative bg-surface border border-line hover:border-[#FF5722]/40 rounded-[16px] p-5 sm:p-6 transition-all overflow-hidden">
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
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${
                    isBloggerConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isBloggerConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {isBloggerConnected && bloggerCheck.blog_name && (
                    <span className="text-[11px] text-muted/70">{bloggerCheck.blog_name}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('blogger')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 ${
                isBloggerConnected ? 'bg-ink border border-line text-muted' : 'bg-[#FF5722] text-white'
              }`}
            >
              {isBloggerConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* TikTok */}
        <div className="group relative bg-surface border border-line hover:border-[#000000]/40 rounded-[16px] p-5 sm:p-6 transition-all overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#FF0050]/5 via-transparent to-[#00F2EA]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-black rounded-[12px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.3)] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#FF0050] to-[#00F2EA] opacity-20" />
                <span className="text-white font-black text-[16px] relative">♪</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  TikTok
                  {isTiktokConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                  <span className="text-[10px] bg-[#FF0050]/20 text-[#FF0050] border border-[#FF0050]/30 px-2 py-0.5 rounded-full font-bold">NEW</span>
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Video auto posting - MP4/MOV required.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${
                    isTiktokConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isTiktokConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {isTiktokConnected && tiktokCheck.display_name && (
                    <span className="text-[11px] text-muted/70">@{tiktokCheck.display_name}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('tiktok')}
              disabled={!!connecting}
              className={`relative shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 transition-all ${
                isTiktokConnected 
                  ? 'bg-ink border border-line text-muted hover:text-offwhite' 
                  : 'bg-black text-white hover:bg-black/80 border border-white/10 shadow-[0_4px_14px_rgba(0,0,0,0.3)]'
              }`}
            >
              {connecting === 'tiktok' ? '...' : isTiktokConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Substack - NEW - 6th Platform - NO KHARWARI */}
        <div className="group relative bg-surface border border-line hover:border-[#FF6719]/40 rounded-[16px] p-5 sm:p-6 transition-all overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#FF6719]/5 via-transparent to-[#FF6719]/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#FF6719] rounded-[12px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(255,103,25,0.3)]">
                <span className="text-white font-black text-[16px]">S</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Substack
                  {isSubstackConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse" />}
                  <span className="text-[10px] bg-[#FF6719]/20 text-[#FF6719] border border-[#FF6719]/30 px-2 py-0.5 rounded-full font-bold">NEW</span>
                  <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">NO API KEY</span>
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5">Newsletter publishing - cookie auth, no OAuth.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border ${
                    isSubstackConnected ? 'bg-signal/10 text-signal border-signal/20' : 'bg-ink text-muted/80 border-line'
                  }`}>
                    {isSubstackConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {isSubstackConnected && substackCheck.publication_url && (
                    <span className="text-[11px] text-muted/70 truncate max-w-[160px]">{substackCheck.publication_url.replace('https://','')}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isSubstackConnected && (
                <button
                  onClick={handleSubstackDisconnect}
                  className="shrink-0 font-medium text-[11px] rounded-[10px] px-3 py-2.5 bg-ink border border-line text-muted hover:text-red-400"
                >
                  Disconnect
                </button>
              )}
              <button
                onClick={() => handleConnect('substack')}
                disabled={!!connecting}
                className={`relative shrink-0 font-semibold text-[12.5px] rounded-[10px] px-5 py-2.5 transition-all ${
                  isSubstackConnected 
                    ? 'bg-ink border border-line text-muted hover:text-offwhite' 
                    : 'bg-[#FF6719] text-white hover:bg-[#FF6719]/90 shadow-[0_4px_14px_rgba(255,103,25,0.35)]'
                }`}
              >
                {connecting === 'substack' ? '...' : isSubstackConnected ? 'Reconnect' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Substack Modal - No Kharwari */}
      {showSubstackModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-line rounded-[20px] p-6 w-full max-w-[440px] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-[#FF6719] rounded-[10px] flex items-center justify-center">
                <span className="text-white font-black">S</span>
              </div>
              <div>
                <h2 className="font-bold text-[16px] text-offwhite">Connect Substack</h2>
                <p className="text-[11px] text-muted">2 min - No API key, no OAuth</p>
              </div>
              <button onClick={()=>setShowSubstackModal(false)} className="ml-auto w-8 h-8 rounded-full bg-ink flex items-center justify-center text-muted hover:text-offwhite">✕</button>
            </div>
            
            <div className="bg-[#FF6719]/10 border border-[#FF6719]/20 p-3 rounded-[12px] mb-4">
              <div className="text-[11px] font-bold text-[#FF6719] mb-1">📋 Kaise SID Lena Hai:</div>
              <div className="text-[11px] text-muted leading-[1.6]">
                1. <a href="https://substack.com" target="_blank" className="text-[#FF6719] underline">substack.com</a> pe login karo<br/>
                2. Keyboard pe <span className="bg-ink px-1.5 py-0.5 rounded text-[10px] font-mono">F12</span> dabao (DevTools)<br/>
                3. <b>Application</b> tab → <b>Cookies</b> → <b>https://substack.com</b><br/>
                4. <b>substack.sid</b> ka <b>Value</b> copy karo (lamba string)
              </div>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-offwhite flex items-center gap-1.5">
                  Publication URL <span className="text-red-400">*</span>
                  <span className="text-[10px] text-muted font-normal">jaise https://yoursite.substack.com</span>
                </label>
                <input 
                  value={subPubUrl}
                  onChange={e=>setSubPubUrl(e.target.value)}
                  placeholder="https://yoursite.substack.com"
                  className="w-full mt-1.5 p-3 rounded-[10px] bg-ink border border-line text-[13px] text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-offwhite flex items-center gap-1.5">
                  substack.sid Cookie <span className="text-red-400">*</span>
                  <span className="text-[10px] text-muted font-normal">100+ chars ka lamba string</span>
                </label>
                <textarea 
                  value={subSid}
                  onChange={e=>setSubSid(e.target.value)}
                  placeholder="Paste sid here... starts with long random string"
                  className="w-full mt-1.5 p-3 rounded-[10px] bg-ink border border-line text-[12px] font-mono text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none h-[80px] resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-offwhite">
                  Email <span className="text-[10px] text-muted font-normal">(optional)</span>
                </label>
                <input 
                  value={subEmail}
                  onChange={e=>setSubEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full mt-1.5 p-3 rounded-[10px] bg-ink border border-line text-[13px] text-offwhite placeholder:text-muted/50 focus:border-[#FF6719]/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2.5 mt-6">
              <button onClick={()=>setShowSubstackModal(false)} className="flex-1 py-3 rounded-[12px] bg-ink border border-line text-[13px] font-semibold text-muted hover:text-offwhite">Cancel</button>
              <button onClick={handleSubstackConnect} disabled={connecting==='substack'} className="flex-1 py-3 rounded-[12px] bg-[#FF6719] text-white text-[13px] font-bold hover:bg-[#FF6719]/90 disabled:opacity-50 shadow-[0_4px_14px_rgba(255,103,25,0.3)]">
                {connecting === 'substack' ? 'Connecting...' : 'Connect ✓'}
              </button>
            </div>

            <p className="text-[10px] text-muted/60 mt-3 text-center leading-[1.4]">
              🔒 No password needed • Only cookie • Encrypted storage • Expires in 6 months • Disconnect anytime
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-ink/40 border border-line/60 rounded-[12px]">
        <div className="flex gap-3">
          <span>🔒</span>
          <div>
            <div className="text-[12px] font-semibold text-offwhite">6 Platforms Active — Facebook, Threads, LinkedIn, Blogger, TikTok, Substack</div>
            <div className="text-[11.5px] text-muted/80 mt-1 leading-[1.5]">
              TikTok ke liye video (MP4) zaroori hai. Substack ke liye sirf Publication URL + SID chahiye — no OAuth, no API key, no approval. Admin: TikTok Dev Portal me app banao, Client Key/Secret set karo. Substack ke liye F12 → Cookies se SID copy karo.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
