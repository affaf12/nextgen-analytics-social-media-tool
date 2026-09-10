// OpenRouter "Connect" button — OAuth PKCE flow (https://openrouter.ai/docs/oauth).
// User email/password kabhi is app se nahi guzarta aur koi API key copy-paste nahi
// karni — OpenRouter khud ek fresh, revoke-able key is app ke naam par bana kar deta hai.

const VERIFIER_STORAGE_KEY = 'affaf-crm:openrouter-pkce-verifier'

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomVerifier(length = 64) {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return base64UrlEncode(array.buffer)
}

async function sha256Challenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}

// Step 1: OpenRouter par redirect karo — "Connect" button yeh call karega.
export async function startOpenRouterConnect() {
  try {
    const verifier = randomVerifier()
    sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier)
    const challenge = await sha256Challenge(verifier)
    const callbackUrl = window.location.href.split('?')[0].split('#')[0]
    const authUrl = new URL('https://openrouter.ai/auth')
    authUrl.searchParams.set('callback_url', callbackUrl)
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    console.log('Redirecting to OpenRouter:', authUrl.toString())
    window.location.href = authUrl.toString()
  } catch (e) {
    console.error('OpenRouter connect failed', e)
    alert('OpenRouter connect fail: ' + e.message)
  }
}

// Step 2: page reload hote hi call karo (Settings.jsx ke useEffect mein) — agar URL
// mein ?code=... mila to backend se exchange karwa ke key save karwa deta hai.
export function consumePendingOpenRouterCode() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return null
  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY) || localStorage.getItem('affaf-crm:openrouter-pkce-verifier') || null
  sessionStorage.removeItem(VERIFIER_STORAGE_KEY)
  localStorage.removeItem('affaf-crm:openrouter-pkce-verifier')
  // URL se ?code= hata do taake refresh par dobara exchange na ho
  params.delete('code')
  const newSearch = params.toString()
  const cleanUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
  window.history.replaceState({}, document.title, cleanUrl)
  return { code, verifier }
}
