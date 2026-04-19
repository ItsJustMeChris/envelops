'use client'

import { useEffect } from 'react'

// Strip one-shot status query params from the URL after the server has already
// rendered the banner. Uses history.replaceState so no router re-render happens —
// the banner stays visible until the user navigates away, but a reload starts
// fresh without the stale status re-triggering.
export function FlashCleanup({ keys }: { keys: string[] }) {
  useEffect(() => {
    const url = new URL(window.location.href)
    let changed = false
    for (const key of keys) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key)
        changed = true
      }
    }
    if (changed) window.history.replaceState({}, '', url.toString())
  }, [keys])
  return null
}
