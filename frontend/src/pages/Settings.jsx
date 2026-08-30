import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'

const GROUPS = [
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
  const [connected, setConnected] = useState({})
  const [form, setForm] = usePersistentState('settings.form', {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [substackRefreshing, setSubstackRefreshing] = useState(false)
  const [substackRefreshMsg, setSubstackRefreshMsg] = useState('')

  const load = async () => {
    try {
      setConnected(await api.getSettingsKeys())
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { load() }, [])

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    const filled = Object.fromEntries(Object.entries(form).filter(([, v]) => (v || '').trim() !== ''))
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

  return (
    <div>
      <header className="mb-8">
        <div className="font-mono text-[11px] text-signal mb-1">05 · CHANNELS</div>
        <h1 className="font-display font-bold text-2xl text-offwhite">API keys & connections</h1>
        <p className="text-muted text-sm mt-1">
          Ek baar keys save karo, hamesha yahan se hi connected rahenge — dobara <code className="text-saffron">.env</code> edit nahi karna padega.
        </p>
      </header>

      {error && <div className="text-coral text-sm font-mono mb-4">{error}</div>}

      <div className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group.label} className="bg-surface border border-line rounded-xl p-5">
            <h2 className="font-display font-semibold text-sm text-offwhite mb-3">{group.label}</h2>
            <div className="space-y-3">
              {group.fields.map((f) => (
                <div key={f.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-muted">{f.label}</label>
                    <span className={`flex items-center gap-1.5 text-[10px] font-mono ${connected[f.key] ? 'text-signal' : 'text-muted'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${connected[f.key] ? 'bg-signal pulse' : 'bg-line'}`} />
                      {connected[f.key] ? 'Connected' : 'Not set'}
                    </span>
                  </div>
                  <input
                    type="password"
                    value={form[f.key] ?? ''}
                    onChange={(e) => handleChange(f.key, e.target.value)}
                    placeholder="Enter your API key"
                    className="w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/50 outline-none focus:border-signal font-mono"
                  />
                </div>
              ))}
            </div>
            {group.id === 'substack' && (
              <div className="mt-4 pt-4 border-t border-line">
                <button
                  onClick={handleSubstackRefresh}
                  disabled={substackRefreshing}
                  className="text-xs font-medium text-signal border border-signal/40 rounded-lg px-3 py-1.5 hover:bg-signal/10 disabled:opacity-50"
                >
                  {substackRefreshing ? 'Refreshing…' : 'Refresh cookie now (email/password se)'}
                </button>
                {substackRefreshMsg && <span className="ml-3 text-xs text-signal">{substackRefreshMsg}</span>}
                <p className="text-[11px] text-muted mt-2">
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
          disabled={saving || Object.values(form).every((v) => !v?.trim())}
          className="w-full bg-signal text-ink font-semibold text-sm rounded-lg py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-glow"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save keys'}
        </button>
      </div>

      <div className="mt-6 bg-surface border border-line rounded-xl px-5 py-3.5 flex items-center justify-between">
        <span className="text-sm text-offwhite">Local LLM (Ollama)</span>
        <span className="text-xs font-mono text-muted">.env se control hota hai — OLLAMA_URL / LOCAL_MODEL</span>
      </div>
    </div>
  )
}
