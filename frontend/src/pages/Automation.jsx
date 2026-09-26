import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const PLATFORM_OPTIONS = [
  { id: 'fb_page', label: 'Facebook Page' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'both', label: 'Dono' },
]

export default function Automation() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [platform, setPlatform] = useState('both')
  const [triggerType, setTriggerType] = useState('any_comment')
  const [keyword, setKeyword] = useState('')
  const [aiInstruction, setAiInstruction] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const loadRules = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.listAutomationRules()
      setRules(res.rules || res || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRules()
  }, [])

  const handleCreate = async () => {
    if (!aiInstruction.trim()) return
    if (triggerType === 'keyword' && !keyword.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      await api.createAutomationRule({
        platform,
        trigger_type: triggerType,
        keyword: triggerType === 'keyword' ? keyword.trim() : '',
        ai_instruction: aiInstruction.trim(),
      })
      setKeyword('')
      setAiInstruction('')
      await loadRules()
    } catch (e) {
      setCreateError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (rule) => {
    try {
      await api.updateAutomationRule(rule.id, { active: !rule.active })
      await loadRules()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteAutomationRule(id)
      await loadRules()
    } catch (e) {
      setError(e.message)
    }
  }

  const platformLabel = (id) => PLATFORM_OPTIONS.find((p) => p.id === id)?.label || id

  return (
    <div>
      <header className="mb-8">
        <div className="font-mono text-[11px] text-signal mb-1">06 - AUTOMATION</div>
        <h1 className="font-display font-bold text-2xl text-offwhite">Comment → AI DM</h1>
        <p className="text-muted text-sm mt-1">
          Jab koi tumhari Facebook Page ya Instagram post par comment kare, AI usay padh kar
          seedha uske DM mein reply bhej dega — tumhare diye hue instruction ke mutabiq.
        </p>
      </header>

      {/* Create rule */}
      <div className="bg-surface border border-line rounded-xl p-5 space-y-4 mb-6">
        <h2 className="text-xs font-bold text-offwhite uppercase tracking-wide">Naya rule banao</h2>

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Platform</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PLATFORM_OPTIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  platform === p.id
                    ? 'bg-signal/15 border-signal text-signal'
                    : 'border-line text-muted hover:text-offwhite'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Kis comment par chale</label>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() => setTriggerType('any_comment')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                triggerType === 'any_comment' ? 'bg-signal/15 border-signal text-signal' : 'border-line text-muted'
              }`}
            >
              Har comment par
            </button>
            <button
              onClick={() => setTriggerType('keyword')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                triggerType === 'keyword' ? 'bg-signal/15 border-signal text-signal' : 'border-line text-muted'
              }`}
            >
              Specific keyword ho to
            </button>
          </div>
          {triggerType === 'keyword' && (
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="jaise: price, link, kitna paisa"
              className="mt-3 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">
            AI ko instruction do <span className="text-muted/60 normal-case">(kis tarah reply likhe)</span>
          </label>
          <textarea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            rows={4}
            placeholder="jaise: Friendly tone mein reply do, hamesha hamara WhatsApp number 03xx-xxxxxxx mention karo, aur poocho ke customer kis product mein interested hai."
            className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none resize-none"
          />
          <p className="text-[11px] text-muted mt-1">
            AI har comment ke actual text ko dekh kar, isi instruction ke mutabiq har baar naya reply banayega.
          </p>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating || !aiInstruction.trim() || (triggerType === 'keyword' && !keyword.trim())}
          className="bg-signal text-ink font-semibold text-sm rounded-lg px-4 py-2 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {creating ? 'Bana raha hoon...' : 'Rule banao'}
        </button>
        {createError && <div className="text-coral text-sm font-mono bg-coral/10 border border-coral/20 p-3 rounded-lg">{createError}</div>}
      </div>

      {/* Rules list */}
      <div className="bg-surface border border-line rounded-xl p-5 space-y-3">
        <h2 className="text-xs font-bold text-offwhite uppercase tracking-wide">
          Active rules {rules.length > 0 && <span className="text-signal">({rules.length})</span>}
        </h2>
        {loading && <p className="text-sm text-muted">Loading...</p>}
        {error && <div className="text-coral text-sm font-mono bg-coral/10 border border-coral/20 p-3 rounded-lg">{error}</div>}
        {!loading && rules.length === 0 && !error && (
          <p className="text-sm text-muted">Abhi koi rule nahi bana. Upar se ek bana lo.</p>
        )}
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 bg-ink border border-line rounded-lg px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold font-mono bg-surface2 px-1.5 py-0.5 rounded">
                    {platformLabel(r.platform)}
                  </span>
                  <span className="text-[11px] text-muted">
                    {r.trigger_type === 'any_comment' ? 'Har comment par' : `Keyword: "${r.keyword}"`}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${r.active ? 'bg-signal/20 text-signal' : 'bg-muted/20 text-muted'}`}>
                    {r.active ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="text-sm text-offwhite mt-2">{r.ai_instruction}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => handleToggleActive(r)}
                  className="text-[12px] font-medium text-muted hover:text-signal transition-colors"
                >
                  {r.active ? 'Turn off' : 'Turn on'}
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-[12px] font-medium text-muted hover:text-coral transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
