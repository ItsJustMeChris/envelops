import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { currentAccount } from '@/lib/services/panel-auth'
import { resolveTeamForAccount } from '@/lib/services/team-scope'
import {
  addProjectMember,
  assertCanAccessProject,
  listProjectMembers,
  projectDisplayName,
  removeProjectMember,
  updateProjectVisibility
} from '@/lib/services/projects'
import { getMemberRole, listMembers, requireOwnerOrAdmin } from '@/lib/services/invites'
import { getDb } from '@/lib/db/client'
import { projects as projectsTable } from '@/lib/db/schema'
import { TerminalSelect } from '@/app/components/terminal-select'
import { FlashToasts } from '@/app/components/flash-toasts'

export const dynamic = 'force-dynamic'

const visibilitySchema = z.enum(['team', 'restricted'])

function roleRank(role: 'owner' | 'admin' | 'member'): number {
  return role === 'owner' ? 0 : role === 'admin' ? 1 : 2
}

async function addMemberAction(formData: FormData) {
  'use server'
  const slug = String(formData.get('slug'))
  const projectDotenvxId = String(formData.get('project_dotenvx_id'))
  const accountIdToAdd = Number(formData.get('account_id'))
  const actor = await currentAccount()
  if (!actor) redirect('/login')
  const team = await resolveTeamForAccount({ accountId: actor.id, slug })
  if (!team) redirect('/panel')
  const ok = await requireOwnerOrAdmin({ accountId: actor.id, orgId: team.org.id })
  if (!ok) redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?error=forbidden`)

  const { db } = getDb()
  const project = await db.query.projects.findFirst({
    where: eq(projectsTable.dotenvxProjectId, projectDotenvxId)
  })
  if (!project || project.orgId !== team.org.id) {
    redirect(`/panel/team/${slug}/projects?error=project_not_found`)
  }
  const targetRole = await getMemberRole({ accountId: accountIdToAdd, orgId: team.org.id })
  if (!targetRole) {
    redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?error=target_not_team_member`)
  }
  if (targetRole === 'owner' || targetRole === 'admin') {
    redirect(
      `/panel/team/${slug}/projects/${projectDotenvxId}?error=target_has_role_access`
    )
  }
  await addProjectMember({ projectId: project!.id, accountId: accountIdToAdd })
  redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?member_added=${accountIdToAdd}`)
}

async function removeMemberAction(formData: FormData) {
  'use server'
  const slug = String(formData.get('slug'))
  const projectDotenvxId = String(formData.get('project_dotenvx_id'))
  const accountIdToRemove = Number(formData.get('account_id'))
  const actor = await currentAccount()
  if (!actor) redirect('/login')
  if (accountIdToRemove === actor.id) {
    redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?error=cannot_revoke_self`)
  }
  const team = await resolveTeamForAccount({ accountId: actor.id, slug })
  if (!team) redirect('/panel')
  const ok = await requireOwnerOrAdmin({ accountId: actor.id, orgId: team.org.id })
  if (!ok) redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?error=forbidden`)

  const { db } = getDb()
  const project = await db.query.projects.findFirst({
    where: eq(projectsTable.dotenvxProjectId, projectDotenvxId)
  })
  if (!project || project.orgId !== team.org.id) {
    redirect(`/panel/team/${slug}/projects?error=project_not_found`)
  }
  await removeProjectMember({ projectId: project!.id, accountId: accountIdToRemove })
  redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?member_removed=${accountIdToRemove}`)
}

async function changeVisibilityAction(formData: FormData) {
  'use server'
  const slug = String(formData.get('slug'))
  const projectDotenvxId = String(formData.get('project_dotenvx_id'))
  const parsedVisibility = visibilitySchema.safeParse(formData.get('visibility'))
  if (!parsedVisibility.success) {
    redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?error=invalid_visibility`)
  }
  const visibility = parsedVisibility.data
  const actor = await currentAccount()
  if (!actor) redirect('/login')
  const team = await resolveTeamForAccount({ accountId: actor.id, slug })
  if (!team) redirect('/panel')
  const ok = await requireOwnerOrAdmin({ accountId: actor.id, orgId: team.org.id })
  if (!ok) redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?error=forbidden`)

  const { db } = getDb()
  const project = await db.query.projects.findFirst({
    where: eq(projectsTable.dotenvxProjectId, projectDotenvxId)
  })
  if (!project || project.orgId !== team.org.id) {
    redirect(`/panel/team/${slug}/projects?error=project_not_found`)
  }
  await updateProjectVisibility({ projectId: project!.id, visibility })
  redirect(`/panel/team/${slug}/projects/${projectDotenvxId}?visibility_changed=${visibility}`)
}

export default async function ProjectDetailPage({
  params
}: {
  params: Promise<{ slug: string; projectId: string }>
}) {
  const { slug, projectId } = await params
  const account = await currentAccount()
  if (!account) notFound()
  const team = await resolveTeamForAccount({ accountId: account.id, slug })
  if (!team) notFound()

  const { db } = getDb()
  const project = await db.query.projects.findFirst({
    where: eq(projectsTable.dotenvxProjectId, projectId)
  })
  if (!project || project.orgId !== team.org.id) notFound()

  try {
    await assertCanAccessProject(account.id, project)
  } catch {
    redirect(`/panel/team/${slug}/projects?error=forbidden`)
  }

  const manageable = await requireOwnerOrAdmin({
    accountId: account.id,
    orgId: team.org.id
  })

  const [projectMembers, allTeamMembers] = await Promise.all([
    listProjectMembers(project.id),
    listMembers(team.org.id)
  ])
  const projectMemberIds = new Set(projectMembers.map((m) => m.accountId))
  // Owners/admins always have access via role — granting them explicit access
  // is a no-op, so leave them out of the dropdown entirely.
  const addableMembers = allTeamMembers.filter(
    (m) => m.role === 'member' && !projectMemberIds.has(m.accountId)
  )

  const envXComment = `# ${team.org.slug}/${projectDisplayName(project)}`

  return (
    <div className="space-y-8">
      <FlashToasts
        specs={[
          { key: 'created', equals: '1', message: '✔ project created' },
          { key: 'member_added', message: '✔ access granted' },
          { key: 'member_removed', message: '✔ access revoked' },
          { key: 'visibility_changed', template: '✔ visibility set to {value}' },
          { key: 'error', template: '✘ {value}', tone: 'error' }
        ]}
      />
      <nav className="flex gap-4 text-sm">
        <Link
          href={`/panel/team/${slug}/projects/${project.dotenvxProjectId}/files`}
          className="text-dim hover:text-fg underline underline-offset-4"
        >
          files
        </Link>
        <Link
          href={`/panel/team/${slug}/projects/${project.dotenvxProjectId}/sync-history`}
          className="text-dim hover:text-fg underline underline-offset-4"
        >
          sync history
        </Link>
      </nav>

      <section>
        <h2 className="mb-4">{projectDisplayName(project)}</h2>

        <dl className="grid grid-cols-[6rem_1fr] sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-2">
          <dt className="text-dim">id</dt>
          <dd className="break-all">{project.dotenvxProjectId}</dd>
          <dt className="text-dim">visibility</dt>
          <dd className={project.visibility === 'team' ? 'text-fg' : 'text-accent'}>
            {project.visibility}
            {project.isDefault ? <span className="text-dim ml-2">(default)</span> : null}
          </dd>
          <dt className="text-dim">created</dt>
          <dd>{project.createdAt.toISOString().slice(0, 10)}</dd>
        </dl>
      </section>

      <section>
        <h3 className="mb-2">.env.x</h3>
        <p className="text-dim text-xs mb-2">
          drop this file at the root of any project directory that should sync/encrypt against
          this project.
        </p>
        <pre className="border border-rule px-3 sm:px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all text-xs sm:text-sm"><code><span className="text-dim">{envXComment}</span>{'\n'}DOTENVX_PROJECT_ID=<span className="text-accent">{project.dotenvxProjectId}</span></code></pre>
      </section>

      {manageable ? (
        <>
          <section>
            <h3 className="mb-4">visibility</h3>
            <form action={changeVisibilityAction} className="flex flex-col sm:flex-row sm:items-center gap-3">
              <input type="hidden" name="slug" value={slug} />
              <input
                type="hidden"
                name="project_dotenvx_id"
                value={project.dotenvxProjectId}
              />
              <TerminalSelect
                name="visibility"
                defaultValue={project.visibility}
                options={[
                  { value: 'team', label: 'team-wide' },
                  { value: 'restricted', label: 'restricted' }
                ]}
              />
              <button className="border border-rule px-3 py-2 sm:py-1.5 hover:border-accent hover:text-accent">
                save
              </button>
            </form>
          </section>

          {project.visibility === 'restricted' ? (
            <>
              <section>
                <h3 className="mb-4">access list</h3>
                <p className="text-dim text-xs mb-4">
                  team owners and admins always have access to every project. this list is for
                  granting access to plain members.
                </p>
                {projectMembers.length === 0 ? (
                  <p className="text-dim">ø no members granted yet</p>
                ) : (
                  <ul className="space-y-2 sm:space-y-1">
                    {projectMembers.map((m) => (
                      <li
                        key={m.accountId}
                        className="grid grid-cols-[1fr_auto] gap-x-3 sm:grid-cols-[1fr_10rem_5rem] sm:gap-4 sm:items-center"
                      >
                        <span className="truncate min-w-0">{m.email}</span>
                        {m.accountId === account.id ? (
                          <span className="text-dim text-xs justify-self-end sm:justify-self-auto sm:order-last">(you)</span>
                        ) : (
                          <form action={removeMemberAction} className="justify-self-end sm:justify-self-auto sm:order-last">
                            <input type="hidden" name="slug" value={slug} />
                            <input
                              type="hidden"
                              name="project_dotenvx_id"
                              value={project.dotenvxProjectId}
                            />
                            <input type="hidden" name="account_id" value={m.accountId} />
                            <button className="text-dim hover:text-fg underline text-xs">
                              [revoke]
                            </button>
                          </form>
                        )}
                        <span className="text-dim text-xs col-start-1 sm:col-start-auto sm:text-sm">
                          {m.username}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {addableMembers.length > 0 ? (
                <section>
                  <h3 className="mb-4">grant access</h3>
                  <form action={addMemberAction} className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input type="hidden" name="slug" value={slug} />
                    <input
                      type="hidden"
                      name="project_dotenvx_id"
                      value={project.dotenvxProjectId}
                    />
                    <TerminalSelect
                      name="account_id"
                      required
                      className="sm:flex-1 min-w-0"
                      options={addableMembers.map((m) => ({
                        value: String(m.accountId),
                        label: `${m.email} (${m.role})`
                      }))}
                    />
                    <button className="border border-accent text-accent px-4 py-2 sm:py-1.5 hover:bg-accent/10">
                      grant
                    </button>
                  </form>
                </section>
              ) : null}
            </>
          ) : (
            <section>
              <h3 className="mb-4">access</h3>
              <p className="text-dim text-xs mb-4">
                team-wide project — every team member has access. switch to restricted to manage a
                specific access list.
              </p>
              {allTeamMembers.length === 0 ? (
                <p className="text-dim">ø no team members</p>
              ) : (
                <ul className="space-y-2 sm:space-y-1">
                  {[...allTeamMembers]
                    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.email.localeCompare(b.email))
                    .map((m) => (
                      <li
                        key={m.accountId}
                        className="block sm:grid sm:grid-cols-[1fr_10rem_6rem] sm:gap-4"
                      >
                        <span className="block break-all">{m.email}</span>
                        <div className="flex gap-3 text-xs text-dim sm:contents">
                          <span className="sm:text-sm sm:text-dim">{m.username}</span>
                          <span className={m.role === 'owner' ? 'text-accent' : 'sm:text-dim'}>
                            {m.role}
                          </span>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}
