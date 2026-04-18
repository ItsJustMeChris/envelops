export const DEVICE_CODE_TTL_SECONDS = 899
export const DEVICE_CODE_POLL_INTERVAL_SECONDS = 5

export function baseUrl(): string {
  const v = process.env.OSOPS_BASE_URL
  if (v && v.length > 0) return v.replace(/\/$/, '')
  return 'http://localhost:3000'
}
