import { redirect } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { listAccountOrganizations } from '@/lib/services/accounts'

export const dynamic = 'force-dynamic'

export default async function AuditRedirect() {
  const account = await currentAccount()
  if (!account) redirect('/login?next=/panel/audit')
  const [org] = await listAccountOrganizations(account.id)
  if (org) redirect(`/panel/team/${org.slug}/audit`)
  redirect('/panel')
}
