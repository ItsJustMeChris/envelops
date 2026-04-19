// Pluggable email sender. Currently only Mailgun is supported; if the required env vars
// aren't set, email is disabled and callers fall back to logging the link to stdout.
//
// Env vars:
//   ENVELOPS_MAILGUN_API_KEY — Mailgun private API key (e.g. "key-...")
//   ENVELOPS_MAILGUN_URL     — accepts any of:
//     • bare sending domain: "mg.example.com" → expanded to https://api.mailgun.net/v3/mg.example.com
//     • URL missing scheme: "api.mailgun.net/v3/mg.example.com" → https:// prepended
//     • full URL: "https://api.mailgun.net/v3/mg.example.com" (or EU: api.eu.mailgun.net)

export interface SendOptions {
  to: string
  subject: string
  text: string
  from?: string
}

export function emailEnabled(): boolean {
  return Boolean(process.env.ENVELOPS_MAILGUN_API_KEY && process.env.ENVELOPS_MAILGUN_URL)
}

export async function sendEmail(opts: SendOptions): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!emailEnabled()) return { sent: false, error: 'email_disabled' }

  const apiKey = process.env.ENVELOPS_MAILGUN_API_KEY!
  const base = normalizeMailgunBase(process.env.ENVELOPS_MAILGUN_URL!)
  if (!base) return { sent: false, error: 'mailgun_url_invalid' }
  const endpoint = `${base.url}/messages`
  const from = opts.from ?? `envelops <envelops@${base.domain}>`

  const form = new URLSearchParams()
  form.set('from', from)
  form.set('to', opts.to)
  form.set('subject', opts.subject)
  form.set('text', opts.text)

  const auth = Buffer.from(`api:${apiKey}`).toString('base64')
  let resp: Response
  try {
    resp = await fetch(endpoint, {
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

// Accept bare domain, scheme-less URL, or full URL. Returns both the normalized
// messages-base URL (without trailing /messages) and the sending domain for the
// default from-address.
export function normalizeMailgunBase(raw: string): { url: string; domain: string } | null {
  const trimmed = raw.trim().replace(/\/$/, '').replace(/\/messages$/, '')
  if (!trimmed) return null

  // Bare domain (no slashes) — assume US region unless caller passes a full URL.
  if (!trimmed.includes('/')) {
    if (!trimmed.includes('.')) return null
    return { url: `https://api.mailgun.net/v3/${trimmed}`, domain: trimmed }
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return null
  }
  const parts = parsed.pathname.split('/').filter(Boolean)
  const domain = parts[parts.length - 1]
  if (!domain || !domain.includes('.')) return null
  return { url: `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`, domain }
}
