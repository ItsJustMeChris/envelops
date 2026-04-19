'use client'

import { useEffect, useState } from 'react'

export interface TerminalLine {
  text: string
  tone?: 'ok' | 'fail' | 'dim' | 'fg'
}

// Line-by-line typewriter with a blinking caret on the trailing line. Staggered
// enough to feel like a shell response without feeling slow.
export function TerminalPrinter({
  lines,
  delayMs = 650,
  initialDelayMs = 300
}: {
  lines: TerminalLine[]
  delayMs?: number
  initialDelayMs?: number
}) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (shown >= lines.length) return
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? initialDelayMs : delayMs)
    return () => clearTimeout(t)
  }, [shown, lines.length, delayMs, initialDelayMs])

  return (
    <pre className="border border-rule px-4 py-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
      <code>
        {lines.slice(0, shown).map((line, i) => {
          const cls =
            line.tone === 'ok'
              ? 'text-accent'
              : line.tone === 'fail'
                ? 'text-red-400'
                : line.tone === 'dim'
                  ? 'text-dim'
                  : 'text-fg'
          return (
            <span key={i} className={cls}>
              <span className="text-dim">$ </span>
              {line.text}
              {'\n'}
            </span>
          )
        })}
        {shown < lines.length ? <span className="text-accent animate-pulse">▋</span> : null}
      </code>
    </pre>
  )
}
