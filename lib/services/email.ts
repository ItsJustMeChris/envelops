// Pluggable email sender. Currently only Mailgun is supported; if the required env vars
// aren't set, email is disabled and callers fall back to logging the link to stdout.
//
// Env vars:
//   ENVELOPS_MAILGUN_API_KEY — Mailgun private API key (e.g. "key-...")
//   ENVELOPS_MAILGUN_URL     — Mailgun domain messages endpoint, e.g.
//                              "https://api.mailgun.net/v3/mg.example.com"

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
  const url = process.env.ENVELOPS_MAILGUN_URL!.replace(/\/$/, '')
  const endpoint = `${url}/messages`
  const from = opts.from ?? defaultFrom(url)

  const form = new URLSearchParams()
  form.set('from', from)
  form.set('to', opts.to)
  form.set('subject', opts.subject)
  form.set('text', opts.text)

  const auth = Buffer.from(`api:${apiKey}`).toString('base64')
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    return { sent: false, error: `mailgun ${resp.status}: ${body.slice(0, 200)}` }
  }
  const json = (await resp.json().catch(() => ({}))) as { id?: string }
  return { sent: true, id: json.id }
}

// Derive a sensible from-address from the Mailgun URL so operators don't need a third
// env var for the common case. `https://api.mailgun.net/v3/mg.example.com` → `envelops@mg.example.com`.
function defaultFrom(mailgunUrl: string): string {
  try {
    const parts = new URL(mailgunUrl).pathname.split('/').filter(Boolean)
    const domain = parts[parts.length - 1]
    if (domain && domain.includes('.')) return `envelops <envelops@${domain}>`
  } catch {
    // fall through
  }
  return 'envelops <no-reply@localhost>'
}
