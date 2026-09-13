import { Link } from 'react-router-dom'

const PLATFORMS = [
  { name: 'Facebook', left: 50, top: 11.36 },
  { name: 'Instagram', left: 77.3, top: 22.68 },
  { name: 'Threads', left: 88.6, top: 50 },
  { name: 'X', left: 77.3, top: 77.3 },
  { name: 'LinkedIn', left: 50, top: 88.6 },
  { name: 'Blogger', left: 22.68, top: 77.3 },
  { name: 'Medium', left: 11.36, top: 50 },
  { name: 'Substack', left: 22.68, top: 22.68 },
]

const STEPS = [
  {
    code: '01',
    title: 'Write once',
    body: 'One prompt becomes three platform-tuned caption variations â€” no external AI bill, it\u2019s template-based.',
  },
  {
    code: '02',
    title: 'Schedule or publish',
    body: 'Send it now, or set a date and time. A background job checks every 30 seconds and fires it the moment it\u2019s due.',
  },
  {
    code: '03',
    title: 'Track what it brings in',
    body: 'Replies and signups land in a kanban pipeline, so a lead never sits unread in eight different inboxes.',
  },
]

function BroadcastDiagram() {
  return (
    <div className="relative w-full max-w-md mx-auto aspect-square">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        {PLATFORMS.map((p) => (
          <line
            key={p.name}
            x1="50"
            y1="50"
            x2={p.left}
            y2={p.top}
            stroke="#2A3268"
            strokeWidth="0.5"
          />
        ))}
      </svg>

      {PLATFORMS.map((p) => (
        <div
          key={p.name}
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted"
          style={{ left: `${p.left}%`, top: `${p.top}%` }}
        >
          {p.name}
        </div>
      ))}

      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center w-24 h-24 rounded-full bg-signal/10 border border-signal/40 shadow-glow"
        style={{ left: '50%', top: '50%' }}
      >
        <span className="pulse w-2 h-2 rounded-full bg-signal mb-1.5" />
        <span className="font-mono text-[10px] text-signal text-center leading-tight px-2">
          your post
        </span>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 sm:px-10 py-6 flex items-center justify-between">
        <div>
          <div className="font-display font-bold text-lg tracking-tight text-offwhite">
            NextGen Analytics
          </div>
          <div className="font-mono text-[11px] text-muted mt-0.5">Social Media Tool</div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm font-medium text-muted hover:text-offwhite transition-colors"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="text-sm font-medium text-offwhite border border-line rounded-lg px-4 py-2 hover:border-signal hover:text-signal transition-colors"
          >
            Sign up
          </Link>
        </div>
      </header>

      <section className="flex-1 px-6 sm:px-10 py-10 sm:py-16 grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto w-full">
        <div className="max-w-lg">
          <h1 className="font-display font-bold text-4xl sm:text-5xl leading-[1.1] text-offwhite">
            Write once. It shows up everywhere you post.
          </h1>
          <p className="mt-5 text-muted text-[15px] leading-relaxed">
            One caption, scheduled or sent instantly across Facebook, Instagram, Threads,
            X, LinkedIn, Blogger, Medium and Substack â€” with the leads it brings in
            tracked in one pipeline.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-lg bg-signal text-ink font-semibold text-sm px-5 py-3 hover:brightness-110 transition"
            >
              Create free account
            </Link>
            <Link to="/login" className="font-mono text-[11px] text-muted hover:text-offwhite transition-colors">
              Already have an account? Log in
            </Link>
          </div>
          <p className="mt-4 font-mono text-[11px] text-muted">
            Bring your own API keys â€” each account's keys and data stay separate from everyone else's.
          </p>
        </div>

        <BroadcastDiagram />
      </section>

      <section className="px-6 sm:px-10 py-14 border-t border-line">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-8">
          {STEPS.map((s) => (
            <div key={s.code}>
              <div className="font-mono text-[11px] text-signal mb-2">{s.code}</div>
              <h3 className="font-display font-semibold text-base text-offwhite mb-1.5">
                {s.title}
              </h3>
              <p className="text-[13px] text-muted leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-6 sm:px-10 py-6 border-t border-line flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-muted">
        <span>Karachi, PK</span>
        <div className="flex gap-5">
          <Link to="/terms" className="hover:text-offwhite transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-offwhite transition-colors">Privacy</Link>
        </div>
      </footer>
    </div>
  )
}


