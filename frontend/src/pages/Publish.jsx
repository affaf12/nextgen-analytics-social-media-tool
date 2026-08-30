import { useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { usePersistentState, clearPersistentState } from '../lib/usePersistentState.js'

const PLATFORM_OPTIONS = [
  { id: 'fb_page', label: 'Facebook Page' },
  { id: 'ig', label: 'Instagram' },
  { id: 'threads', label: 'Threads' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'linkedin_profile', label: 'LinkedIn Profile' },
  { id: 'linkedin_page', label: 'LinkedIn Page' },
  { id: 'blogger', label: 'Blogger' },
  { id: 'medium', label: 'Medium' },
  { id: 'substack', label: 'Substack' },
]

const SHORT_TEXT_PLATFORMS = ['threads', 'twitter']

const BLOG_PLATFORMS = ['blogger', 'medium', 'substack']

const HASHTAG_PLATFORMS = ['fb_page', 'ig', 'threads', 'twitter', 'linkedin_profile', 'linkedin_page']

const LOCATION_PLATFORMS = ['fb_page', 'ig', 'blogger']

const STATUS_STYLES = {
  published: 'text-signal border-signal/40 bg-signal/10',
  mock: 'text-saffron border-saffron/40 bg-saffron/10',
  error: 'text-coral border-coral/40 bg-coral/10',
}

function defaultScheduleValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
  d.setSeconds(0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Har region ka apna time zone select karne ke liye — browser jo bhi list de sake wo use
// karo (modern browsers), warna ek chota fallback list rakh do taake dropdown khaali na ho
function getTimezoneList() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone')
    }
  } catch {
    // ignore, fallback neeche
  }
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

// "2026-08-09T15:39" jaisi naive datetime-local value ko kisi bhi diye hue IANA timezone
// mein "wall clock time" maan kar sahi UTC instant mein convert karta hai. Native JS Date
// sirf browser ki apni local timezone ko samajhta hai, isliye ye standard trick use karte
// hain: pehle UTC maan kar Date banao, phir target timezone mein format karke offset
// nikaalo, phir us offset se sahi UTC time hasil karo.
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

export default function Publish() {
  const [caption, setCaption] = usePersistentState('publish.caption', '')
  const [shortCaption, setShortCaption] = usePersistentState('publish.shortCaption', '')
  const [title, setTitle] = usePersistentState('publish.title', '')
  const [hashtags, setHashtags] = usePersistentState('publish.hashtags', '')
  const [location, setLocation] = usePersistentState('publish.location', '')
  const [labelsText, setLabelsText] = usePersistentState('publish.labelsText', '')
  const [platforms, setPlatforms] = usePersistentState('publish.platforms', ['fb_page'])
  const [mediaUrl, setMediaUrl] = usePersistentState('publish.mediaUrl', '')
  const [mediaHostWarning, setMediaHostWarning] = useState('')
  const [mediaType, setMediaType] = usePersistentState('publish.mediaType', null)
  const [uploading, setUploading] = useState(false)
  const [mode, setMode] = usePersistentState('publish.mode', 'now')
  const [scheduleAt, setScheduleAt] = usePersistentState('publish.scheduleAt', defaultScheduleValue())
  const [timezone, setTimezone] = usePersistentState('publish.timezone', BROWSER_TIMEZONE)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [scheduled, setScheduled] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const needsTitle = platforms.some((p) => BLOG_PLATFORMS.includes(p))
  const needsShortCaption = platforms.some((p) => SHORT_TEXT_PLATFORMS.includes(p))
  const needsHashtags = platforms.some((p) => HASHTAG_PLATFORMS.includes(p))
  const needsLocation = platforms.some((p) => LOCATION_PLATFORMS.includes(p))
  const needsLabels = platforms.includes('blogger')
  const igNeedsMedia = platforms.includes('ig') && !mediaUrl

  const togglePlatform = (id) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    setMediaHostWarning('')
    try {
      const res = await api.uploadMedia(file)
      setMediaUrl(res.url)
      setMediaType(res.type)
      if (res.hosted_on === 'local') {
        setMediaHostWarning(res.warning || 'Free public hosting fail hui — ye URL Facebook/Instagram ke liye kaam nahi karega.')
      } else if (res.hosted_on === 'catbox.moe') {
        setMediaHostWarning('') // sab theek, koi warning nahi
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const clearMedia = () => {
    setMediaUrl('')
    setMediaType(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!caption.trim() || platforms.length === 0) return
    setLoading(true)
    setError('')
    setResults(null)
    setScheduled(null)
    try {
      const payload = {
        caption,
        title,
        short_caption: shortCaption,
        hashtags,
        location,
        labels: labelsText.split(',').map((l) => l.trim()).filter(Boolean),
        media_urls: mediaUrl ? [mediaUrl] : [],
        platforms,
      }
      if (mode === 'now') {
        const res = await api.publish(payload)
        setResults(res.published)
      } else {
        const iso = zonedTimeToUtcIso(scheduleAt, timezone)
        const res = await api.schedulePost({ ...payload, scheduled_at: iso })
        setScheduled(res)
      }
      setCaption('')
      setTitle('')
      setShortCaption('')
      setHashtags('')
      setLocation('')
      setLabelsText('')
      setMediaUrl('')
      setMediaType(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <header className="mb-8">
        <div className="font-mono text-[11px] text-signal mb-1">02 · BROADCAST</div>
        <h1 className="font-display font-bold text-2xl text-offwhite">Publish to channels</h1>
        <p className="text-muted text-sm mt-1">
          Ek caption, image ya video, jitne channels chaho — abhi ya schedule karke.
        </p>
      </header>

      <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
        {needsTitle && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Title <span className="text-muted/60 normal-case">(Blogger / Medium ke liye zaroori)</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post ka title"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            placeholder="Apna final caption yahan paste karo…"
            className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none resize-none"
          />
          <p className="text-[11px] text-muted mt-1">Ye caption Facebook, Instagram, LinkedIn, Blogger aur Medium sab par jayega.</p>
        </div>

        {needsShortCaption && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Threads / Twitter content <span className="text-muted/60 normal-case">(optional — khaali chora to upar wala caption hi jayega)</span>
            </label>
            <textarea
              value={shortCaption}
              onChange={(e) => setShortCaption(e.target.value)}
              rows={3}
              placeholder="Threads aur Twitter ke liye chota, alag wording likho (kam words)…"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none resize-none"
            />
            <p className="text-[11px] text-muted mt-1">
              Ye box Threads aur Twitter/X dono share karte hain (dono jagah kam text chalta hai). Baaki sab platforms upar wala caption use karenge.
              {shortCaption.length > 0 && <span className="ml-2 font-mono">{shortCaption.length}/280 (Twitter limit)</span>}
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Media (image / video)</label>
          <div className="mt-2 flex items-center gap-3">
            <label className="cursor-pointer text-xs font-medium bg-ink border border-line rounded-lg px-3 py-2 text-offwhite hover:border-signal transition">
              {uploading ? 'Uploading…' : 'Choose file'}
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
                <button onClick={clearMedia} className="text-muted hover:text-coral">✕</button>
              </span>
            )}
          </div>
          {mediaType === 'image' && mediaUrl && (
            <img src={mediaUrl} alt="preview" className="mt-3 max-h-40 rounded-lg border border-line" />
          )}
          {mediaType === 'video' && mediaUrl && (
            <video src={mediaUrl} controls className="mt-3 max-h-40 rounded-lg border border-line" />
          )}
          {mediaUrl && (
            <p className="text-[10px] text-muted mt-1 font-mono break-all">
              URL: <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-signal underline">{mediaUrl}</a>
              {' '}(is link ko naye tab mein khol kar check karo — agar image/video khud khulti hai to URL public hai, warna galat hai)
            </p>
          )}
          {mediaHostWarning && (
            <p className="text-[11px] text-coral mt-1 font-medium">⚠ {mediaHostWarning}</p>
          )}
          <p className="text-[11px] text-muted mt-1">
            Facebook/Instagram/Threads ko publicly reachable URL chahiye — ye khud-ba-khud free hosting (catbox.moe) se ho jayega, koi link manually dalne ki zarurat nahi. Apna tez/private hosting chahiye to Settings mein "Public Base URL" (tunnel) set kar sakte ho.
          </p>
          {igNeedsMedia && (
            <p className="text-[11px] text-coral mt-1 font-medium">
              ⚠ Instagram ke liye image ya video zaroori hai — media ke bagair sirf IG skip/error hoga, baaki selected platforms theek publish ho jayenge.
            </p>
          )}
        </div>

        {needsHashtags && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Hashtags <span className="text-muted/60 normal-case">(optional, space ya comma se alag karo)</span>
            </label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#AI #Karachi #Automation"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
            <p className="text-[11px] text-muted mt-1">Caption ke aakhir mein add ho jayenge — FB, IG, Threads, Twitter, LinkedIn sab par.</p>
          </div>
        )}

        {needsLocation && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Location <span className="text-muted/60 normal-case">(optional — ye post kahan se ho rahi hai)</span>
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Karachi, Pakistan"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
            <p className="text-[11px] text-muted mt-1">
              Facebook/Instagram par location-tag lagega (nazdeekitareen matching place), Blogger par post ki location field mein jayega.
            </p>
          </div>
        )}

        {needsLabels && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Blogger Labels <span className="text-muted/60 normal-case">(optional, comma se alag karo)</span>
            </label>
            <input
              value={labelsText}
              onChange={(e) => setLabelsText(e.target.value)}
              placeholder="AI, Automation, Business"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
            <p className="text-[11px] text-muted mt-1">Blogger ki apni categorization hoti hai (hashtag jaisi nahi) — yahan alag rakha hai.</p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Send to</label>
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
          {mode === 'schedule' && (
            <p className="text-[11px] text-muted mt-2">
              Waqt <span className="text-offwhite font-mono">{timezone}</span> timezone ke hisaab se liya jayega — jo bhi region ho apni timezone select kar sakte ho.
            </p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || uploading || !caption.trim() || platforms.length === 0}
          className="w-full bg-signal text-ink font-semibold text-sm rounded-lg py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {loading
            ? mode === 'now' ? 'Transmitting…' : 'Scheduling…'
            : mode === 'now'
              ? `Publish to ${platforms.length} channel${platforms.length === 1 ? '' : 's'}`
              : `Schedule for ${platforms.length} channel${platforms.length === 1 ? '' : 's'}`}
        </button>
        {error && <div className="text-coral text-sm font-mono">{error}</div>}
      </div>

      {scheduled && (
        <div className="mt-6 rounded-lg border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          Scheduled ✓ — {new Date(scheduled.scheduled_at).toLocaleString()} ko {scheduled.platforms.join(', ')} par chala jayega.
          Dekho <a href="/calendar" className="underline">Calendar</a> page par.
        </div>
      )}

      {results && (
        <div className="mt-6 space-y-2">
          {Object.entries(results).map(([platform, res]) => (
            <div
              key={platform}
              className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 ${STATUS_STYLES[res.status] || STATUS_STYLES.error}`}
            >
              <div>
                <div className="font-mono text-xs uppercase">{platform}</div>
                <div className="text-xs opacity-80 mt-1">
                  {res.message || (res.detail && JSON.stringify(res.detail).slice(0, 140)) || 'Published successfully'}
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase shrink-0">{res.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
