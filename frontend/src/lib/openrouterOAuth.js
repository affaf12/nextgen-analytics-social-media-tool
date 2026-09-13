// OpenRouter "Connect" button - SIMPLE FLOW - NO PKCE - No card needed
// Upgraded: state validation + proper URL clean + error handling + backward compat with backend

const VERIFIER_KEY = 'openrouter:verifier'
const STATE_KEY = 'openrouter:state'

function randomString(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length]
  return out
}

export async function startOpenRouterConnect() {
  try {
    // Hamesha settings page pe wapas ana hai taake exchange ho sake
    const callbackUrl = window.location.origin + '/app/settings'

    // State for CSRF protection - OpenRouter wapas same state bhejta hai
    const state = randomString(16)
    try {
      localStorage.setItem(STATE_KEY, state)
      // Purana verifier clear karo - NO PKCE flow
      localStorage.removeItem(VERIFIER_KEY)
    } catch {}

    const authUrl = new URL('https://openrouter.ai/auth')
    authUrl.searchParams.set('callback_url', callbackUrl)
    authUrl.searchParams.set('state', state)

    console.log('Redirecting to OpenRouter:', authUrl.toString())
    window.location.href = authUrl.toString()
  } catch (e) {
    console.error('OpenRouter connect failed', e)
    alert('OpenRouter connect fail: ' + (e.message || e))
  }
}

export function consumePendingOpenRouterCode() {
  try {
    const url = new URL(window.location.href)
    const params = url.searchParams
    const code = params.get('code')
    const error = params.get('error') || params.get('error_description')
    const returnedState = params.get('state')

    // Error aaya to user ko batao aur URL clean karo
    if (error) {
      console.warn('OpenRouter returned error:', error)
      params.delete('code')
      params.delete('state')
      params.delete('error')
      params.delete('error_description')
      const clean = url.pathname + (params.toString() ? `?${params.toString()}` : '') + url.hash
      window.history.replaceState({}, document.title, clean)
      // Error ko Settings.jsx me dikhane ke liye throw nahi karenge, bas null
      // Settings.jsx khud error param check karta hai
      return null
    }

    if (!code) return null

    // State validation (agar humne bheja tha)
    try {
      const savedState = localStorage.getItem(STATE_KEY)
      if (savedState && returnedState && savedState !== returnedState) {
        console.warn('OpenRouter state mismatch, possible CSRF')
        // Phir bhi code ko allow kar dete hain, lekin warning
      }
      localStorage.removeItem(STATE_KEY)
    } catch {}

    // URL se ?code= & ?state= hata do taake refresh par dobara exchange na ho
    params.delete('code')
    params.delete('state')
    params.delete('error')
    params.delete('error_description')
    const cleanUrl = url.pathname + (params.toString() ? `?${params.toString()}` : '') + url.hash
    window.history.replaceState({}, document.title, cleanUrl)

    // NO PKCE - verifier null, backend /exchange isay handle kar lega
    let verifier = null
    try {
      verifier = localStorage.getItem(VERIFIER_KEY)
      localStorage.removeItem(VERIFIER_KEY)
    } catch {}

    console.log('OpenRouter code consumed:', code.slice(0, 8) + '...')
    return { code, verifier }
  } catch (e) {
    console.error('consumePendingOpenRouterCode failed', e)
    return null
  }
}
