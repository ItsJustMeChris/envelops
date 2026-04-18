import { redirect } from 'next/navigation'

import { requestLoginLink } from '@/lib/services/panel-auth'
import { githubEnabled } from '@/lib/services/github-oauth'

export const dynamic = 'force-dynamic'

async function sendLink(formData: FormData) {
  'use server'
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const next = String(formData.get('next') ?? '/panel')
  if (!email) return
  await requestLoginLink(email)
  redirect(`/login?sent=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`)
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; next?: string; error?: string }>
}) {
  const params = await searchParams
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-accent text-lg mb-4">sign in</h1>
      <div className="rule mb-6" />

      {params.error === 'expired' ? (
        <p className="mb-6 text-accent">link invalid or expired. request a new one below.</p>
      ) : null}

      {params.sent ? (
        <div className="mb-6">
          <p>if [{params.sent}] is a valid account, a sign-in link is on the way.</p>
          <p className="text-dim mt-2">check your email.</p>
        </div>
      ) : null}

      <form action={sendLink} className="space-y-4">
        <input type="hidden" name="next" value={params.next ?? '/panel'} />
        <label className="block">
          <span className="text-dim">email</span>
          <input
            type="email"
            name="email"
            required
            className="mt-1 w-full bg-transparent border border-rule px-3 py-2"
          />
        </label>
        <button type="submit" className="border border-accent text-accent px-4 py-2 hover:bg-accent/10">
          send link
        </button>
      </form>

      {githubEnabled() ? (
        <>
          <div className="rule my-8" />
          <a
            href={`/login/github?next=${encodeURIComponent(params.next ?? '/panel')}`}
            className="inline-block border border-rule px-4 py-2 hover:border-accent hover:text-accent"
          >
            sign in with github
          </a>
        </>
      ) : null}
    </main>
  )
}
