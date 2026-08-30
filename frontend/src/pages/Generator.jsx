import { useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'

const PLATFORM_OPTIONS = [
  { id: 'fb_page', label: 'Facebook' },
  { id: 'ig', label: 'Instagram' },
  { id: 'threads', label: 'Threads' },
  { id: 'linkedin_profile', label: 'LinkedIn' },
]

export default function Generator() {
  const [prompt, setPrompt] = usePersistentState('generator.prompt', '')
  const [platforms, setPlatforms] = usePersistentState('generator.platforms', ['fb_page', 'ig'])
  const [tone, setTone] = usePersistentState('generator.tone', 'professional')
  const [language, setLanguage] = usePersistentState('generator.language', 'roman_urdu')
  const [result, setResult] = usePersistentState('generator.result', null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copiedIdx, setCopiedIdx] = useState(null)

  const togglePlatform = (id) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || platforms.length === 0) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.generate({ prompt, platforms, tone, language })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const copyText = (text, idx) => {
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1500)
  }

  return (
    <div>
      <header className="mb-8">
        <div className="font-mono text-[11px] text-signal mb-1">01 · CONTENT</div>
        <h1 className="font-display font-bold text-2xl text-offwhite">Generate a post</h1>
        <p className="text-muted text-sm mt-1">
          Ek prompt do, local LLM teen variations banayega har platform ke liye.
        </p>
      </header>

      <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Eid ke liye 50% off sale on custom AI calling agents"
            rows={3}
            className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Platforms</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PLATFORM_OPTIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  platforms.includes(p.id)
                    ? 'bg-signal/15 border-signal text-signal'
                    : 'border-line text-muted hover:text-offwhite'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite outline-none focus:border-signal"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="urgent">Urgent / Sale</option>
              <option value="friendly">Friendly</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite outline-none focus:border-signal"
            >
              <option value="roman_urdu">Roman Urdu + English</option>
              <option value="english">English</option>
              <option value="urdu">Urdu</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim() || platforms.length === 0}
          className="w-full bg-signal text-ink font-semibold text-sm rounded-lg py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Generating…' : 'Generate variations'}
        </button>

        {error && <div className="text-coral text-sm font-mono">{error}</div>}
      </div>

      {result?.note && (
        <div className="mt-4 text-xs text-saffron font-mono bg-saffron/10 border border-saffron/30 rounded-lg px-3 py-2">
          {result.note}
        </div>
      )}

      {result?.variations && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {result.variations.map((v, idx) => (
            <div key={idx} className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-signal uppercase">{v.best_for || 'General'}</span>
                <button
                  onClick={() => copyText(v.caption, idx)}
                  className="text-[11px] text-muted hover:text-offwhite font-medium"
                >
                  {copiedIdx === idx ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-offwhite leading-relaxed">{v.caption}</p>
              <div className="flex flex-wrap gap-1.5">
                {(v.hashtags || []).map((h, i) => (
                  <span key={i} className="text-[11px] text-saffron font-mono">{h}</span>
                ))}
              </div>
              {v.image_prompt && (
                <div className="text-[11px] text-muted border-t border-line pt-2 mt-1">
                  <span className="text-muted/70">image idea:</span> {v.image_prompt}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
