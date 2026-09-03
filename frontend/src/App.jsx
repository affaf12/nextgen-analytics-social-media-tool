import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Generator from './pages/Generator.jsx'
import Publish from './pages/Publish.jsx'
import Calendar from './pages/Calendar.jsx'
import Leads from './pages/Leads.jsx'
import Settings from './pages/Settings.jsx'
import Terms from './pages/Terms.jsx'
import Privacy from './pages/Privacy.jsx'

export default function App() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-8 max-w-5xl">
        <Routes>
          <Route path="/" element={<Generator />} />
          <Route path="/publish" element={<Publish />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/settings" element={<Settings />} />
          {/* TikTok Verification - Terms & Privacy - No deletion, only added */}
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/nextgen-analytics-social-media-tool/terms" element={<Terms />} />
          <Route path="/nextgen-analytics-social-media-tool/privacy" element={<Privacy />} />
        </Routes>
      </main>
    </div>
  )
}
