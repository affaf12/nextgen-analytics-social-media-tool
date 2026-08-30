const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Har browser ko ek dafa random, private workspace ID milta hai (koi login/signup
// nahi) aur localStorage mein save ho jata hai. Yeh har request ke sath backend ko
// jata hai taake tumhari API keys, leads, aur scheduled posts sirf ISI browser se
// linked rahen — koi doosra banda jo yeh app use kare, uski apni alag, khaali
// workspace hogi, kabhi tumhari saved keys use nahi hongi.
const WORKSPACE_STORAGE_KEY = 'affaf-crm:workspace-id'

function getWorkspaceId() {
  try {
    let id = localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      localStorage.setItem(WORKSPACE_STORAGE_KEY, id)
    }
    return id
  } catch {
    // localStorage unavailable (private browsing, etc.) — falls back to shared/default
    return 'default'
  }
}

async function request(path, options = {}) {
  const isForm = options.body instanceof FormData
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      'X-Workspace-Id': getWorkspaceId(),
    },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.detail ? JSON.stringify(data.detail) : `Request failed (${res.status})`)
  }
  return data
}

// CSV jaisi file downloads ke liye — request() JSON parse karta hai jo CSV ke liye kaam
// nahi karta, isliye ye alag helper file ko seedha browser mein "Save As" trigger karta hai
async function downloadFile(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'X-Workspace-Id': getWorkspaceId() } })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail ? JSON.stringify(data.detail) : `Request failed (${res.status})`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : 'report.csv'
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export const api = {
  generate: (payload) => request('/api/generate', { method: 'POST', body: JSON.stringify(payload) }),
  publish: (payload) => request('/api/post/publish', { method: 'POST', body: JSON.stringify(payload) }),
  uploadMedia: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/api/upload', { method: 'POST', body: form })
  },

  // Scheduling / Calendar
  schedulePost: (payload) => request('/api/schedule', { method: 'POST', body: JSON.stringify(payload) }),
  getScheduled: () => request('/api/schedule'),
  cancelScheduled: (id) => request(`/api/schedule/${id}`, { method: 'DELETE' }),
  deleteScheduled: (id) => request(`/api/schedule/${id}`, { method: 'DELETE' }),
  exportScheduledCsv: ({ year, month, day } = {}) => {
    const params = new URLSearchParams()
    if (year) params.set('year', year)
    if (month) params.set('month', month)
    if (day) params.set('day', day)
    const qs = params.toString()
    return downloadFile(`/api/schedule/export${qs ? `?${qs}` : ''}`)
  },

  // CRM
  getLeads: () => request('/api/crm/leads'),
  getStats: () => request('/api/crm/stats'),
  createLead: (payload) => request('/api/crm/leads', { method: 'POST', body: JSON.stringify(payload) }),
  updateLead: (id, payload) => request(`/api/crm/leads/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteLead: (id) => request(`/api/crm/leads/${id}`, { method: 'DELETE' }),

  // Settings
  checkSettings: () => request('/api/settings/check'),
  getSettingsKeys: () => request('/api/settings/keys'),
  saveSettingsKeys: (values) => request('/api/settings/keys', { method: 'POST', body: JSON.stringify({ values }) }),
  refreshSubstackCookie: () => request('/api/settings/substack/refresh', { method: 'POST' }),
}
