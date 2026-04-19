'use client'

import { useEffect, useState } from 'react'

export type Tone = 'success' | 'error'

interface Toast {
  id: string
  message: string
  tone: Tone
  durationMs: number
}

type Listener = (t: Toast) => void

let pending: Toast[] = []
const listeners = new Set<Listener>()
let counter = 0

export function pushToast(message: string, tone: Tone = 'success', durationMs = 5000) {
  const toast: Toast = { id: `t${++counter}`, message, tone, durationMs }
  if (listeners.size === 0) {
    pending.push(toast)
    return
  }
  listeners.forEach((l) => l(toast))
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler: Listener = (t) => setToasts((cur) => [...cur, t])
    listeners.add(handler)
    if (pending.length > 0) {
      const drained = pending
      pending = []
      setToasts((cur) => [...cur, ...drained])
    }
    return () => {
      listeners.delete(handler)
    }
  }, [])

  function dismiss(id: string) {
    setToasts((cur) => cur.filter((t) => t.id !== id))
  }

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="fixed z-50 flex flex-col gap-2 pointer-events-none
                 bottom-4 left-4 right-4
                 sm:bottom-auto sm:right-4 sm:top-4 sm:left-auto sm:w-80"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(toast.durationMs / 1000))
  const [drained, setDrained] = useState(false)

  useEffect(() => {
    // Defer one frame so the bar starts at scaleX(1) and the transition runs.
    const raf = requestAnimationFrame(() => setDrained(true))
    const dismiss = setTimeout(onDismiss, toast.durationMs)
    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(dismiss)
      clearInterval(tick)
    }
  }, [toast.durationMs, onDismiss])

  const isError = toast.tone === 'error'
  const borderClass = isError ? 'border-red-400/40' : 'border-accent/40'
  const barClass = isError ? 'bg-red-400' : 'bg-accent'

  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="dismiss notification"
      className={`pointer-events-auto relative w-full text-left bg-bg border ${borderClass}
                  shadow-lg cursor-pointer hover:border-fg/60 transition-colors`}
    >
      <div className="px-3 py-2 flex items-start gap-3 text-xs">
        <span className="flex-1 break-words text-fg">{toast.message}</span>
        <span aria-hidden="true" className="text-dim shrink-0 tabular-nums">
          [{secondsLeft}s]
        </span>
      </div>
      <span
        aria-hidden="true"
        className={`absolute bottom-0 left-0 h-px w-full origin-left ${barClass}`}
        style={{
          transform: drained ? 'scaleX(0)' : 'scaleX(1)',
          transition: `transform ${toast.durationMs}ms linear`
        }}
      />
    </button>
  )
}
