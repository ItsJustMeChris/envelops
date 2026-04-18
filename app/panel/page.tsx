import { redirect } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { listAccountOrganizations } from '@/lib/services/accounts'

export const dynamic = 'force-dynamic'

export default async function PanelIndex() {
  const account = await currentAccount()
  if (!account) redirect('/login?next=/panel')
  const orgs = await listAccountOrganizations(account.id)
  const primary = orgs[0]
  if (primary) redirect(`/panel/team/${primary.slug}`)

  return (
    <section>
      <h1 className="text-accent text-lg mb-4">no teams yet</h1>
      <div className="rule mb-6" />
      <p className="text-dim">something went wrong during bootstrap — every account should have a personal team.</p>
    </section>
  )
}
