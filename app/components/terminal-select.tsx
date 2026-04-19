'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  name: string
  options: SelectOption[]
  defaultValue?: string
  className?: string
  required?: boolean
  placeholder?: string
}

// Fully custom combobox. We render a hidden <input> so form submissions keep working
// and build our own styled button + listbox popup so the dropdown palette matches the
// app (native <option> row highlight is OS chrome and ignores CSS).
export function TerminalSelect({
  name,
  options,
  defaultValue,
  className,
  required,
  placeholder
}: Props) {
  const initialValue = defaultValue ?? options[0]?.value ?? ''
  const [value, setValue] = useState<string>(initialValue)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(() => {
    const i = options.findIndex((o) => o.value === initialValue)
    return i >= 0 ? i : 0
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const listId = `${id}-list`

  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? ''

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLLIElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function commit(i: number) {
    const opt = options[i]
    if (!opt) return
    setValue(opt.value)
    setActiveIndex(i)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const openKeys = ['Enter', ' ', 'ArrowDown', 'ArrowUp']
    if (!open) {
      if (openKeys.includes(e.key)) {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End', 'Escape', 'Tab'].includes(e.key)) {
      // Tab closes without committing; all others swallow the event.
      if (e.key !== 'Tab') e.preventDefault()
    }
    if (e.key === 'Escape' || e.key === 'Tab') setOpen(false)
    else if (e.key === 'ArrowDown') setActiveIndex((i) => Math.min(i + 1, options.length - 1))
    else if (e.key === 'ArrowUp') setActiveIndex((i) => Math.max(i - 1, 0))
    else if (e.key === 'Home') setActiveIndex(0)
    else if (e.key === 'End') setActiveIndex(options.length - 1)
    else if (e.key === 'Enter' || e.key === ' ') commit(activeIndex)
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <input type="hidden" name={name} value={value} required={required} />
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onKeyDown={onKeyDown}
        onClick={() => setOpen((o) => !o)}
        className="select-terminal w-full text-left border border-rule px-3 py-2 sm:py-1.5"
      >
        {label || <span className="text-dim">{placeholder ?? '—'}</span>}
      </button>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-activedescendant={`${id}-opt-${activeIndex}`}
          className="absolute z-20 mt-1 w-full min-w-max max-h-64 overflow-y-auto bg-bg border border-rule shadow-lg"
        >
          {options.map((opt, i) => {
            const isActive = i === activeIndex
            const isSelected = opt.value === value
            return (
              <li
                key={opt.value}
                id={`${id}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  // Prevent the button from blurring before we commit.
                  e.preventDefault()
                  commit(i)
                }}
                className={`px-3 py-2 sm:py-1.5 cursor-pointer flex items-center gap-2 ${
                  isActive ? 'bg-accent text-bg' : isSelected ? 'text-accent' : 'text-fg'
                }`}
              >
                <span className={isActive ? 'text-bg/60' : 'text-dim'}>{isSelected ? '✓' : ' '}</span>
                <span>{opt.label}</span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
