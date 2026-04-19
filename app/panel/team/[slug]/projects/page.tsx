import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import {
  createProject,
  listAccessibleProjectsForAccountInOrg,
  projectDisplayName
} from '@/lib/services/projects'
import { requireOwnerOrAdmin } from '@/lib/services/invites'

export const dynamic = 'force-dynamic'

async function createProjectAction(formData: FormData) {
  'use server'
  const slug = String(formData.get('slug'))
  const name = String(formData.get('name') ?? '').trim()
  const visibility = String(formData.get('visibility') ?? 'team') as 'team' | 'restricted'
  const account = await currentAccount()
  if (!account) redirect('/login')
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) redirect('/panel')
  const ok = await requireOwnerOrAdmin({ accountId: account.id, orgId: team.org.id })
  if (!ok) redirect(`/panel/team/${slug}/projects?error=forbidden`)
  if (!name) redirect(`/panel/team/${slug}/projects?error=missing_name`)

  const project = await createProject({
    orgId: team.org.id,
    name,
    visibility,
    createdBy: account.id
  })
  redirect(`/panel/team/${slug}/projects/${project.dotenvxProjectId}?created=1`)
}

export default async function ProjectsPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { slug } = await params
  const flash = await searchParams
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()

  const manageable = await requireOwnerOrAdmin({
    accountId: account.id,
    orgId: team.org.id
  })
  const rows = await listAccessibleProjectsForAccountInOrg({
    accountId: account.id,
    orgId: team.org.id
  })

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4">projects</h2>
        {flash.error ? <p className="text-red-400 mb-4">✘ {flash.error}</p> : null}
        {rows.length === 0 ? (
          <p className="text-dim">ø no projects yet</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((p, i) => (
              <li
                key={p.id}
                className="grid grid-cols-[3rem_1fr_8rem_8rem] gap-4 items-center"
              >
                <span className="text-dim">{String(i + 1).padStart(3, '0')}.</span>
                <Link
                  href={`/panel/team/${slug}/projects/${p.dotenvxProjectId}`}
                  className="text-accent truncate"
                >
                  {projectDisplayName(p)}
                  {p.isDefault ? <span className="text-dim ml-2">(default)</span> : null}
                </Link>
                <span className={p.visibility === 'team' ? 'text-dim' : 'text-accent'}>
                  {p.visibility}
                </span>
                <span className="text-dim text-xs text-right">
                  {p.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manageable ? (
        <section>
          <h3 className="mb-4">create project</h3>
          <form action={createProjectAction} className="space-y-3">
            <input type="hidden" name="slug" value={slug} />
            <div className="grid grid-cols-[1fr_10rem_auto] gap-3">
              <input
                name="name"
                required
                placeholder="name (e.g. ios-app)"
                className="bg-transparent border border-rule px-3 py-1.5"
              />
              <select
                name="visibility"
                defaultValue="team"
                className="bg-transparent border border-rule px-2 py-1.5"
              >
                <option value="team">team-wide</option>
                <option value="restricted">restricted</option>
              </select>
              <button className="border border-accent text-accent px-4 py-1.5 hover:bg-accent/10">
                create
              </button>
            </div>
            <p className="text-dim text-xs">
              team-wide projects are accessible to every member. restricted projects require
              explicit access per account (owners/admins always have access).
            </p>
          </form>
        </section>
      ) : null}
    </div>
  )
}
