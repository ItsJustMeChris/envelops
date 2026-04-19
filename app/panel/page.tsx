import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { currentAccount } from '@/lib/services/panel-auth'
import { personalOrgForAccount } from '@/lib/services/teams'
import { getDb } from '@/lib/db/client'
import { organizations } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function PanelIndex() {
  const account = await currentAccount()
  if (!account) redirect('/login?next=/panel')

  const orgId = await personalOrgForAccount(account.id)
  const { db } = getDb()
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) })
  if (org) redirect(`/panel/team/${org.slug}`)

  return (
    <section>
      <h1 className="text-accent text-lg mb-4">no teams yet</h1>
      <div className="rule mb-6" />
      <p className="text-dim">something went wrong during bootstrap — every account should have a personal team.</p>
    </section>
  )
}
