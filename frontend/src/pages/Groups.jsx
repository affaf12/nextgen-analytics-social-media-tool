import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const GROUP_PLATFORM_OPTIONS = [
  { id: 'fb_group', label: 'Facebook Group (via Page)' },
  { id: 'linkedin_group', label: 'LinkedIn Group (via Profile)' },
]

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [groupsError, setGroupsError] = useState('')

  const [newPlatform, setNewPlatform] = useState('fb_group')
  const [newName, setNewName] = useState('')
  const [newLink, setNewLink] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

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
      await loadGroups()
    } catch (e) {
      setGroupsError(e.message)
    }
  }

  const platformLabel = (id) => GROUP_PLATFORM_OPTIONS.find((p) => p.id === id)?.label || id

  return (
    <div>
      <header className="mb-8">
        <div className="font-mono text-[11px] text-signal mb-1">05 - GROUPS</div>
        <h1 className="font-display font-bold text-2xl text-offwhite">Connected groups</h1>
        <p className="text-muted text-sm mt-1">
          Group ka naam aur link daal kar connect karo. Post karne ke liye Broadcast page par jao —
          wahan channels ke saath ye connected groups bhi select ho sakenge.
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
      <div className="bg-surface border border-line rounded-xl p-5 space-y-3">
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
              <div className="min-w-0">
                <div className="text-sm text-offwhite font-medium truncate">{g.name}</div>
                <div className="text-[11px] text-muted font-mono truncate">
                  {platformLabel(g.platform)} · <a href={g.link} target="_blank" rel="noreferrer" className="underline">{g.link}</a>
                </div>
              </div>
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
    </div>
  )
}
