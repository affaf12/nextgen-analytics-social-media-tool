import { Routes, Route, Outlet, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import Sidebar from './components/Sidebar.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Generator from './pages/Generator.jsx'
import Publish from './pages/Publish.jsx'
import Calendar from './pages/Calendar.jsx'
import Leads from './pages/Leads.jsx'
import Groups from './pages/Groups.jsx'
import Settings from './pages/Settings.jsx'
import Terms from './pages/Terms.jsx'
import Privacy from './pages/Privacy.jsx'

function PrivateLayout() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B0B14]">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return (
    <div className="flex min-h-screen bg-[#0B0B14]">
      <Sidebar />
      <main className="flex-1 px-8 py-8 max-w-5xl overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/app" element={<PrivateLayout />}>
          <Route index element={<Generator />} />
          <Route path="publish" element={<Publish />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="leads" element={<Leads />} />
          <Route path="groups" element={<Groups />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/nextgen-analytics-social-media-tool/terms" element={<Terms />} />
        <Route path="/nextgen-analytics-social-media-tool/privacy" element={<Privacy />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
