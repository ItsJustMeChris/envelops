import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-accent text-lg mb-4">envelops</h1>
      <div className="rule mb-8" />
      <p className="mb-4">self-hosted open-source ops panel for dotenvx.</p>
      <p className="text-dim mb-8">
        point your <code>dotenvx-ops</code> cli at this instance:<br />
        <code>DOTENVX_OPS_HOSTNAME=https://your-host dotenvx-ops login</code>
      </p>
      <ul className="space-y-1">
        <li>→ <Link href="/panel">open panel</Link></li>
        <li>→ <Link href="/login/device">approve a device login</Link></li>
      </ul>
    </main>
  )
}
