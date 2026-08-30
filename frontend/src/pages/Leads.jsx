import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'

const STATUSES = ['New', 'Contacted', 'Qualified', 'Customer', 'Lost']

const STATUS_DOT = {
  New: 'bg-signal',
  Contacted: 'bg-saffron',
  Qualified: 'bg-signal',
  Customer: 'bg-green-400',
  Lost: 'bg-coral',
}

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = usePersistentState('leads.form', { name: '', source_post: '', platform: 'instagram' })
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [leadsRes, statsRes] = await Promise.all([api.getLeads(), api.getStats()])
      setLeads(leadsRes)
      setStats(statsRes)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      await api.createLead({ ...form, status: 'New', ai_score: 50 })
      setForm({ name: '', source_post: '', platform: 'instagram' })
      setShowForm(false)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleStatusChange = async (id, status) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
    try {
      await api.updateLead(id, { status })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDelete = async (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id))
    try {
      await api.deleteLead(id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <header className="mb-6 flex items-start justify-between">
        <div>
          <div className="font-mono text-[11px] text-signal mb-1">03 · LEADS</div>
          <h1 className="font-display font-bold text-2xl text-offwhite">Pipeline</h1>
          <p className="text-muted text-sm mt-1">Jo bhi social post se lead aaye, yahan track karo.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-signal text-ink font-semibold text-sm rounded-lg px-4 py-2 hover:brightness-110 transition shrink-0"
        >
          + Add lead
        </button>
      </header>

      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-surface border border-line rounded-lg px-4 py-3">
            <div className="text-[11px] text-muted uppercase">Total leads</div>
            <div className="font-display text-xl text-offwhite mt-0.5">{stats.total}</div>
          </div>
          <div className="bg-surface border border-line rounded-lg px-4 py-3">
            <div className="text-[11px] text-muted uppercase">Avg AI score</div>
            <div className="font-display text-xl text-offwhite mt-0.5">{stats.avg_score}</div>
          </div>
          <div className="bg-surface border border-line rounded-lg px-4 py-3">
            <div className="text-[11px] text-muted uppercase">Customers</div>
            <div className="font-display text-xl text-offwhite mt-0.5">{stats.by_status?.Customer || 0}</div>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="bg-surface border border-line rounded-xl p-4 mb-6 grid sm:grid-cols-4 gap-3">
          <input
            required
            placeholder="Lead / business name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite outline-none focus:border-signal"
          />
          <input
            placeholder="Source post"
            value={form.source_post}
            onChange={(e) => setForm({ ...form, source_post: e.target.value })}
            className="bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite outline-none focus:border-signal"
          />
          <select
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
            className="bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite outline-none focus:border-signal"
          >
            <option value="instagram">Instagram</option>
            <option value="fb_page">Facebook</option>
            <option value="linkedin">LinkedIn</option>
            <option value="threads">Threads</option>
          </select>
          <button type="submit" className="bg-signal text-ink font-semibold text-sm rounded-lg py-2 hover:brightness-110 transition">
            Save lead
          </button>
        </form>
      )}

      {error && <div className="text-coral text-sm font-mono mb-4">{error}</div>}
      {loading ? (
        <div className="text-muted text-sm font-mono">Loading pipeline…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {STATUSES.map((status) => (
            <div key={status} className="min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                <span className="text-xs font-semibold text-offwhite uppercase tracking-wide">{status}</span>
                <span className="text-[11px] text-muted font-mono">
                  {leads.filter((l) => l.status === status).length}
                </span>
              </div>
              <div className="space-y-2">
                {leads.filter((l) => l.status === status).map((lead) => (
                  <div key={lead.id} className="bg-surface border border-line rounded-lg p-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-offwhite">{lead.name}</div>
                      <button
                        onClick={() => handleDelete(lead.id)}
                        className="text-muted hover:text-coral text-xs opacity-0 group-hover:opacity-100 transition"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="text-[11px] text-muted mt-1">{lead.source_post || '—'}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] font-mono text-saffron">{lead.platform}</span>
                      <span className="text-[11px] font-mono text-signal">{lead.ai_score}%</span>
                    </div>
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                      className="mt-2 w-full bg-ink border border-line rounded px-2 py-1 text-[11px] text-offwhite outline-none focus:border-signal"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
