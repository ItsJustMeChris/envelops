'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { currentAccount } from '@/lib/services/panel-auth'
import { approveDeviceCode, findPendingDeviceCodeByUserCode } from '@/lib/services/oauth'
import { clientIp } from '@/lib/http/client-ip'
import { rateLimit } from '@/lib/http/rate-limit'

// User codes are only 8 hex chars (~4.3B). Without a throttle, an authenticated
// attacker can iterate the space from a single session and, if they land on a
// live code, approve it against their own account — the victim's CLI then
// polls `/oauth/token` and gets a bearer for the *attacker's* org. Cap guesses
// per source IP so a single actor cannot brute-force the short window.
const DEVICE_APPROVE_LIMIT = 10
const DEVICE_APPROVE_WINDOW_MS = 60_000

export async function approveDevice(formData: FormData) {
  const raw = String(formData.get('user_code') ?? '').trim().toUpperCase().replace(/-/g, '')
  const account = await currentAccount()
  if (!account) redirect(`/login?next=/login/device?user_code=${raw}`)
  if (!raw) redirect('/login/device?err=empty')

  const ip = await clientIp()
  const limited = rateLimit(`device-approve:${ip}`, {
    limit: DEVICE_APPROVE_LIMIT,
    windowMs: DEVICE_APPROVE_WINDOW_MS
  })
  if (!limited.allowed) redirect(`/login/device?err=rate&code=${raw}`)

  const pending = await findPendingDeviceCodeByUserCode(raw)
  if (!pending) redirect(`/login/device?err=invalid&code=${raw}`)
  if (pending!.expiresAt.getTime() < Date.now()) redirect(`/login/device?err=expired&code=${raw}`)
  await approveDeviceCode(pending!.id, account.id)
  revalidatePath('/login/device')
  redirect(`/login/device?ok=${raw}`)
}
