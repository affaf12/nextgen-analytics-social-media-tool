import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

const links = [
  { to: '/app', label: 'Generator', code: '01' },
  { to: '/app/publish', label: 'Broadcast', code: '02' },
  { to: '/app/calendar', label: 'Calendar', code: '03' },
  { to: '/app/leads', label: 'Leads', code: '04' },
  { to: '/app/groups', label: 'Groups', code: '05' },
  { to: '/app/automation', label: 'Automation', code: '06' },
  { to: '/app/settings', label: 'Channels', code: '07' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const sidebarContent = (
    <>
      <div className="px-5 py-6 border-b border-line flex items-center justify-between">
        <div>
          <div className="font-display font-bold text-lg tracking-tight text-offwhite">NextGen Analytics</div>
          <div className="font-mono text-[11px] text-muted mt-0.5">Social Media Tool</div>
        </div>
        {/* Close button — mobile drawer ke andar hi dikhta hai */}
        <button
          onClick={() => setOpen(false)}
          className="sm:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-offwhite hover:bg-surface2 shrink-0"
          aria-label="Close menu"
        >
          ✕
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/app'}
            onClick={() => setOpen(false)}
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
      <div className="px-5 py-4 border-t border-line">
        {user && (
          <div className="mb-3">
            <div className="text-[13px] font-medium text-offwhite truncate">{user.name}</div>
            <div className="font-mono text-[10px] text-muted truncate">{user.email}</div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="text-[12px] font-medium text-muted hover:text-coral transition-colors"
        >
          Log out
        </button>
        <div className="font-mono text-[10px] text-muted leading-relaxed mt-3">
          Karachi, PK
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar — sirf chhote screens par dikhta hai, hamburger button ke sath */}
      <div className="sm:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-surface/95 backdrop-blur border-b border-line">
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-offwhite bg-surface2 shrink-0"
          aria-label="Open menu"
        >
          ☰
        </button>
        <div className="font-display font-bold text-sm text-offwhite">NextGen Analytics</div>
        <div className="w-9" />
      </div>

      {/* Mobile drawer backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="sm:hidden fixed inset-0 bg-black/50 z-40"
        />
      )}

      {/* Sidebar itself — desktop par static/sticky, mobile par slide-in drawer */}
      <aside
        className={`w-64 sm:w-60 shrink-0 border-r border-line bg-surface/95 sm:bg-surface/60 flex flex-col h-screen fixed sm:sticky top-0 left-0 z-50 sm:z-auto transform transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } sm:translate-x-0`}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
