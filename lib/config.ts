export const DEVICE_CODE_TTL_SECONDS = 899
export const DEVICE_CODE_POLL_INTERVAL_SECONDS = 5

export function baseUrl(): string {
  const v = process.env.ENVELOPS_BASE_URL
  if (v && v.length > 0) return v.replace(/\/$/, '')
  return 'http://localhost:3000'
}

// Canonical origin derived from baseUrl(). Goes through URL parsing so that
// default ports (`:80`, `:443`) and casing get normalized — browsers strip
// default ports from the `Origin` header, so a raw string compare against
// `ENVELOPS_BASE_URL=https://host:443` would 403 every request.
export function baseOrigin(): string {
  return new URL(baseUrl()).origin
}
