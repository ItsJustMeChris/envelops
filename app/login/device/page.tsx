import Link from 'next/link'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { currentAccount } from '@/lib/services/panel-auth'
import { approveDeviceCode, findPendingDeviceCodeByUserCode } from '@/lib/services/oauth'

export const dynamic = 'force-dynamic'

async function approve(formData: FormData) {
  'use server'
  const raw = String(formData.get('user_code') ?? '').trim().toUpperCase().replace(/-/g, '')
  const account = await currentAccount()
  if (!account) redirect(`/login?next=/login/device?user_code=${raw}`)
  if (!raw) return

  const pending = await findPendingDeviceCodeByUserCode(raw)
  if (!pending) return
  if (pending.expiresAt.getTime() < Date.now()) return
  await approveDeviceCode(pending.id, account.id)
  revalidatePath('/login/device')
  redirect(`/login/device?ok=${raw}`)
}

export default async function DevicePage({
  searchParams
}: {
  searchParams: Promise<{ user_code?: string; ok?: string }>
}) {
  const params = await searchParams
  const account = await currentAccount()
  const defaultCode = (params.user_code ?? '').toUpperCase().replace(/-/g, '')
  const ok = params.ok

  if (!account) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-accent text-lg mb-4">authorize device</h1>
        <div className="rule mb-6" />
        <p className="text-dim mb-4">
          sign in first, then enter the device code shown by your cli.
        </p>
        <Link href={`/login?next=${encodeURIComponent(`/login/device${defaultCode ? `?user_code=${defaultCode}` : ''}`)}`}>
          → go to sign in
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-accent text-lg mb-4">authorize device</h1>
      <div className="rule mb-6" />
      <p className="text-dim mb-2">signed in as {account.email}</p>
      <p className="mb-6">enter the device code shown in your cli output.</p>

      {ok ? (
        <p className="mb-6 text-accent">✔ approved [{ok}]. return to your cli — it will finish logging in shortly.</p>
      ) : null}

      <form action={approve} className="space-y-4">
        <label className="block">
          <span className="text-dim">user code</span>
          <input
            name="user_code"
            defaultValue={defaultCode}
            autoComplete="off"
            placeholder="e.g. 64CD59D8"
            className="mt-1 w-full bg-transparent border border-rule px-3 py-2 tracking-widest text-accent"
          />
        </label>
        <button type="submit" className="border border-accent text-accent px-4 py-2 hover:bg-accent/10">
          approve
        </button>
      </form>
    </main>
  )
}
