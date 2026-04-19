'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { currentAccount } from '@/lib/services/panel-auth'
import { approveDeviceCode, findPendingDeviceCodeByUserCode } from '@/lib/services/oauth'

export async function approveDevice(formData: FormData) {
  const raw = String(formData.get('user_code') ?? '').trim().toUpperCase().replace(/-/g, '')
  const account = await currentAccount()
  if (!account) redirect(`/login?next=/login/device?user_code=${raw}`)
  if (!raw) redirect('/login/device?err=empty')

  const pending = await findPendingDeviceCodeByUserCode(raw)
  if (!pending) redirect(`/login/device?err=invalid&code=${raw}`)
  if (pending!.expiresAt.getTime() < Date.now()) redirect(`/login/device?err=expired&code=${raw}`)
  await approveDeviceCode(pending!.id, account.id)
  revalidatePath('/login/device')
  redirect(`/login/device?ok=${raw}`)
}
