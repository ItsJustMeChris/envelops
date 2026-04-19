'use client'

import { useEffect, useRef } from 'react'

import { pushToast, type Tone } from './toast'

export interface FlashSpec {
  // Query-string key to read.
  key: string
  // If set, only fire when the URL value equals this exactly.
  equals?: string
  // Static message (preferred for known fixed values).
  message?: string
  // Template that substitutes the actual URL value into `{value}`.
  template?: string
  tone?: Tone
}

// Replaces FlashCleanup. Reads one-shot status query params on mount, fires a toast
// for each match, and strips the params from the URL via history.replaceState so a
// reload doesn't re-trigger the same toast.
export function FlashToasts({ specs }: { specs: FlashSpec[] }) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    const url = new URL(window.location.href)
    let changed = false
    for (const spec of specs) {
      const value = url.searchParams.get(spec.key)
      if (value === null) continue
      if (spec.equals !== undefined && value !== spec.equals) continue
      const message =
        spec.message ?? (spec.template ? spec.template.replace('{value}', value) : value)
      pushToast(message, spec.tone ?? 'success')
      url.searchParams.delete(spec.key)
      changed = true
    }
    if (changed) window.history.replaceState({}, '', url.toString())
  }, [specs])

  return null
}
