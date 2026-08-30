import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'

const STATUS_DOT = {
  pending: 'bg-saffron',
  processing: 'bg-signal animate-pulse',
  published: 'bg-signal',
  failed: 'bg-coral',
  cancelled: 'bg-line',
}

const STATUS_LABEL = {
  pending: 'Pending',
  processing: 'Sending…',
  published: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function buildMonthGrid(viewDate) {
  const first = startOfMonth(viewDate)
  const startWeekday = first.getDay() // 0 = Sun
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), d))
  return cells
}

export default function Calendar() {
  const [viewMode, setViewMode] = useState('month') // 'day' | 'month' | 'year'
  const [viewDate, setViewDate] = useState(new Date())
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setPosts(await api.getScheduled())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const cells = useMemo(() => buildMonthGrid(viewDate), [viewDate])

  const postsByDay = useMemo(() => {
    const map = {}
    posts.forEach((p) => {
      if (!p.scheduled_at) return
      // Local date se group karo (UTC string slice karne se raat 12 baje ke aas paas
      // ghalat din pe post dikh sakti thi)
      const d = new Date(p.scheduled_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      map[key] = map[key] || []
      map[key].push(p)
    })
    return map
  }, [posts])

  const postsByMonth = useMemo(() => {
    const map = {}
    posts.forEach((p) => {
      if (!p.scheduled_at) return
      const d = new Date(p.scheduled_at)
      if (d.getFullYear() !== viewDate.getFullYear()) return
      const m = d.getMonth()
      map[m] = (map[m] || 0) + 1
    })
    return map
  }, [posts, viewDate])

  const dayKey = (d) => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const handleDelete = async (id) => {
    setPosts((prev) => prev.filter((p) => p.id !== id))
    try {
      await api.deleteScheduled(id)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setError('')
    try {
      if (viewMode === 'day') {
        const d = selectedDay || viewDate
        await api.exportScheduledCsv({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() })
      } else if (viewMode === 'month') {
        await api.exportScheduledCsv({ year: viewDate.getFullYear(), month: viewDate.getMonth() + 1 })
      } else {
        await api.exportScheduledCsv({ year: viewDate.getFullYear() })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }

  const handleExportAll = async () => {
    setExporting(true)
    setError('')
    try {
      await api.exportScheduledCsv()
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }

  const shiftPeriod = (dir) => {
    if (viewMode === 'day') {
      const d = new Date(selectedDay || viewDate)
      d.setDate(d.getDate() + dir)
      setSelectedDay(d)
      setViewDate(d)
    } else if (viewMode === 'month') {
      setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1))
    } else {
      setViewDate(new Date(viewDate.getFullYear() + dir, viewDate.getMonth(), 1))
    }
  }

  const periodLabel =
    viewMode === 'day' ? (selectedDay || viewDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) :
    viewMode === 'month' ? viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }) :
    String(viewDate.getFullYear())

  const upcoming = posts
    .filter((p) => p.status === 'pending' || p.status === 'processing')
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
  const recent = posts
    .filter((p) => p.status === 'published' || p.status === 'failed')
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at))
    .slice(0, 20)
  const selectedPosts = selectedDay ? postsByDay[dayKey(selectedDay)] || [] : []
  const dayViewPosts = viewMode === 'day' ? (postsByDay[dayKey(selectedDay || viewDate)] || []) : []

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] text-signal mb-1">03 · CALENDAR</div>
          <h1 className="font-display font-bold text-2xl text-offwhite">Scheduled posts</h1>
          <p className="text-muted text-sm mt-1">Future date/time par jo posts lagayi hain, sab yahan.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAll}
            disabled={exporting}
            className="text-xs font-medium text-muted hover:text-offwhite border border-line rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export all (CSV)'}
          </button>
        </div>
      </header>

      {error && <div className="text-coral text-sm font-mono mb-4">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 bg-surface border border-line rounded-lg p-1">
          {['day', 'month', 'year'].map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md capitalize transition ${
                viewMode === m ? 'bg-signal text-ink' : 'text-muted hover:text-offwhite'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftPeriod(-1)}
            className="w-8 h-8 rounded-lg border border-line text-muted hover:text-offwhite hover:border-signal"
          >‹</button>
          <span className="text-sm font-medium text-offwhite w-48 text-center">{periodLabel}</span>
          <button
            onClick={() => shiftPeriod(1)}
            className="w-8 h-8 rounded-lg border border-line text-muted hover:text-offwhite hover:border-signal"
          >›</button>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="text-xs font-medium text-signal border border-signal/40 rounded-lg px-3 py-1.5 hover:bg-signal/10 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : `Download ${viewMode} report (CSV)`}
        </button>
      </div>

      {viewMode === 'year' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
          {MONTH_NAMES.map((name, idx) => (
            <button
              key={name}
              onClick={() => { setViewDate(new Date(viewDate.getFullYear(), idx, 1)); setViewMode('month') }}
              className="rounded-lg border border-line hover:border-signal/50 p-3 text-left transition"
            >
              <div className="text-sm font-medium text-offwhite">{name}</div>
              <div className="text-[11px] text-muted mt-1">{postsByMonth[idx] || 0} posts</div>
            </button>
          ))}
        </div>
      )}

      {viewMode === 'month' && (
        <>
          <div className="grid grid-cols-7 gap-1.5 mb-6">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-[11px] text-muted text-center font-mono py-1">{d}</div>
            ))}
            {cells.map((d, idx) => {
              const key = dayKey(d)
              const dayPosts = d ? postsByDay[key] || [] : []
              const isToday = d && new Date().toDateString() === d.toDateString()
              const isSelected = d && selectedDay && d.toDateString() === selectedDay.toDateString()
              return (
                <button
                  key={idx}
                  disabled={!d}
                  onClick={() => { setSelectedDay(d); }}
                  onDoubleClick={() => { if (d) { setSelectedDay(d); setViewMode('day') } }}
                  className={`aspect-square rounded-lg border text-xs flex flex-col items-center justify-center gap-1 transition ${
                    !d ? 'border-transparent' :
                    isSelected ? 'border-signal bg-signal/10' :
                    isToday ? 'border-saffron/50' : 'border-line hover:border-signal/50'
                  }`}
                >
                  {d && <span className={isToday ? 'text-saffron' : 'text-offwhite'}>{d.getDate()}</span>}
                  {dayPosts.length > 0 && (
                    <div className="flex gap-0.5">
                      {dayPosts.slice(0, 3).map((p, i) => (
                        <span key={i} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[p.status]}`} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted -mt-4 mb-6">Kisi din par double-click karo us din ka Day view kholne ke liye.</p>

          {selectedDay && selectedPosts.length > 0 && (
            <div className="mb-6">
              <div className="text-xs font-medium text-muted uppercase mb-2">
                {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <div className="space-y-2">
                {selectedPosts.map((p) => <PostCard key={p.id} post={p} onDelete={handleDelete} />)}
              </div>
            </div>
          )}
        </>
      )}

      {viewMode === 'day' && (
        <div className="mb-6">
          {dayViewPosts.length === 0 ? (
            <div className="text-muted text-sm">Is din koi post nahi hai.</div>
          ) : (
            <div className="space-y-2">
              {dayViewPosts.map((p) => <PostCard key={p.id} post={p} onDelete={handleDelete} />)}
            </div>
          )}
        </div>
      )}

      {viewMode !== 'day' && (
        <>
          <div>
            <div className="text-xs font-medium text-muted uppercase mb-2">Upcoming</div>
            {loading ? (
              <div className="text-muted text-sm font-mono">Loading…</div>
            ) : upcoming.length === 0 ? (
              <div className="text-muted text-sm">Koi post schedule nahi hai. Broadcast page se "Schedule for later" use karo.</div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((p) => <PostCard key={p.id} post={p} onDelete={handleDelete} />)}
              </div>
            )}
          </div>

          {recent.length > 0 && (
            <div className="mt-8">
              <div className="text-xs font-medium text-muted uppercase mb-2">Recent activity (bheji ja chuki posts)</div>
              <div className="space-y-2">
                {recent.map((p) => <PostCard key={p.id} post={p} onDelete={handleDelete} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PostCard({ post, onDelete }) {
  const isDone = post.status === 'published' || post.status === 'failed'
  return (
    <div className="bg-surface border border-line rounded-lg p-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[post.status]}`} />
          <span className="text-xs font-mono text-muted uppercase">{STATUS_LABEL[post.status] || post.status}</span>
          <span className="text-[11px] text-muted">{new Date(post.scheduled_at).toLocaleString()}</span>
        </div>
        <p className="text-sm text-offwhite mt-1 truncate">{post.caption}</p>

        {isDone && post.result && Object.keys(post.result).length > 0 ? (
          // Post bhej di ja chuki hai — ab har platform ka apna result (kamyab/nakam) dikhao,
          // taake pata chale exactly kis waqt, kaunse platform par post gayi ya nahi
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {Object.entries(post.result).map(([pl, r]) => {
              const ok = r?.status === 'published'
              return (
                <span
                  key={pl}
                  title={ok ? 'Published' : (r?.detail ? JSON.stringify(r.detail).slice(0, 140) : 'Error')}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    ok ? 'text-signal border-signal/40 bg-signal/10' : 'text-coral border-coral/40 bg-coral/10'
                  }`}
                >
                  {ok ? '✓' : '✗'} {pl}
                </span>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {post.platforms.map((pl) => (
              <span key={pl} className="text-[10px] font-mono text-saffron">{pl}</span>
            ))}
          </div>
        )}

        {isDone && (
          <div className="text-[10px] text-muted mt-1">
            {new Date(post.scheduled_at).toLocaleString()} ke schedule ke mutabiq bheji gayi
          </div>
        )}
      </div>
      <button
        onClick={() => onDelete(post.id)}
        className="text-[11px] text-muted hover:text-coral font-medium shrink-0"
      >
        {post.status === 'pending' ? 'Cancel' : 'Delete'}
      </button>
    </div>
  )
}
