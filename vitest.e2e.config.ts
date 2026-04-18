import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    environment: 'node',
    pool: 'forks'
  },
  resolve: {
    alias: {
      '@': '/Users/chris/Documents/Programming/Repos/envelops'
    }
  }
})
