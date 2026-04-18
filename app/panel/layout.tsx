import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { currentAccount } from '@/lib/services/panel-auth'
import { listAccountOrganizations } from '@/lib/services/accounts'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const account = await currentAccount()
  if (!account) redirect('/login?next=/panel')

  const orgs = await listAccountOrganizations(account.id)

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr]">
      <aside className="p-6 flex flex-col h-screen sticky top-0">
        <div className="mb-6">
          <div className="text-accent">{account.username}</div>
          <div className="text-dim text-xs">{account.email}</div>
        </div>

        <nav className="space-y-1 mb-8">
          <Link className="block" href="/panel">◆ private keys</Link>
          <Link className="block" href="/panel/audit">☷ audit log</Link>
          <Link className="block" href="/panel/settings">⌘ settings</Link>
        </nav>

        <div className="text-dim text-xs mb-2">teams</div>
        <ul className="space-y-1 mb-auto">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link href={`/panel/team/${o.slug}`}>· {o.slug}</Link>
            </li>
          ))}
        </ul>

        <form action="/api/panel/logout" method="post">
          <button className="text-dim hover:text-fg text-xs" type="submit">
            sign out
          </button>
        </form>
      </aside>

      <main className="border-l border-rule p-8">{children}</main>
    </div>
  )
}
