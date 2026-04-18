'use client'

import { useState } from 'react'

export function KeyRow({
  index,
  publicKey,
  createdAt
}: {
  index: number
  publicKey: string
  createdAt: string
}) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (revealed) {
      setRevealed(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/panel/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ public_key: publicKey })
      })
      if (!resp.ok) throw new Error(await resp.text())
      const { private_key } = await resp.json()
      setRevealed(private_key)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to reveal')
    } finally {
      setLoading(false)
    }
  }

  const prefix = publicKey.slice(0, 10)
  const shown = revealed ?? '•'.repeat(64)

  return (
    <li className="grid grid-cols-[3rem_12ch_1fr_5rem] gap-4 items-center">
      <span className="text-dim">{String(index).padStart(3, '0')}.</span>
      <span className="text-fg">{prefix}…</span>
      <span className={revealed ? 'text-accent break-all' : 'text-dim tracking-widest truncate'}>{shown}</span>
      <button
        className="text-dim hover:text-fg underline text-xs"
        onClick={toggle}
        disabled={loading}
        title={createdAt}
      >
        [{loading ? '…' : revealed ? 'hide' : 'show'}]
      </button>
      {error ? <span className="col-span-4 text-red-400 text-xs">{error}</span> : null}
    </li>
  )
}
