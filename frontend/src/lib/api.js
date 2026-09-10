const BASE_URL = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : 'https://nextgen-analytics-social-media-tool.fastapicloud.dev')

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
    return 'default'
  }
}

async function request(path, options = {}) {
  const isForm = options.body instanceof FormData
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      'X-Workspace-Id': getWorkspaceId(),
    },
    ...options,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { detail: text } }
  if (!res.ok) {
    throw new Error(data.detail ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)) : `Request failed (${res.status}) - ${text.slice(0,200)}`)
  }
  return data
}

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
  baseUrl: BASE_URL,
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

  // Settings - FIXED
  checkSettings: () => request('/api/settings/check'),
  getSettingsKeys: () => request('/api/settings/keys'),
  saveSettingsKeys: (values) => request('/api/settings/keys', { method: 'POST', body: JSON.stringify({ values }) }),
  refreshSubstackCookie: () => request('/api/settings/substack/refresh', { method: 'POST' }),
  
  // FIXED: OpenRouter exchange - yahi pe Not Found aa raha tha
  exchangeOpenRouterCode: (code, code_verifier) =>
    request('/api/settings/openrouter/exchange', { method: 'POST', body: JSON.stringify({ code, code_verifier }) }),

  // FIXED: Facebook login URL - endpoint /api/auth/facebook hai, /login-url nahi
  getFacebookLoginUrl: () => request('/api/auth/facebook'),
}
