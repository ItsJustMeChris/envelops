import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'

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
import { FlashCleanup } from '@/app/components/flash-cleanup'

export const dynamic = 'force-dynamic'

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
  const visibility = String(formData.get('visibility') ?? 'team') as 'team' | 'restricted'
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
  params,
  searchParams
}: {
  params: Promise<{ slug: string; projectId: string }>
  searchParams: Promise<{
    created?: string
    error?: string
    member_added?: string
    member_removed?: string
    visibility_changed?: string
  }>
}) {
  const { slug, projectId } = await params
  const flash = await searchParams
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
      <FlashCleanup keys={['created', 'error', 'member_added', 'member_removed', 'visibility_changed']} />
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
        {flash.created ? <p className="text-accent mb-4">✔ project created</p> : null}
        {flash.member_added ? <p className="text-accent mb-4">✔ access granted</p> : null}
        {flash.member_removed ? <p className="text-accent mb-4">✔ access revoked</p> : null}
        {flash.visibility_changed ? (
          <p className="text-accent mb-4">✔ visibility set to {flash.visibility_changed}</p>
        ) : null}
        {flash.error ? <p className="text-red-400 mb-4">✘ {flash.error}</p> : null}

        <dl className="grid grid-cols-[10rem_1fr] gap-2">
          <dt className="text-dim">id</dt>
          <dd>{project.dotenvxProjectId}</dd>
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
        <pre className="border border-rule px-4 py-3 overflow-x-auto whitespace-pre-wrap"><code><span className="text-dim">{envXComment}</span>{'\n'}DOTENVX_PROJECT_ID=<span className="text-accent">{project.dotenvxProjectId}</span></code></pre>
      </section>

      {manageable ? (
        <>
          <section>
            <h3 className="mb-4">visibility</h3>
            <form action={changeVisibilityAction} className="flex items-center gap-3">
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
              <button className="border border-rule px-3 py-1.5 hover:border-accent hover:text-accent">
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
                  <ul className="space-y-1">
                    {projectMembers.map((m) => (
                      <li
                        key={m.accountId}
                        className="grid grid-cols-[1fr_10rem_5rem] gap-4 items-center"
                      >
                        <span>{m.email}</span>
                        <span className="text-dim">{m.username}</span>
                        {m.accountId === account.id ? (
                          <span className="text-dim text-xs">(you)</span>
                        ) : (
                          <form action={removeMemberAction}>
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
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {addableMembers.length > 0 ? (
                <section>
                  <h3 className="mb-4">grant access</h3>
                  <form action={addMemberAction} className="flex items-center gap-3">
                    <input type="hidden" name="slug" value={slug} />
                    <input
                      type="hidden"
                      name="project_dotenvx_id"
                      value={project.dotenvxProjectId}
                    />
                    <TerminalSelect
                      name="account_id"
                      required
                      className="flex-1"
                      options={addableMembers.map((m) => ({
                        value: String(m.accountId),
                        label: `${m.email} (${m.role})`
                      }))}
                    />
                    <button className="border border-accent text-accent px-4 py-1.5 hover:bg-accent/10">
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
                <ul className="space-y-1">
                  {[...allTeamMembers]
                    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.email.localeCompare(b.email))
                    .map((m) => (
                      <li
                        key={m.accountId}
                        className="grid grid-cols-[1fr_10rem_6rem] gap-4 items-center"
                      >
                        <span>{m.email}</span>
                        <span className="text-dim">{m.username}</span>
                        <span className={m.role === 'owner' ? 'text-accent' : 'text-dim'}>
                          {m.role}
                        </span>
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
