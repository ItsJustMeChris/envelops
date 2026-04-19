// Pluggable email sender. Currently only Mailgun is supported; if the required env vars
// aren't set, email is disabled and callers fall back to logging the link to stdout.
//
// Env vars:
//   ENVELOPS_MAILGUN_API_KEY      — Mailgun private API key (e.g. "key-...")
//   ENVELOPS_MAILGUN_EMAIL_DOMAIN — your Mailgun sending domain, e.g. "mg.example.com".
//                                   Bare hostname only: no scheme, no path.
//   ENVELOPS_MAILGUN_REGION       — optional, "us" (default) or "eu".

export interface SendOptions {
  to: string
  subject: string
  text: string
  from?: string
}

export function emailEnabled(): boolean {
  return Boolean(process.env.ENVELOPS_MAILGUN_API_KEY && process.env.ENVELOPS_MAILGUN_EMAIL_DOMAIN)
}

const MAILGUN_API_HOSTS = { us: 'api.mailgun.net', eu: 'api.eu.mailgun.net' } as const
const EMAIL_DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

export async function sendEmail(opts: SendOptions): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!emailEnabled()) return { sent: false, error: 'email_disabled' }

  const target = resolveMailgunTarget(
    process.env.ENVELOPS_MAILGUN_EMAIL_DOMAIN!,
    process.env.ENVELOPS_MAILGUN_REGION
  )
  if (!target) return { sent: false, error: 'mailgun_config_invalid' }

  const apiKey = process.env.ENVELOPS_MAILGUN_API_KEY!
  const from = opts.from ?? `envelops <envelops@${target.domain}>`

  const form = new URLSearchParams()
  form.set('from', from)
  form.set('to', opts.to)
  form.set('subject', opts.subject)
  form.set('text', opts.text)

  const auth = Buffer.from(`api:${apiKey}`).toString('base64')
  let resp: Response
  try {
    resp = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    })
  } catch (e) {
    return { sent: false, error: `mailgun fetch failed: ${e instanceof Error ? e.message : 'unknown'}` }
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    return { sent: false, error: `mailgun ${resp.status}: ${body.slice(0, 200)}` }
  }
  const json = (await resp.json().catch(() => ({}))) as { id?: string }
  return { sent: true, id: json.id }
}

// The API host is picked from a hardcoded allowlist keyed by region, never
// taken from operator input — so even if this config is ever surfaced to
// non-root admins, it can't be used to redirect traffic to an attacker host.
export function resolveMailgunTarget(
  rawDomain: string,
  rawRegion?: string
): { endpoint: string; domain: string } | null {
  const domain = rawDomain.trim().toLowerCase()
  if (!EMAIL_DOMAIN_RE.test(domain)) return null

  const region = rawRegion?.trim().toLowerCase() || 'us'
  if (region !== 'us' && region !== 'eu') return null

  return { endpoint: `https://${MAILGUN_API_HOSTS[region]}/v3/${domain}/messages`, domain }
}
