'use client'

import { useState } from 'react'

export function InviteLinkBanner({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard permission denied — leave the user to select manually
    }
  }

  return (
    <div className="border border-accent/40 bg-accent/5 px-4 py-3 mb-4 space-y-2">
      <p className="text-accent">✔ invite created for [{label}]</p>
      <p className="text-dim text-xs">
        share this link out-of-band (slack / email / dm). it is shown only once.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 bg-transparent border border-rule px-2 py-1 text-xs text-fg"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={copy}
          className="border border-rule px-3 py-1 text-xs hover:border-accent hover:text-accent"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
    </div>
  )
}
