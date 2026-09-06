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
  { id: 'substack', label: 'Substack' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'google_business', label: 'Google Business' },
]

const SHORT_TEXT_PLATFORMS = ['threads', 'twitter']
const BLOG_PLATFORMS = ['blogger', 'substack']
const TITLE_PLATFORMS = ['blogger', 'substack', 'youtube']
const HASHTAG_PLATFORMS = ['fb_page', 'ig', 'threads', 'twitter', 'linkedin_profile', 'linkedin_page', 'tiktok', 'youtube', 'google_business']
const LOCATION_PLATFORMS = ['fb_page', 'ig', 'blogger', 'google_business']
const VIDEO_PLATFORMS = ['tiktok', 'ig', 'fb_page', 'threads', 'youtube']

const STATUS_STYLES = {
  published: 'text-signal border-signal/40 bg-signal/10',
  mock: 'text-saffron border-saffron/40 bg-saffron/10',
  error: 'text-coral border-coral/40 bg-coral/10',
}

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

  const needsTitle = platforms.some((p) => TITLE_PLATFORMS.includes(p))
  const needsShortCaption = platforms.some((p) => SHORT_TEXT_PLATFORMS.includes(p))
  const needsHashtags = platforms.some((p) => HASHTAG_PLATFORMS.includes(p))
  const needsLocation = platforms.some((p) => LOCATION_PLATFORMS.includes(p))
  const needsLabels = platforms.includes('blogger')
  const igNeedsMedia = platforms.includes('ig') && !mediaUrl
  const tiktokNeedsVideo = platforms.includes('tiktok') && (!mediaUrl || mediaType !== 'video')
  const youtubeNeedsVideo = platforms.includes('youtube') && (!mediaUrl || mediaType !== 'video')

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
        setMediaHostWarning('')
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
      setTimeout(() => {
        setCaption('')
        setTitle('')
        setShortCaption('')
        setHashtags('')
        setLocation('')
        setLabelsText('')
        setMediaUrl('')
        setMediaType(null)
      }, 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const getPlatformStatus = (platformId) => {
    if (!results) return null
    return results[platformId] || results[platformId.toLowerCase()] || null
  }

  const getPlatformIcon = (id) => {
    const icons = {
      fb_page: 'FB',
      ig: 'IG',
      threads: 'TH',
      twitter: 'X',
      linkedin_profile: 'LI',
      linkedin_page: 'LI-PG',
      blogger: 'BL',
      substack: 'SS',
      tiktok: 'TK',
      youtube: 'YT',
      google_business: 'GB',
    }
    return icons[id] || 'P'
  }

  return (
    <div>
      <header className="mb-8">
        <div className="font-mono text-[11px] text-signal mb-1">02 - BROADCAST - 11 CHANNELS</div>
        <h1 className="font-display font-bold text-2xl text-offwhite">Publish to channels</h1>
        <p className="text-muted text-sm mt-1">
          Ek caption, image ya video, jitne channels chaho — abhi ya schedule karke. TikTok + YouTube ke liye video zaroori. YouTube pe title zaroori hai. Google Business pe photo best hai.
        </p>
      </header>

      <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
        {needsTitle && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Title <span className="text-muted/60 normal-case">(Blogger + Substack + YouTube ke liye zaroori)</span>
              {platforms.includes('youtube') && <span className="ml-2 text-[#FF0000] text-[11px]">YouTube Title: 100 chars max</span>}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={platforms.includes('youtube') ? "YouTube video title (e.g. How I Made 1000 Online)" : "Post ka title"}
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
              maxLength={platforms.includes('youtube') ? 100 : undefined}
            />
            {platforms.includes('youtube') && (
              <p className="text-[11px] text-muted mt-1">{title.length}/100 chars — YouTube pe ye video ka title banega</p>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">Caption / Description</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            placeholder="Apna final caption yahan paste karo. YouTube pe ye description banega, TikTok pe caption + hashtags"
            className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none resize-none"
          />
          <p className="text-[11px] text-muted mt-1">
            Facebook, Instagram, LinkedIn, Blogger, TikTok, YouTube, Google Business sab par jayega. YouTube pe description me hashtags bhi aayenge.
          </p>
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
              placeholder="Threads aur Twitter ke liye chota, alag wording likho (kam words)"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2.5 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none resize-none"
            />
            <p className="text-[11px] text-muted mt-1">
              Ye box Threads aur Twitter/X dono share karte hain. Baaki sab platforms upar wala caption use karenge.
              {shortCaption.length > 0 && <span className="ml-2 font-mono">{shortCaption.length}/280</span>}
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">
            Media (image / video) 
            {platforms.includes('tiktok') && <span className="text-[#FF0050] ml-2">- TikTok ke liye VIDEO zaroori (MP4)</span>}
            {platforms.includes('youtube') && <span className="text-[#FF0000] ml-2">- YouTube ke liye VIDEO zaroori (MP4/MOV)</span>}
            {platforms.includes('google_business') && <span className="text-[#4285F4] ml-2">- Google Business ke liye PHOTO best hai</span>}
          </label>
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
          {mediaUrl && (
            <p className="text-[10px] text-muted mt-1 font-mono break-all">
              URL: <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-signal underline">{mediaUrl}</a>
            </p>
          )}
          {mediaHostWarning && (
            <p className="text-[11px] text-coral mt-1 font-medium">Warning: {mediaHostWarning}</p>
          )}
          <p className="text-[11px] text-muted mt-1">
            Facebook/Instagram/Threads ko publicly reachable URL chahiye — auto free hosting se ho jayega. TikTok + YouTube ke liye MP4 video zaroori hai.
          </p>
          {igNeedsMedia && (
            <p className="text-[11px] text-coral mt-1 font-medium">
              Instagram ke liye image ya video zaroori hai
            </p>
          )}
          {tiktokNeedsVideo && (
            <p className="text-[11px] text-[#FF0050] mt-1 font-medium">
              TikTok ke liye VIDEO zaroori hai — sirf image se TikTok post nahi hoga. MP4/MOV upload karo.
            </p>
          )}
          {youtubeNeedsVideo && (
            <p className="text-[11px] text-[#FF0000] mt-1 font-medium">
              YouTube ke liye VIDEO zaroori hai — image se YouTube pe upload nahi hoga. MP4/MOV upload karo.
            </p>
          )}
        </div>

        {needsHashtags && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Hashtags <span className="text-muted/60 normal-case">(TikTok + YouTube + Google Business pe bhi kaam karte hain)</span>
            </label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#AI #Karachi #TikTokViral #YouTube #GoogleBusiness #Automation"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
            <p className="text-[11px] text-muted mt-1">Caption ke aakhir mein add ho jayenge — TikTok + YouTube + Google Business pe viral hone ke liye important</p>
          </div>
        )}

        {needsLocation && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Location <span className="text-muted/60 normal-case">(optional)</span>
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Karachi, Pakistan"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
          </div>
        )}

        {needsLabels && (
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide">
              Blogger Labels <span className="text-muted/60 normal-case">(optional)</span>
            </label>
            <input
              value={labelsText}
              onChange={(e) => setLabelsText(e.target.value)}
              placeholder="AI, Automation, Business"
              className="mt-2 w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-offwhite placeholder:text-muted/60 focus:border-signal outline-none"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted uppercase tracking-wide">
            Send to {platforms.length > 0 && <span className="text-signal">({platforms.length} selected)</span>}
            {platforms.includes('tiktok') && <span className="text-[#FF0050] normal-case ml-2">- TikTok: video required</span>}
            {platforms.includes('youtube') && <span className="text-[#FF0000] normal-case ml-2">- YouTube: video + title required</span>}
            {platforms.includes('google_business') && <span className="text-[#4285F4] normal-case ml-2">- Google Business: photo recommended</span>}
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PLATFORM_OPTIONS.map((p) => {
              const status = getPlatformStatus(p.id)
              const isSelected = platforms.includes(p.id)
              return (
                <div key={p.id} className="relative">
                  <button
                    onClick={() => togglePlatform(p.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? p.id === 'tiktok' 
                          ? 'bg-[#FF0050]/20 border-[#FF0050] text-[#FF0050]'
                          : p.id === 'youtube'
                          ? 'bg-[#FF0000]/20 border-[#FF0000] text-[#FF0000]'
                          : p.id === 'google_business'
                          ? 'bg-[#4285F4]/20 border-[#4285F4] text-[#4285F4]'
                          : 'bg-signal/15 border-signal text-signal'
                        : 'border-line text-muted hover:text-offwhite'
                    }`}
                  >
                    <span className="text-[10px] font-bold font-mono">{getPlatformIcon(p.id)}</span>
                    {p.label}
                    {status && (
                      <span className={`ml-1 w-2 h-2 rounded-full ${status.status === 'published' || status.success ? 'bg-signal' : status.status === 'error' ? 'bg-coral' : 'bg-saffron'}`} />
                    )}
                  </button>
                  {status && (
                    <div className={`absolute top-full left-0 mt-1 z-10 min-w-[200px] p-2 rounded-lg border text-[10px] font-mono shadow-lg backdrop-blur ${
                      status.status === 'published' || status.success
                        ? 'bg-signal/10 border-signal/30 text-signal'
                        : 'bg-coral/10 border-coral/30 text-coral'
                    }`}>
                      <div className="font-bold">{p.label}: {status.status === 'published' || status.success ? 'Success' : 'Failed'}</div>
                      <div className="mt-1 opacity-80 break-words">
                        {status.message || status.error || (status.url ? `URL: ${status.url}` : 'Published')}
                      </div>
                      {status.url && (
                        <a href={status.url} target="_blank" rel="noreferrer" className="mt-1 block underline">View Post</a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {platforms.length === 0 && (
            <p className="text-[11px] text-coral mt-2">Kam se kam ek channel select karo</p>
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
          onClick={handleSubmit}
          disabled={loading || uploading || !caption.trim() || platforms.length === 0 || (platforms.includes('youtube') && !title.trim())}
          className="w-full bg-signal text-ink font-semibold text-sm rounded-lg py-2.5 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {loading
            ? mode === 'now' ? 'Transmitting...' : 'Scheduling...'
            : mode === 'now'
              ? `Publish to ${platforms.length} channel${platforms.length === 1 ? '' : 's'} ${platforms.includes('youtube') ? 'including YouTube' : platforms.includes('tiktok') ? 'including TikTok' : platforms.includes('google_business') ? 'including Google Business' : ''}`
              : `Schedule for ${platforms.length} channel${platforms.length === 1 ? '' : 's'}`}
        </button>
        {platforms.includes('youtube') && !title.trim() && (
          <p className="text-[11px] text-[#FF0000] font-medium">YouTube ke liye Title zaroori hai</p>
        )}
        {error && <div className="text-coral text-sm font-mono bg-coral/10 border border-coral/20 p-3 rounded-lg">{error}</div>}
      </div>

      {scheduled && (
        <div className="mt-6 rounded-lg border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          Scheduled — {new Date(scheduled.scheduled_at).toLocaleString()} ko {scheduled.platforms.join(', ')} par chala jayega.
        </div>
      )}

      {results && (
        <div className="mt-6 space-y-3">
          <h3 className="text-xs font-bold text-offwhite uppercase tracking-wide">Publish Results — Har Channel ka Status Neeche:</h3>
          {Object.entries(results).map(([platform, res]) => {
            const isSuccess = res.status === 'published' || res.success
            const platformLabel = PLATFORM_OPTIONS.find(p => p.id === platform || p.id.toLowerCase() === platform.toLowerCase())?.label || platform
            return (
              <div
                key={platform}
                className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 ${isSuccess ? 'bg-signal/10 border-signal/30' : 'bg-coral/10 border-coral/30'} transition-all`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold font-mono bg-ink px-1.5 py-0.5 rounded">{getPlatformIcon(platform)}</span>
                    <div className="font-mono text-xs uppercase font-bold text-offwhite">{platformLabel}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isSuccess ? 'bg-signal text-ink' : 'bg-coral text-white'}`}>
                      {isSuccess ? 'SUCCESS' : 'FAILED'}
                    </span>
                    {res.inbox && <span className="text-[10px] bg-saffron/20 text-saffron border border-saffron/30 px-2 py-0.5 rounded-full">INBOX</span>}
                  </div>
                  <div className="text-xs mt-2 leading-relaxed">
                    <div className={isSuccess ? 'text-signal' : 'text-coral'}>
                      {res.message || res.error || (res.detail && JSON.stringify(res.detail).slice(0, 200)) || (isSuccess ? 'Published successfully' : 'Failed')}
                    </div>
                    {res.url && (
                      <div className="mt-2">
                        <a href={res.url} target="_blank" rel="noreferrer" className="text-[11px] text-signal underline font-mono break-all">
                          {res.url}
                        </a>
                      </div>
                    )}
                    {res.post_id && (
                      <div className="text-[10px] text-muted font-mono mt-1">Post ID: {res.post_id}</div>
                    )}
                    {res.video_id && (
                      <div className="text-[10px] text-muted font-mono mt-1">Video ID: {res.video_id}</div>
                    )}
                    {res.inbox && <div className="text-[11px] text-saffron mt-1">Open TikTok app to finalize</div>}
                  </div>
                </div>
                <span className={`font-mono text-[10px] uppercase shrink-0 px-2 py-1 rounded ${isSuccess ? 'bg-signal/20 text-signal' : 'bg-coral/20 text-coral'}`}>
                  {res.status || (isSuccess ? 'published' : 'error')}
                </span>
              </div>
            )
          })}
          <div className="text-[11px] text-muted mt-3 p-3 bg-ink/50 border border-line/50 rounded-lg">
            Tip: Har channel ke neeche success/error dikhega. YouTube pe video 2-3 min me process hota hai. Google Business posts 7 din me expire hote hain. Agar fail hua to error message yahi dikhega.
          </div>
        </div>
      )}
    </div>
  )
}
