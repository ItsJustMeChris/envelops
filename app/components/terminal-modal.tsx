'use client'

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  // Width hint; defaults to a comfortable reading column. Pass a Tailwind class.
  widthClass?: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function TerminalModal({ open, onClose, title, children, footer, widthClass = 'max-w-lg' }: Props) {
  const id = useId()
  const titleId = `${id}-title`
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement as HTMLElement | null

    // Focus the first focusable element in the panel, or the panel itself.
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('aria-hidden')
      )
      if (focusables.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const firstEl = focusables[0]
      const lastEl = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus.current?.focus?.()
    }
  }, [open, handleClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        aria-hidden="true"
        onMouseDown={handleClose}
        className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative w-full ${widthClass} bg-bg border border-rule shadow-lg outline-none`}
      >
        <header className="flex items-center justify-between border-b border-rule px-4 py-2">
          <h2 id={titleId} className="text-accent text-xs uppercase tracking-wider">
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-dim hover:text-fg text-xs"
            aria-label="close"
          >
            [close]
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-3 border-t border-rule px-4 py-2">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
