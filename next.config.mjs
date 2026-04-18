/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  },
  // Exclude local research directory from the build so next doesn't try to compile it.
  outputFileTracingExcludes: {
    '*': ['.research/**/*']
  }
}

export default nextConfig
