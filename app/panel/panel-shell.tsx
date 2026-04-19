'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

type Org = { id: number; slug: string }

export function PanelShell({
  account,
  orgs,
  children
}: {
  account: { username: string; email: string }
  orgs: Org[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on navigation. Keeps desktop untouched (drawer is invisible there).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <header className="lg:hidden flex items-center justify-between border-b border-rule px-4 py-3 sticky top-0 bg-bg z-10">
        <Link href="/panel" className="text-accent no-underline">
          envelops
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="panel-drawer"
          className="text-dim hover:text-fg text-xs border border-rule px-2 py-1"
        >
          {open ? '[close]' : '[menu]'}
        </button>
      </header>

      <aside
        id="panel-drawer"
        className={`${open ? 'block' : 'hidden'} lg:block border-b lg:border-b-0 border-rule p-4 lg:py-8 lg:px-6 lg:flex lg:flex-col lg:h-screen lg:sticky lg:top-0`}
      >
        <div className="mb-6">
          <div className="text-accent">{account.username}</div>
          <div className="text-dim text-xs break-all">{account.email}</div>
        </div>

        <div className="text-dim text-xs mb-2">teams</div>
        <ul className="space-y-1 lg:mb-auto">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link href={`/panel/team/${o.slug}`}>· {o.slug}</Link>
            </li>
          ))}
        </ul>

        <form action="/api/panel/logout" method="post" className="mt-6 lg:mt-0">
          <button className="text-dim hover:text-fg text-xs" type="submit">
            sign out
          </button>
        </form>
      </aside>

      <main className="lg:border-l border-rule p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  )
}
