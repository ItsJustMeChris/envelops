'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

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

// Reads one-shot status query params after each navigation, fires a toast for each
// match, and strips the params via history.replaceState so a reload (or React
// re-running the effect) doesn't re-fire. Same FlashToasts instance is reused across
// same-segment navigations, so we key off pathname + searchParams instead of mount.
export function FlashToasts({ specs }: { specs: FlashSpec[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
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
  }, [pathname, searchParams, specs])

  return null
}
