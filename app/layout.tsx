import './globals.css'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'envelops',
  description: 'Self-hosted open-source alternative to the dotenvx Ops panel.'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
