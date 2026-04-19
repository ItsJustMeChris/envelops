import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import {
  createProject,
  listAccessibleProjectsForAccountInOrg,
  projectDisplayName,
  ProjectNameConflictError
} from '@/lib/services/projects'
import { TerminalSelect } from '@/app/components/terminal-select'
import { FlashToasts } from '@/app/components/flash-toasts'

export const dynamic = 'force-dynamic'

const visibilitySchema = z.enum(['team', 'restricted'])

async function createProjectAction(formData: FormData) {
  'use server'
  const slug = String(formData.get('slug'))
  const name = String(formData.get('name') ?? '').trim()
  const parsedVisibility = visibilitySchema.safeParse(formData.get('visibility'))
  if (!parsedVisibility.success) {
    redirect(`/panel/team/${slug}/projects?error=invalid_visibility`)
  }
  const visibility = parsedVisibility.data
  const account = await currentAccount()
  if (!account) redirect('/login')
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) redirect('/panel')
  if (!name) redirect(`/panel/team/${slug}/projects?error=missing_name`)

  let project
  try {
    project = await createProject({
      orgId: team.org.id,
      name,
      visibility,
      createdBy: account.id
    })
  } catch (err) {
    if (err instanceof ProjectNameConflictError) {
      redirect(`/panel/team/${slug}/projects?error=name_taken`)
    }
    throw err
  }
  redirect(`/panel/team/${slug}/projects/${project.dotenvxProjectId}?created=1`)
}

export default async function ProjectsPage({
  params
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()

  const rows = await listAccessibleProjectsForAccountInOrg({
    accountId: account.id,
    orgId: team.org.id
  })

  return (
    <div className="space-y-8">
      <FlashToasts specs={[{ key: 'error', template: '✘ {value}', tone: 'error' }]} />
      <section>
        <h2 className="mb-4">projects</h2>
        {rows.length === 0 ? (
          <p className="text-dim">ø no projects yet</p>
        ) : (
          <ul className="space-y-2 sm:space-y-1">
            {rows.map((p, i) => (
              <li
                key={p.id}
                className="grid grid-cols-[2.5rem_1fr] gap-x-3 sm:grid-cols-[3rem_1fr_8rem_8rem] sm:gap-4 sm:items-center"
              >
                <span className="text-dim">{String(i + 1).padStart(3, '0')}.</span>
                <Link
                  href={`/panel/team/${slug}/projects/${p.dotenvxProjectId}`}
                  className="text-accent truncate min-w-0"
                >
                  {projectDisplayName(p)}
                  {p.isDefault ? <span className="text-dim ml-2">(default)</span> : null}
                </Link>
                <div className="col-start-2 flex gap-3 text-xs text-dim sm:contents">
                  <span className={`sm:text-sm ${p.visibility === 'team' ? 'sm:text-dim' : 'sm:text-accent'}`}>
                    {p.visibility}
                  </span>
                  <span className="sm:text-dim sm:text-xs sm:text-right">
                    {p.createdAt.toISOString().slice(0, 10)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-4">create project</h3>
        <form action={createProjectAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-3">
            <input
              name="name"
              required
              placeholder="name (e.g. ios-app)"
              className="bg-transparent border border-rule px-3 py-2 sm:py-1.5 min-w-0"
            />
            <TerminalSelect
              name="visibility"
              defaultValue="team"
              options={[
                { value: 'team', label: 'team-wide' },
                { value: 'restricted', label: 'restricted' }
              ]}
            />
            <button className="border border-accent text-accent px-4 py-2 sm:py-1.5 hover:bg-accent/10">
              create
            </button>
          </div>
          <p className="text-dim text-xs">
            team-wide projects are accessible to every member. restricted projects require
            explicit access per account (owners/admins always have access).
          </p>
        </form>
      </section>
    </div>
  )
}
