'use client'

import { useState } from 'react'

import { TerminalModal } from '@/app/components/terminal-modal'

type Stage = 'closed' | 'confirm' | 'loading' | 'revealed' | 'error'

export function KeyRow({
  index,
  publicKey,
  createdAt,
  canReveal
}: {
  index: number
  publicKey: string
  createdAt: string
  canReveal: boolean
}) {
  const [stage, setStage] = useState<Stage>('closed')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function close() {
    setStage('closed')
    setRevealed(null)
    setError(null)
    setCopied(false)
  }

  async function reveal() {
    setStage('loading')
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
      setStage('revealed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to reveal')
      setStage('error')
    }
  }

  async function copy() {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail in non-secure contexts; user can still select manually.
    }
  }

  const prefix = publicKey.slice(0, 10)
  const dots = '•'.repeat(64)

  return (
    <>
      <li className="grid grid-cols-[2.5rem_1fr_auto] gap-x-3 sm:grid-cols-[3rem_12ch_1fr_5rem] sm:gap-4 sm:items-center">
        <span className="text-dim">{String(index).padStart(3, '0')}.</span>
        <span className="text-fg truncate min-w-0">{prefix}…</span>
        {canReveal ? (
          <button
            className="text-dim hover:text-fg underline text-xs justify-self-end sm:justify-self-auto sm:order-last"
            onClick={() => setStage('confirm')}
            title={createdAt}
          >
            [show]
          </button>
        ) : (
          <span
            className="text-dim text-xs justify-self-end sm:justify-self-auto sm:order-last"
            title="only team owners or admins can reveal private keys"
          >
            [locked]
          </span>
        )}
        <span className="col-start-1 col-span-3 sm:col-span-1 sm:col-start-auto text-dim tracking-widest truncate">
          {dots}
        </span>
      </li>

      <TerminalModal
        open={stage !== 'closed'}
        onClose={close}
        title="reveal private key"
        widthClass="max-w-xl"
        footer={
          stage === 'revealed' ? (
            <>
              <button onClick={copy} className="text-dim hover:text-fg text-xs">
                [{copied ? 'copied' : 'copy'}]
              </button>
              <button onClick={close} className="text-accent hover:text-fg text-xs">
                [done]
              </button>
            </>
          ) : stage === 'error' ? (
            <button onClick={close} className="text-accent hover:text-fg text-xs">
              [dismiss]
            </button>
          ) : (
            <>
              <button
                onClick={close}
                disabled={stage === 'loading'}
                className="text-dim hover:text-fg text-xs disabled:opacity-50"
              >
                [cancel]
              </button>
              <button
                onClick={reveal}
                disabled={stage === 'loading'}
                className="text-accent hover:text-fg text-xs disabled:opacity-50"
              >
                [{stage === 'loading' ? 'revealing…' : 'reveal'}]
              </button>
            </>
          )
        }
      >
        <div className="space-y-3 text-sm">
          <div className="text-dim text-xs">
            <span className="text-dim">public key</span>
            <div className="text-fg break-all mt-1">{publicKey}</div>
          </div>

          {stage === 'confirm' || stage === 'loading' ? (
            <p className="text-fg">
              reveal the private key in plaintext? this action will be recorded in the audit log.
            </p>
          ) : null}

          {stage === 'revealed' && revealed ? (
            <div>
              <div className="text-dim text-xs">private key</div>
              <pre className="mt-1 text-accent break-all whitespace-pre-wrap border border-rule p-3 select-all">
                {revealed}
              </pre>
            </div>
          ) : null}

          {stage === 'error' && error ? (
            <p className="text-red-400 break-words">{error}</p>
          ) : null}
        </div>
      </TerminalModal>
    </>
  )
}
