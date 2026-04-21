import { and, eq } from 'drizzle-orm'

import { getDb } from '../db/client'
import { memberships, organizations } from '../db/schema'
import { personalOrgForAccount } from './teams'

export type RoutedUri = {
  orgId: number
  key: string
  uri: string
}

export class SecretRouteForbiddenError extends Error {
  constructor(public readonly slug: string) {
    super(`forbidden: caller is not a member of ${slug}`)
  }
}

// `envelops://<slug>/<key>` — key portion may contain slashes so namespaced
// names (e.g. `stripe/prod/key`) still parse.
const ENVELOPS_URI = /^envelops:\/\/([^\/\s]+)\/(\S+)$/

/**
 * Resolve the (org, key) a caller's `uri` should land in.
 *
 *   - `envelops://<slug>/<key>` → that org if the caller is a member
 *     (throws `SecretRouteForbiddenError` if the slug exists but they aren't).
 *     If the slug doesn't resolve at all, the URI is treated as unqualified
 *     and silently routes to the caller's personal org with the full verbatim
 *     URI as the key — prevents a typo from leaking into a stranger's org
 *     while still giving the caller back something they can read later.
 *   - Anything else → caller's personal org, with `key = uri` verbatim.
 */
export async function routeUriForAccount(input: {
  accountId: number
  uri: string
}): Promise<RoutedUri> {
  const match = input.uri.match(ENVELOPS_URI)
  if (match) {
    const [, slug, key] = match
    const { db } = getDb()
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug)
    })
    if (org) {
      const membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, org.id),
          eq(memberships.accountId, input.accountId)
        )
      })
      if (!membership) throw new SecretRouteForbiddenError(slug)
      return { orgId: org.id, key, uri: input.uri }
    }
    // Slug doesn't exist — fall through to personal.
  }

  const orgId = await personalOrgForAccount(input.accountId)
  return { orgId, key: input.uri, uri: input.uri }
}
