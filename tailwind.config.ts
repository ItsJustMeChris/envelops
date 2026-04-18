import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      colors: {
        // Terminal-ish palette matching the Ops aesthetic (cream-on-black)
        bg: '#0a0a0a',
        fg: '#e8dcc4',
        dim: '#8a7f6a',
        accent: '#ffcc66',
        rule: '#2a2622'
      }
    }
  },
  plugins: []
}

export default config
