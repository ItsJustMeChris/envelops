import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-accent text-lg">{team.org.slug}</div>
          <div className="text-dim text-xs">role: {team.role}</div>
        </div>
        <nav className="space-x-4">
          <Link href={`/panel/team/${slug}`}>keys</Link>
          <Link href={`/panel/team/${slug}/projects`}>projects</Link>
          <Link href={`/panel/team/${slug}/secrets`}>secrets</Link>
          <Link href={`/panel/team/${slug}/members`}>members</Link>
          <Link href={`/panel/team/${slug}/rotations`}>rotations</Link>
          <Link href={`/panel/team/${slug}/audit`}>audit</Link>
          <Link href={`/panel/team/${slug}/settings`}>settings</Link>
        </nav>
      </div>
      <div className="rule mb-6" />
      {children}
    </section>
  )
}
