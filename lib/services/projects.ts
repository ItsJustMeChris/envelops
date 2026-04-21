import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'

import { getDb } from '../db/client'
import {
  memberships,
  organizations,
  projectAccess,
  projects,
  type Project
} from '../db/schema'
import { personalOrgForAccount } from './teams'

function generateProjectId(): string {
  return `prj_${randomBytes(16).toString('hex')}`
}

export async function resolveOrCreateProject(input: {
  accountId: number
  dotenvxProjectId?: string | null
  orgSlug?: string | null
  cwdName?: string | null
}): Promise<Project> {
  const { db } = getDb()

  if (input.dotenvxProjectId) {
    const existing = await db.query.projects.findFirst({
      where: eq(projects.dotenvxProjectId, input.dotenvxProjectId)
    })
    if (existing) {
      await assertCanAccessProject(input.accountId, existing)
      return existing
    }
  }

  // Need an org. Prefer explicit slug; fall back to caller's primary (personal team).
  const orgId = input.orgSlug
    ? await orgIdForAccountBySlug(input.accountId, input.orgSlug)
    : await personalOrgForAccount(input.accountId)

  if (!input.dotenvxProjectId && !input.cwdName) {
    throw new Error('resolveOrCreateProject: must supply dotenvxProjectId or cwdName')
  }

  // Reuse an existing project with the same cwd name in this org so a sync from a
  // checkout without `.env.x` lands on the right project instead of minting a
  // duplicate. Names are unique per-org (see projects_org_name_idx).
  if (!input.dotenvxProjectId && input.cwdName) {
    const existingByName = await db.query.projects.findFirst({
      where: and(eq(projects.orgId, orgId), eq(projects.name, input.cwdName))
    })
    if (existingByName) {
      await assertCanAccessProject(input.accountId, existingByName)
      return existingByName
    }
  }

  await assertCanCreateProjectInOrg(input.accountId, orgId)
  const inserted = await db
    .insert(projects)
    .values({
      orgId,
      dotenvxProjectId: input.dotenvxProjectId ?? generateProjectId(),
      name: input.cwdName ?? null,
      visibility: 'team',
      createdBy: input.accountId
    })
    .returning()
  return inserted[0]
}

async function orgIdForAccountBySlug(accountId: number, slug: string): Promise<number> {
  const { db } = getDb()
  const row = await db
    .select({ id: organizations.id })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(and(eq(memberships.accountId, accountId), eq(organizations.slug, slug)))
    .limit(1)
  if (!row[0]) throw new Error(`forbidden: not a member of org ${slug}`)
  return row[0].id
}

async function assertCanCreateProjectInOrg(accountId: number, orgId: number): Promise<void> {
  const { db } = getDb()
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, accountId), eq(memberships.orgId, orgId))
  })
  if (!membership) throw new Error('forbidden: caller is not a member of the owning org')
}

export async function resolveOrgForAccount(input: {
  accountId: number
  orgSlug?: string | null
}): Promise<number> {
  return input.orgSlug
    ? orgIdForAccountBySlug(input.accountId, input.orgSlug)
    : personalOrgForAccount(input.accountId)
}

/**
 * Throws `forbidden: ...` if the account cannot access this project. Centralizes
 * the rule: org membership is necessary; if the project is restricted, the caller
 * must also be an explicit project_access member OR an org owner/admin.
 */
export async function assertCanAccessProject(
  accountId: number,
  project: Project
): Promise<void> {
  const { db } = getDb()
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, accountId), eq(memberships.orgId, project.orgId))
  })
  if (!membership) throw new Error('forbidden: caller is not a member of the owning org')

  if (project.visibility === 'team') return

  // Restricted: org owners/admins always have access (for management).
  if (membership.role === 'owner' || membership.role === 'admin') return

  const access = await db.query.projectAccess.findFirst({
    where: and(
      eq(projectAccess.projectId, project.id),
      eq(projectAccess.accountId, accountId)
    )
  })
  if (!access) throw new Error('forbidden: project is restricted and caller is not a member')
}

/**
 * Bare membership check — caller is in the org in any role. Used for URI-scoped
 * writes where the URI resolves to an org but not a project (e.g. rotation URIs).
 */
export async function assertAccountIsOrgMember(
  accountId: number,
  orgId: number
): Promise<void> {
  const { db } = getDb()
  const row = await db.query.memberships.findFirst({
    where: and(eq(memberships.accountId, accountId), eq(memberships.orgId, orgId))
  })
  if (!row) throw new Error('forbidden: caller is not a member of the owning org')
}

export async function canAccessProject(accountId: number, project: Project): Promise<boolean> {
  try {
    await assertCanAccessProject(accountId, project)
    return true
  } catch {
    return false
  }
}

export async function listProjectsForOrg(orgId: number): Promise<Project[]> {
  const { db } = getDb()
  return db
    .select()
    .from(projects)
    .where(eq(projects.orgId, orgId))
    .orderBy(projects.createdAt)
}

export async function listAccessibleProjectsForAccountInOrg(input: {
  accountId: number
  orgId: number
}): Promise<Project[]> {
  const all = await listProjectsForOrg(input.orgId)
  const filtered: Project[] = []
  for (const p of all) {
    if (await canAccessProject(input.accountId, p)) filtered.push(p)
  }
  return filtered
}

export class ProjectNameConflictError extends Error {
  constructor(public readonly name: string) {
    super(`project name "${name}" already exists in this team`)
    this.name = 'ProjectNameConflictError'
  }
}

export async function createProject(input: {
  orgId: number
  name: string
  visibility: 'team' | 'restricted'
  createdBy: number
}): Promise<Project> {
  const { db } = getDb()
  const trimmed = input.name.trim()
  const nameValue = trimmed.length > 0 ? trimmed : null
  if (nameValue) {
    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.orgId, input.orgId), eq(projects.name, nameValue))
    })
    if (existing) throw new ProjectNameConflictError(nameValue)
  }
  const inserted = await db
    .insert(projects)
    .values({
      orgId: input.orgId,
      dotenvxProjectId: generateProjectId(),
      name: nameValue,
      visibility: input.visibility,
      createdBy: input.createdBy
    })
    .returning()
  const project = inserted[0]

  // Creator of a restricted project is implicitly a member so they don't lose access
  // the moment they create it (org admin/owner fallback covers most of this, but
  // this keeps things clean when the creator is a plain member).
  if (project.visibility === 'restricted') {
    await db
      .insert(projectAccess)
      .values({ projectId: project.id, accountId: input.createdBy })
      .onConflictDoNothing()
  }
  return project
}

/**
 * Return the explicit project_access roster minus any account who already has
 * access through an owner/admin org role — for those, the row is a no-op and
 * including it in the UI is misleading.
 */
export async function listProjectMembers(projectId: number): Promise<
  Array<{ accountId: number; email: string; username: string }>
> {
  const { db } = getDb()
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) })
  if (!project) return []

  const rows = await db
    .select({ accountId: projectAccess.accountId })
    .from(projectAccess)
    .where(eq(projectAccess.projectId, projectId))
  const ids = rows.map((r) => r.accountId)
  if (ids.length === 0) return []

  const [accs, mems] = await Promise.all([
    db.query.accounts.findMany({ where: (a, { inArray }) => inArray(a.id, ids) }),
    db.query.memberships.findMany({
      where: (m, { and, inArray, eq }) =>
        and(inArray(m.accountId, ids), eq(m.orgId, project.orgId))
    })
  ])
  const roleByAccount = new Map(mems.map((m) => [m.accountId, m.role]))

  return accs
    .filter((a) => {
      const role = roleByAccount.get(a.id)
      return role !== 'owner' && role !== 'admin'
    })
    .map((a) => ({ accountId: a.id, email: a.email, username: a.username }))
}

export async function addProjectMember(input: {
  projectId: number
  accountId: number
}): Promise<void> {
  const { db } = getDb()
  await db
    .insert(projectAccess)
    .values({ projectId: input.projectId, accountId: input.accountId })
    .onConflictDoNothing()
}

export async function removeProjectMember(input: {
  projectId: number
  accountId: number
}): Promise<void> {
  const { db } = getDb()
  await db
    .delete(projectAccess)
    .where(
      and(
        eq(projectAccess.projectId, input.projectId),
        eq(projectAccess.accountId, input.accountId)
      )
    )
}

export async function updateProjectVisibility(input: {
  projectId: number
  visibility: 'team' | 'restricted'
}): Promise<void> {
  const { db } = getDb()
  await db
    .update(projects)
    .set({ visibility: input.visibility })
    .where(eq(projects.id, input.projectId))
}

export function projectDisplayName(p: Project): string {
  return p.name && p.name.length > 0 ? p.name : p.dotenvxProjectId
}

export async function getProjectById(projectId: number): Promise<Project | null> {
  const { db } = getDb()
  return (await db.query.projects.findFirst({ where: eq(projects.id, projectId) })) ?? null
}
