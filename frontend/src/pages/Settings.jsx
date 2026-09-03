import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// FINAL VERSION - NO MEDIUM - Only 4 Platforms
// Facebook, Threads, LinkedIn, Blogger - Medium removed (API deprecated by Medium)

export default function Settings() {
  const [connected, setConnected] = useState({})
  const [threadsCheck, setThreadsCheck] = useState({ connected: false })
  const [linkedinCheck, setLinkedinCheck] = useState({ connected: false })
  const [bloggerCheck, setBloggerCheck] = useState({ connected: false, has_token: false, has_blog: false })
  const [bloggerBlogs, setBloggerBlogs] = useState([])
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [connecting, setConnecting] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingBlogs, setLoadingBlogs] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const keysData = await api.getSettingsKeys().catch(() => ({}))
      setConnected(keysData)
      
      const base = api.baseUrl || 'https://nextgen-analytics-social-media-tool.fastapicloud.dev'
      const wsId = localStorage.getItem('affaf-crm:workspace-id') || localStorage.getItem('workspaceId') || 'default'
      const headers = { 'X-Workspace-Id': wsId }
      
      const [threadsRes, linkedinRes, bloggerRes] = await Promise.all([
        fetch(`${base}/api/auth/threads/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/linkedin/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/blogger/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false }))
      ])
      
      if (threadsRes) setThreadsCheck(threadsRes)
      if (linkedinRes) setLinkedinCheck(linkedinRes)
      if (bloggerRes) {
        setBloggerCheck(bloggerRes)
        if (bloggerRes.connected || bloggerRes.has_token) {
          loadBloggerBlogs(base, headers)
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
      if (['facebook', 'threads', 'linkedin', 'blogger'].includes(connectedParam)) {
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
      }
      
      if (endpoint) {
        const res = await fetch(endpoint, {
          headers: { 'X-Workspace-Id': workspaceId }
        })
        const data = await res.json()
        if (data.login_url) {
          window.location.href = data.login_url
        } else {
          throw new Error(`${platform} Login URL missing. Admin setup incomplete`)
        }
      }
    } catch (e) {
      setError(e.message || `${platform} connection failed`)
    } finally {
      setConnecting('')
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
        <p className="text-sm text-muted leading-relaxed">Ek click me connect karo — Facebook, Threads, LinkedIn, Blogger auto! Koi key ki zaroorat nahi.</p>
      </div>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-[13px] p-4 rounded-xl mb-4 flex items-start gap-3 backdrop-blur">
          <span className="text-red-400 mt-0.5">⚠️</span>
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
      </div>

      <div className="mt-8 p-4 bg-ink/40 border border-line/60 rounded-[12px]">
        <div className="flex gap-3">
          <span>🔒</span>
          <div>
            <div className="text-[12px] font-semibold text-offwhite">4 Platforms Active</div>
            <div className="text-[11.5px] text-muted/80 mt-1">Medium removed - API deprecated by Medium (403 error). Only Facebook, Threads, LinkedIn, Blogger active.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
