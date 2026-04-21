import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { currentAccount } from '@/lib/services/panel-auth'
import { isAdminRole, resolveTeamForAccount } from '@/lib/services/team-scope'

export const dynamic = 'force-dynamic'

export default async function TeamLayout({
  children,
  params
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()

  return (
    <section>
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="text-accent text-lg truncate">{team.org.slug}</div>
          <div className="text-dim text-xs">role: {team.role}</div>
        </div>
        <nav className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto whitespace-nowrap space-x-4 scrollbar-none">
          <Link href={`/panel/team/${slug}`}>keys</Link>
          <Link href={`/panel/team/${slug}/projects`}>projects</Link>
          <Link href={`/panel/team/${slug}/secrets`}>secrets</Link>
          <Link href={`/panel/team/${slug}/members`}>members</Link>
          <Link href={`/panel/team/${slug}/rotations`}>rotations</Link>
          {isAdminRole(team.role) ? (
            <Link href={`/panel/team/${slug}/audit`}>audit</Link>
          ) : null}
          <Link href={`/panel/team/${slug}/settings`}>settings</Link>
        </nav>
      </div>
      <div className="rule mb-6" />
      {children}
    </section>
  )
}
