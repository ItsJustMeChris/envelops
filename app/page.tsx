import { headers } from 'next/headers'
import Link from 'next/link'

import { baseUrl } from '@/lib/config'

export const dynamic = 'force-dynamic'

async function currentHostname(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return baseUrl()
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export default async function Home() {
  const hostname = await currentHostname()
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-accent text-lg mb-4">envelops</h1>
      <div className="rule mb-8" />
      <p className="mb-4">self-hosted open-source ops panel for dotenvx.</p>
      <p className="text-dim mb-6">point your <code>dotenvx-ops</code> cli at this instance:</p>

      <div className="space-y-3 mb-10">
        <pre className="border border-rule px-4 py-3 overflow-x-auto"><code><span className="text-dim">$ </span>DOTENVX_OPS_HOSTNAME=<span className="text-accent">{hostname}</span> dotenvx-ops login</code></pre>

        <div className="text-dim text-center">— or —</div>

        <pre className="border border-rule px-4 py-3 overflow-x-auto"><code><span className="text-dim">$ </span>dotenvx-ops login --hostname <span className="text-accent">{hostname}</span></code></pre>

        <div className="text-dim text-center">— or —</div>

        <pre className="border border-rule px-4 py-3 overflow-x-auto"><code><span className="text-dim">$ </span>echo <span className="text-accent">{`'DOTENVX_OPS_HOSTNAME=${hostname}'`}</span>{' >> '}~/Library/Preferences/dotenvx/.env</code></pre>
      </div>

      <div className="rule mb-6" />

      <ul className="space-y-1">
        <li>→ <Link href="/panel">open panel</Link></li>
        <li>→ <Link href="/login/device">approve a device login</Link></li>
      </ul>
    </main>
  )
}
