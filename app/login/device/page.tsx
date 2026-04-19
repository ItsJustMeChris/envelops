import Link from 'next/link'

import { currentAccount } from '@/lib/services/panel-auth'
import { FlashToasts } from '@/app/components/flash-toasts'
import { CodeForm } from './code-form'
import { TerminalPrinter, type TerminalLine } from './terminal-printer'

export const dynamic = 'force-dynamic'

export default async function DevicePage({
  searchParams
}: {
  searchParams: Promise<{ user_code?: string; ok?: string; err?: string; code?: string }>
}) {
  const params = await searchParams
  const account = await currentAccount()
  const defaultCode = (params.user_code ?? '').toUpperCase().replace(/-/g, '')

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

  // Success: terminal tape + continue button. No form.
  if (params.ok) {
    const code = params.ok.toUpperCase()
    const formatted = formatCode(code)
    const lines: TerminalLine[] = [
      { text: `verifying user_code [${formatted}]... ok`, tone: 'ok' },
      { text: `issuing device token for ${account.email}... ok`, tone: 'ok' },
      { text: `device authorized.`, tone: 'ok' }
    ]
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-accent text-lg mb-4">authorize device</h1>
        <div className="rule mb-6" />
        <p className="text-dim mb-4">signed in as {account.email}</p>
        <TerminalPrinter lines={lines} />
        <p className="text-dim text-xs mt-4 mb-6">
          return to your cli — it will finish logging in shortly.
        </p>
        <Link
          href="/panel"
          className="inline-block border border-accent text-accent px-4 py-2 hover:bg-accent/10"
        >
          continue to panel →
        </Link>
      </main>
    )
  }

  // Denial: terminal failure tape + retry / continue. No form.
  if (params.err && params.err !== 'empty') {
    const code = (params.code ?? '').toUpperCase()
    const formatted = code ? formatCode(code) : '—'
    const reason =
      params.err === 'expired'
        ? 'code expired'
        : params.err === 'invalid'
          ? 'code invalid or already used'
          : params.err === 'rate'
            ? 'too many attempts — wait a minute and try again'
            : 'code rejected'
    const lines: TerminalLine[] = [
      { text: `verifying user_code [${formatted}]... FAIL`, tone: 'fail' },
      { text: `device authorization denied: ${reason}.`, tone: 'fail' }
    ]
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-accent text-lg mb-4">authorize device</h1>
        <div className="rule mb-6" />
        <p className="text-dim mb-4">signed in as {account.email}</p>
        <TerminalPrinter lines={lines} />
        <p className="text-dim text-xs mt-4 mb-6">
          ask your cli to restart the login flow — it will print a fresh code.
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/login/device"
            className="inline-block border border-rule px-4 py-2 hover:border-accent hover:text-accent"
          >
            enter a different code
          </Link>
          <Link
            href="/panel"
            className="inline-block border border-accent text-accent px-4 py-2 hover:bg-accent/10"
          >
            continue to panel →
          </Link>
        </div>
      </main>
    )
  }

  // Idle: auto-submitting code form.
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <FlashToasts
        specs={[
          { key: 'err', equals: 'empty', message: '✘ code required.', tone: 'error' }
        ]}
      />
      <h1 className="text-accent text-lg mb-4">authorize device</h1>
      <div className="rule mb-6" />
      <p className="text-dim mb-2">signed in as {account.email}</p>
      <p className="mb-6">enter the device code shown in your cli output.</p>

      <CodeForm defaultCode={defaultCode} />
    </main>
  )
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}
