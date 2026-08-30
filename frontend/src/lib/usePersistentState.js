import { useState, useEffect } from 'react'

/**
 * Same as useState, but the value is saved to localStorage under `key`
 * and restored automatically — so switching tabs (which unmounts the page
 * component in React Router) or reloading the browser doesn't wipe what
 * the user typed.
 */
export function usePersistentState(key, defaultValue) {
  const storageKey = `broadcast:${key}`

  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // storage full or unavailable — fail silently, not critical
    }
  }, [storageKey, state])

  return [state, setState]
}

export function clearPersistentState(key) {
  try {
    localStorage.removeItem(`broadcast:${key}`)
  } catch {
    // ignore
  }
}
