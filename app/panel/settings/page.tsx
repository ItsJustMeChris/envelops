import { redirect } from 'next/navigation'

import { currentAccount } from '@/lib/services/panel-auth'
import { listAccountOrganizations } from '@/lib/services/accounts'

export const dynamic = 'force-dynamic'

export default async function SettingsRedirect() {
  const account = await currentAccount()
  if (!account) redirect('/login?next=/panel/settings')
  const [org] = await listAccountOrganizations(account.id)
  if (org) redirect(`/panel/team/${org.slug}/settings`)
  redirect('/panel')
}
