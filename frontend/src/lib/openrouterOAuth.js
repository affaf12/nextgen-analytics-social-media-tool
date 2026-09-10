// OpenRouter "Connect" button - SIMPLE FLOW - NO PKCE - No card needed
// Sirf callback_url se kaam chalega, code_challenge ki zarurat nahi

export async function startOpenRouterConnect() {
  try {
    const callbackUrl = window.location.href.split('?')[0].split('#')[0]
    const authUrl = new URL('https://openrouter.ai/auth')
    authUrl.searchParams.set('callback_url', callbackUrl)
    console.log('Redirecting to OpenRouter:', authUrl.toString())
    window.location.href = authUrl.toString()
  } catch (e) {
    console.error('OpenRouter connect failed', e)
    alert('OpenRouter connect fail: ' + e.message)
  }
}

export function consumePendingOpenRouterCode() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return null
  // URL se ?code= hata do taake refresh par dobara exchange na ho
  params.delete('code')
  const newSearch = params.toString()
  const cleanUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
  window.history.replaceState({}, document.title, cleanUrl)
  return { code, verifier: null }
}
