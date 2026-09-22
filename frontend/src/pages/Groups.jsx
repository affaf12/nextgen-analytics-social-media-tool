import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState } from '../lib/usePersistentState.js'

const GROUP_PLATFORM_OPTIONS = [
  { id: 'fb_group', label: 'Facebook Group (via Page)' },
  { id: 'linkedin_group', label: 'LinkedIn Group (via Profile)' },
]

function defaultScheduleValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setSeconds(0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getTimezoneList() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone')
    }
  } catch {}
  return [
    'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
    'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo',
    'Atlantic/Azores', 'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai',
    'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Jakarta',
    'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Perth',
    'Australia/Sydney', 'Pacific/Auckland',
  ]
}

function zonedTimeToUtcIso(dateTimeLocalStr, timeZone) {
  const [datePart, timePart] = dateTimeLocalStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const asUTC = Date.UTC(year, month - 1, day, hour, minute)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(asUTC))
  const map = {}
  parts.forEach((p) => { map[p.type] = p.value })
  const tzHour = map.hour === '24' ? 0 : Number(map.hour)
  const asTZ = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), tzHour, Number(map.minute), Number(map.second))
  const offset = asTZ - asUTC
  return new Date(asUTC - offset).toISOString()
}

const TIMEZONE_LIST = getTimezoneList()
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export default function Groups() {
  // connected groups
  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [groupsError, setGroupsError] = useState('')

  // connect-a-group form
  const [newPlatform, setNewPlatform] = useState('fb_group')
  const [newName, setNewName] = useState('')
  const [newLink, setNewLink] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  // post form
  const [selectedGroupIds, setSelectedGroupIds] = usePersistentState('groups.selectedGroupIds', [])
  const [caption, setCaption] = usePersistentState('groups.caption', '')
  const [link, setLink] = usePersistentState('groups.link', '')
  const [mediaUrl, setMediaUrl] = usePersistentState('groups.mediaUrl', '')
  const [mediaType, setMediaType] = usePersistentState('groups.mediaType', null)
  const [mediaHostWarning, setMediaHostWarning] = useState('')
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = usePersistentState('groups.mode', 'now')
  const [scheduleAt, setScheduleAt] = usePersistentState('groups.scheduleAt', defaultScheduleValue())
  const [timezone, setTimezone] = usePersistentState('groups.timezone', BROWSER_TIMEZONE)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')
  const [postResults, setPostResults] = useState(null)
  const [scheduled, setScheduled] = useState(null)
  const fileRef = useRef(null)

  const loadGroups = async () => {
    setGroupsLoading(true)
    setGroupsError('')
    try {
      const res = await api.listGroups()
      setGroups(res.groups || res || [])
    } catch (e) {
      setGroupsError(e.message)
    } finally {
      setGroupsLoading(false)
    }
  }

  useEffect(() => {
    loadGroups()
  }, [])

  const handleConnect = async () => {
    if (!newName.trim() || !newLink.trim()) return
    setConnecting(true)
    setConnectError('')
    try {
      await api.createGroup({ platform: newPlatform, name: newName.trim(), link: newLink.trim() })
      setNewName('')
      setNewLink('')
      await loadGroups()
    } catch (e) {
      setConnectError(e.message)
    } finally {
      setConnecting(false)
    }
  }

  const handleDeleteGroup = async (id) => {
    try {
      await api.deleteGroup(id)
      setSelectedGroupIds((prev) => prev.filter((gid) => gid !== id))
      await loadGroups()
    } catch (e) {
      setGroupsError(e.message)
    }
  }

  const toggleGroupSelected = (id) => {
    setSelectedGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setPostError('')
    setMediaHostWarning('')
    try {
      const res = await api.uploadMedia(file)
      setMediaUrl(res.url)
      setMediaType(res.type)
      if (res.hosted_on === 'local') {
        setMediaHostWarning(res.warning || 'Free public hosting fail hui — ye URL group post ke liye kaam nahi karega.')
      }
    } catch (err) {
      setPostError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const clearMedia = () => {
    setMediaUrl('')
    setMediaType(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handlePost = async () => {
    if (!caption.trim() || selectedGroupIds.length === 0) return
    setPosting(true)
    setPostError('')
    setPostResults(null)
    setScheduled(null)
    try {
      const payload = {
        group_ids: selectedGroupIds,
        caption,
        link,
        media_urls: mediaUrl ? [mediaUrl] : [],
      }
      if (mode === 'now') {
        const res = await api.postToGroups(payload)
        setPostResults(res.published || res.results || res)
      } else {
        const iso = zonedTimeToUtcIso(scheduleAt, timezone)
        const res = await api.scheduleGroupPost({ ...payload, scheduled_at: iso })
        setScheduled(res)
      }
      setTimeout(() => {
        setCaption('')
        setLink('')
        setMediaUrl('')
        setMediaType(null)
      }, 2000)
    } catch (e) {
      setPostError(e.message)
    } finally {
      setPosting(false)
    }
  }

  const platformLabel = (id) => GROUP_PLATFORM_OPTIONS.find((p) => p.id === id)?.label || id

  return (
    <div>
      <header className="mb-8">
        <div className="font-mono text-[11px] text-signal mb-1">05 - GROUPS</div>
        <h1 className="font-display font-bold text-2xl text-offwhite">Post to groups</h1>
        <p className="text-muted text-sm mt-1">
          Group ka naam aur link daal kar connect karo, phir wahi se seedha group mein post karo — text, image, video ya link, abhi ya schedule karke.
        </p>
      </header>

      {/* Connect a group */}
      <div className="bg-surface border border-line rounded-xl p-5 space-y-4 mb-6">
        <h2 className="text-xs font-bold text-offwhite uppercase tracking-wide">Connect a group</h2>
        <div className="flex flex-wrap gap-2">
          {GROUP_PLATFORM_OPTIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => setNewPlatform(p.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                newPlatform === p.id
                  ? 'bg-signal/15 border-signal text-signal'
                  : 'border-line text-muted hover:text-offwhite'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Group name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Karachi Startup Founders"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">Group link</label>
            <input
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="https://facebook.com/groups/... ya LinkedIn group URL"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
          </div>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting || !newName.trim() || !newLink.trim()}
          className="bg-signal text-ink font-semibold text-sm rounded-lg px-4 py-2 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {connecting ? 'Connecting...' : 'Connect group'}
        </button>
        {connectError && <div className="text-coral text-sm font-mono bg-coral/10 border border-coral/20 p-3 rounded-lg">{connectError}</div>}
      </div>

      {/* Connected groups list */}
      <div className="bg-surface border border-line rounded-xl p-5 space-y-3 mb-6">
        <h2 className="text-xs font-bold text-offwhite uppercase tracking-wide">
          Connected groups {groups.length > 0 && <span className="text-signal">({groups.length})</span>}
        </h2>
        {groupsLoading && <p className="text-sm text-muted">Loading...</p>}
        {groupsError && <div className="text-coral text-sm font-mono bg-coral/10 border border-coral/20 p-3 rounded-lg">{groupsError}</div>}
        {!groupsLoading && groups.length === 0 && !groupsError && (
          <p className="text-sm text-muted">Abhi koi group connect nahi kiya. Upar se ek connect karo.</p>
        )}
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 bg-ink border border-line rounded-lg px-3 py-2.5">
              <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(g.id)}
                  onChange={() => toggleGroupSelected(g.id)}
                  className="accent-signal shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-sm text-offwhite font-medium truncate">{g.name}</div>
                  <div className="text-[11px] text-muted font-mono truncate">
                    {platformLabel(g.platform)} · <a href={g.link} target="_blank" rel="noreferrer" className="underline">{g.link}</a>
                  </div>
                </div>
              </label>
              <button
                onClick={() => handleDeleteGroup(g.id)}
                className="text-[12px] font-medium text-muted hover:text-coral transition-colors shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Post to selected groups */}
      <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
        <h2 className="text-xs font-bold text-offwhite uppercase tracking-wide">
          Post to selected groups {selectedGroupIds.length > 0 && <span className="text-signal">({selectedGroupIds.length} selected)</span>}
        </h2>

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Caption / text</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            placeholder="Group mein jo text post hoga"
            className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none resize-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Link <span className="text-muted/60 normal-case">(optional)</span></label>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Media (image / video)</label>
          <div className="mt-2 flex items-center gap-3">
            <label className="cursor-pointer text-xs font-medium bg-ink border border-line rounded-lg px-3 py-2 text-offwhite hover:border-signal transition">
              {uploading ? 'Uploading...' : 'Choose file'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading}
              />
            </label>
            {mediaUrl && (
              <span className="text-[11px] text-signal font-mono flex items-center gap-2">
                {mediaType} attached
                <button onClick={clearMedia} className="text-muted hover:text-coral">X</button>
              </span>
            )}
          </div>
          {mediaType === 'image' && mediaUrl && (
            <img src={mediaUrl} alt="preview" className="mt-3 max-h-40 rounded-lg border border-line" />
          )}
          {mediaType === 'video' && mediaUrl && (
            <video src={mediaUrl} controls className="mt-3 max-h-40 rounded-lg border border-line" />
          )}
          {mediaHostWarning && (
            <p className="text-[11px] text-coral mt-1 font-medium">Warning: {mediaHostWarning}</p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">When</label>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button
              onClick={() => setMode('now')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                mode === 'now' ? 'bg-signal/15 border-signal text-signal' : 'border-line text-muted'
              }`}
            >
              Publish now
            </button>
            <button
              onClick={() => setMode('schedule')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                mode === 'schedule' ? 'bg-signal/15 border-signal text-signal' : 'border-line text-muted'
              }`}
            >
              Schedule for later
            </button>
            {mode === 'schedule' && (
              <>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="bg-ink border border-line rounded-lg px-3 py-1.5 text-sm text-offwhite outline-none focus:border-signal"
                />
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="bg-ink border border-line rounded-lg px-3 py-1.5 text-sm text-offwhite outline-none focus:border-signal max-w-[220px]"
                >
                  {TIMEZONE_LIST.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        <button
          onClick={handlePost}
          disabled={posting || uploading || !caption.trim() || selectedGroupIds.length === 0}
          className="w-full bg-signal text-ink font-semibold text-sm rounded-lg py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {posting
            ? mode === 'now' ? 'Posting...' : 'Scheduling...'
            : mode === 'now'
              ? `Post to ${selectedGroupIds.length} group${selectedGroupIds.length === 1 ? '' : 's'}`
              : `Schedule for ${selectedGroupIds.length} group${selectedGroupIds.length === 1 ? '' : 's'}`}
        </button>
        {selectedGroupIds.length === 0 && (
          <p className="text-[11px] text-coral">Kam se kam ek connected group select karo</p>
        )}
        {postError && <div className="text-coral text-sm font-mono bg-coral/10 border border-coral/20 p-3 rounded-lg">{postError}</div>}
      </div>

      {scheduled && (
        <div className="mt-6 rounded-lg border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          Scheduled — {new Date(scheduled.scheduled_at).toLocaleString()} ko {selectedGroupIds.length} group(s) mein chala jayega.
        </div>
      )}

      {postResults && (
        <div className="mt-6 space-y-3">
          <h3 className="text-xs font-bold text-offwhite uppercase tracking-wide">Post Results:</h3>
          {Object.entries(postResults).map(([groupId, res]) => {
            const isSuccess = res.status === 'published' || res.success
            const group = groups.find((g) => String(g.id) === String(groupId))
            return (
              <div
                key={groupId}
                className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 ${isSuccess ? 'bg-signal/10 border-signal/30' : 'bg-coral/10 border-coral/30'}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-xs uppercase font-bold text-offwhite">{group?.name || groupId}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isSuccess ? 'bg-signal text-ink' : 'bg-coral text-white'}`}>
                      {isSuccess ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </div>
                  <div className="text-xs mt-2 leading-relaxed">
                    <div className={isSuccess ? 'text-signal' : 'text-coral'}>
                      {res.message || res.error || (isSuccess ? 'Posted successfully' : 'Failed')}
                    </div>
                    {res.url && (
                      <a href={res.url} target="_blank" rel="noreferrer" className="mt-2 block text-[11px] text-signal underline font-mono break-all">
                        {res.url}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
