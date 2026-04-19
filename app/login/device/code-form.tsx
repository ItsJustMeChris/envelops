'use client'

import { useEffect, useRef, useState } from 'react'

import { approveDevice } from './actions'

const CODE_LENGTH = 8 // 4 bytes hex from generateUserCode()

export function CodeForm({ defaultCode }: { defaultCode: string }) {
  const [value, setValue] = useState(defaultCode)
  const formRef = useRef<HTMLFormElement>(null)
  const submittedRef = useRef(false)

  // Normalize to hex only, then auto-format with a dash after the 4th char.
  // User-typed dashes are stripped (the dash auto-appears before the next hex anyway);
  // pasted codes work with or without a dash.
  const hex = value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, CODE_LENGTH)
  const display = hex.length > 4 ? `${hex.slice(0, 4)}-${hex.slice(4)}` : hex

  useEffect(() => {
    if (submittedRef.current) return
    if (hex.length === CODE_LENGTH) {
      submittedRef.current = true
      formRef.current?.requestSubmit()
    }
  }, [hex])

  const remaining = CODE_LENGTH - hex.length

  return (
    <form ref={formRef} action={approveDevice} className="space-y-4">
      <label className="block">
        <span className="text-dim">user code</span>
        <input
          name="user_code"
          value={display}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoFocus
          inputMode="text"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          maxLength={CODE_LENGTH + 1 /* auto-inserted dash */}
          className="mt-1 w-full bg-transparent border border-rule px-3 py-2 tracking-widest text-accent uppercase"
        />
      </label>
      <p className="text-dim text-xs">
        {remaining > 0
          ? `${remaining} more character${remaining === 1 ? '' : 's'}…`
          : 'authorizing…'}
      </p>
    </form>
  )
}
