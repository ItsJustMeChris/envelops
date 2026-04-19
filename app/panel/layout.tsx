import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { currentAccount } from '@/lib/services/panel-auth'
import { listAccountOrganizations } from '@/lib/services/accounts'
import { PanelShell } from './panel-shell'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const account = await currentAccount()
  if (!account) redirect('/login?next=/panel')

  const orgs = await listAccountOrganizations(account.id)

  return (
    <PanelShell
      account={{ username: account.username, email: account.email }}
      orgs={orgs.map((o) => ({ id: o.id, slug: o.slug }))}
    >
      {children}
    </PanelShell>
  )
}
