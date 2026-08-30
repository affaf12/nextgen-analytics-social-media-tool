import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Generator', code: '01' },
  { to: '/publish', label: 'Broadcast', code: '02' },
  { to: '/calendar', label: 'Calendar', code: '03' },
  { to: '/leads', label: 'Leads', code: '04' },
  { to: '/settings', label: 'Channels', code: '05' },
]

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-line bg-surface/60 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-line">
        <div className="font-display font-bold text-lg tracking-tight text-offwhite">NextGen Analytics</div>
        <div className="font-mono text-[11px] text-muted mt-0.5">Social Media Tool</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-signal/10 text-signal shadow-glow'
                  : 'text-muted hover:text-offwhite hover:bg-surface2'
              }`
            }
          >
            <span className="font-mono text-[10px] text-muted">{l.code}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-line font-mono text-[10px] text-muted leading-relaxed">
        Karachi, PK
      </div>
    </aside>
  )
}
