import type { ReactNode } from 'react'

export function Terminal({
  title,
  children
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <div className="term">
      <div className="term-bar">
        <span className="dot dot-live" />
        <span className="dot" />
        <span className="dot" />
        <span className="ml-3 flex-1 truncate">{title ?? 'dotenvx-ops'}</span>
      </div>
      <pre className="px-4 sm:px-5 py-4 overflow-x-auto text-xs sm:text-sm leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}
