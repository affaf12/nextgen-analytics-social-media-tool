import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// UPGRADED SECURE VERSION WITH MEDIUM - Only Connect Buttons, No Keys Shown!
// Facebook, Threads, LinkedIn, Blogger, Medium - sab ek click me!

export default function Settings() {
  const [connected, setConnected] = useState({})
  const [threadsCheck, setThreadsCheck] = useState({ connected: false })
  const [linkedinCheck, setLinkedinCheck] = useState({ connected: false })
  const [bloggerCheck, setBloggerCheck] = useState({ connected: false, has_token: false, has_blog: false })
  const [mediumCheck, setMediumCheck] = useState({ connected: false, has_token: false })
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
      
      const [threadsRes, linkedinRes, bloggerRes, mediumRes] = await Promise.all([
        fetch(`${base}/api/auth/threads/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/linkedin/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/blogger/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false })),
        fetch(`${base}/api/auth/medium/status`, { headers }).then(r => r.json()).catch(() => ({ connected: false }))
      ])
      
      if (threadsRes) setThreadsCheck(threadsRes)
      if (linkedinRes) setLinkedinCheck(linkedinRes)
      if (bloggerRes) {
        setBloggerCheck(bloggerRes)
        if (bloggerRes.connected || bloggerRes.has_token) {
          loadBloggerBlogs(base, headers)
        }
      }
      if (mediumRes) setMediumCheck(mediumRes)
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
      if (['facebook', 'threads', 'linkedin', 'blogger', 'medium'].includes(connectedParam)) {
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
      } else if (platform === 'medium') {
        endpoint = `${base}/api/auth/medium`
      }
      
      if (endpoint) {
        const res = await fetch(endpoint, {
          headers: { 'X-Workspace-Id': workspaceId }
        })
        const data = await res.json()
        if (data.login_url) {
          window.location.href = data.login_url
        } else {
          throw new Error(`${platform} Login URL missing. Admin setup incomplete: ${JSON.stringify(data).slice(0,100)}`)
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
  const isMediumConnected = mediumCheck.connected || mediumCheck.has_token || !!mediumCheck.user_id

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
        <p className="text-sm text-muted leading-relaxed">Ek click me connect karo — Facebook, Threads, LinkedIn, Blogger, Medium sab auto! Koi key ya token ki zaroorat nahi.</p>
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
                <p className="text-[12.5px] text-muted mt-1.5 leading-[1.5]">Page + Instagram Business ek saath connect honge. Auto posting enable hogi.</p>
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
                  : 'bg-[#1877F2] text-white hover:brightness-110 shadow-[0_4px_14px_rgba(24,119,242,0.35)] hover:shadow-[0_6px_20px_rgba(24,119,242,0.4)]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {connecting === 'facebook' ? '...' : isFbConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Threads */}
        <div className="group relative bg-surface border border-line hover:border-white/20 rounded-[16px] p-5 sm:p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(255,255,255,0.06)] hover:-translate-y-[1px]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-black border border-white/[0.08] rounded-[12px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                <span className="text-white font-bold text-[15px]">@</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Threads
                  {isThreadsConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.5)]" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5 leading-[1.5]">Threads.net account. Facebook se alag connect hota hai.</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border transition ${
                    isThreadsConnected 
                      ? 'bg-signal/10 text-signal border-signal/20' 
                      : 'bg-ink text-muted/80 border-line'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isThreadsConnected ? 'bg-signal' : 'bg-muted'}`} />
                    {isThreadsConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('threads')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-4 sm:px-5 py-2.5 transition-all duration-200 active:scale-[0.98] ${
                isThreadsConnected
                  ? 'bg-ink border border-line text-muted hover:border-white/20 hover:text-offwhite'
                  : 'bg-white text-black hover:bg-zinc-100 shadow-[0_4px_14px_rgba(255,255,255,0.2)]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {connecting === 'threads' ? '...' : isThreadsConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* LinkedIn */}
        <div className="group relative bg-surface border border-line hover:border-[#0A66C2]/40 rounded-[16px] p-5 sm:p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(10,102,194,0.12)] hover:-translate-y-[1px]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#0A66C2] rounded-[12px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(10,102,194,0.3)]">
                <span className="text-white font-black text-[13px] tracking-tighter">in</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  LinkedIn
                  {isLinkedinConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.5)]" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5 leading-[1.5]">Profile auto-connect. Company page approval pending (CAS-11821533).</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border transition ${
                    isLinkedinConnected 
                      ? 'bg-signal/10 text-signal border-signal/20' 
                      : 'bg-ink text-muted/80 border-line'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isLinkedinConnected ? 'bg-signal' : 'bg-muted'}`} />
                    {isLinkedinConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {isLinkedinConnected && linkedinCheck.profile_name && (
                    <span className="text-[11px] text-muted/80 truncate max-w-[140px]">{linkedinCheck.profile_name}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleConnect('linkedin')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-4 sm:px-5 py-2.5 transition-all duration-200 active:scale-[0.98] ${
                isLinkedinConnected
                  ? 'bg-ink border border-line text-muted hover:border-[#0A66C2]/30 hover:text-offwhite'
                  : 'bg-[#0A66C2] text-white hover:brightness-110 shadow-[0_4px_14px_rgba(10,102,194,0.35)]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {connecting === 'linkedin' ? '...' : isLinkedinConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Blogger */}
        <div className="group relative bg-surface border border-line hover:border-[#FF5722]/40 rounded-[16px] p-5 sm:p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(255,87,34,0.12)] hover:-translate-y-[1px] overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-[#FF5722]/10 to-transparent rounded-bl-[24px] pointer-events-none" />
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-[#FF5722] rounded-[12px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(255,87,34,0.3)]">
                <span className="text-white font-black text-[16px]">B</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5">
                  Blogger
                  {isBloggerConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.5)]" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5 leading-[1.5]">Google Blogger blog. Ek click me connect, auto posting.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border transition ${
                    isBloggerConnected 
                      ? 'bg-signal/10 text-signal border-signal/20' 
                      : 'bg-ink text-muted/80 border-line'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isBloggerConnected ? 'bg-signal' : 'bg-muted'}`} />
                    {isBloggerConnected ? 'Connected' : bloggerCheck.has_token ? 'Token OK • Select Blog' : 'Not Connected'}
                  </span>
                  {isBloggerConnected && bloggerCheck.blog_name && (
                    <span className="text-[11px] text-muted/70 truncate max-w-[130px]">{bloggerCheck.blog_name}</span>
                  )}
                </div>

                {isBloggerConnected && bloggerCheck.blog_name && (
                  <div className="mt-3 p-3 bg-ink/60 backdrop-blur border border-line rounded-[12px]">
                    <div className="text-[11px] font-semibold text-offwhite/90 uppercase tracking-wider mb-1">Active Blog</div>
                    <div className="text-[13px] font-medium text-offwhite truncate">{bloggerCheck.blog_name}</div>
                    {bloggerCheck.blog_url && (
                      <a href={bloggerCheck.blog_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#FF5722] hover:underline mt-1 inline-flex items-center gap-1">
                        {bloggerCheck.blog_url} ↗
                      </a>
                    )}
                    {bloggerBlogs.length > 1 && (
                      <div className="mt-2 space-y-1">
                        {bloggerBlogs.map(blog => (
                          <button
                            key={blog.id}
                            onClick={() => handleSelectBlog(blog)}
                            className={`w-full text-left text-[11px] p-2 rounded-[8px] border ${blog.id === bloggerCheck.blog_id ? 'bg-signal/10 border-signal/30 text-offwhite' : 'bg-surface border-line text-muted hover:border-[#FF5722]/30'}`}
                          >
                            {blog.name} {blog.id === bloggerCheck.blog_id && '✓'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => handleConnect('blogger')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-4 sm:px-5 py-2.5 transition-all duration-200 active:scale-[0.98] ${
                isBloggerConnected
                  ? 'bg-ink border border-line text-muted hover:border-[#FF5722]/30 hover:text-offwhite'
                  : 'bg-[#FF5722] text-white hover:brightness-110 shadow-[0_4px_14px_rgba(255,87,34,0.35)]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {connecting === 'blogger' ? '...' : isBloggerConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {/* Medium - NEW! */}
        <div className="group relative bg-surface border border-line hover:border-black/60 rounded-[16px] p-5 sm:p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:-translate-y-[1px] overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-black/[0.06] to-transparent rounded-bl-[24px] pointer-events-none" />
          <div className="absolute top-3.5 right-3.5">
            <span className="text-[10px] font-bold tracking-wider bg-black text-white px-2 py-1 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.3)]">NEW</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-11 h-11 bg-black rounded-[12px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.3)] border border-white/10">
                <span className="text-white font-black text-[18px]">M</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[14px] text-offwhite flex items-center gap-2.5 pr-12">
                  Medium
                  {isMediumConnected && <span className="w-2 h-2 bg-signal rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.5)]" />}
                </h2>
                <p className="text-[12.5px] text-muted mt-1.5 leading-[1.5]">Medium.com stories. Ek click me connect, auto article publishing.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border transition ${
                    isMediumConnected 
                      ? 'bg-signal/10 text-signal border-signal/20' 
                      : 'bg-ink text-muted/80 border-line'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isMediumConnected ? 'bg-signal' : 'bg-muted'}`} />
                    {isMediumConnected ? 'Connected' : 'Not Connected'}
                  </span>
                  {isMediumConnected && mediumCheck.username && (
                    <span className="text-[11px] text-muted/70">@{mediumCheck.username}</span>
                  )}
                  {isMediumConnected && mediumCheck.profile_name && (
                    <span className="text-[11px] text-muted/60 truncate max-w-[100px]">{mediumCheck.profile_name}</span>
                  )}
                </div>
                {isMediumConnected && mediumCheck.user_url && (
                  <div className="mt-2">
                    <a href={mediumCheck.user_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted hover:text-offwhite underline">
                      {mediumCheck.user_url} ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => handleConnect('medium')}
              disabled={!!connecting}
              className={`shrink-0 font-semibold text-[12.5px] rounded-[10px] px-4 sm:px-5 py-2.5 transition-all duration-200 active:scale-[0.98] ${
                isMediumConnected
                  ? 'bg-ink border border-line text-muted hover:border-black/30 hover:text-offwhite'
                  : 'bg-black text-white hover:bg-zinc-900 border border-white/10 shadow-[0_4px_14px_rgba(0,0,0,0.25)]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {connecting === 'medium' ? '...' : isMediumConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>
      </div>

      {/* Security Note */}
      <div className="mt-8 p-4 bg-ink/40 border border-line/60 rounded-[12px] backdrop-blur">
        <div className="flex gap-3">
          <span className="text-[14px] mt-0.5">🔒</span>
          <div>
            <div className="text-[12px] font-semibold text-offwhite tracking-tight">100% Secure & Private</div>
            <div className="text-[11.5px] text-muted/80 mt-1 leading-[1.6]">
              Tumhari koi bhi API key, secret, token yahan show nahi hota. Sab encrypted DB me safe hai. Sirf <b className="text-offwhite/70">Connected / Not Connected</b> dikhta hai. Medium, Blogger, LinkedIn sab one-click OAuth!
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <div className="text-[11px] text-muted/50">NextGen Analytics • 5 platforms • No keys exposed</div>
      </div>
    </div>
  )
}
