import { apiError } from './responses'

export const MAX_ENCODED_BYTES = 5 * 1024 * 1024

/**
 * Read and JSON-parse a request body while enforcing a hard byte ceiling.
 * Rejects oversize requests via Content-Length and again after reading the
 * stream (clients can lie about / omit Content-Length). Pair with a Zod
 * `.max()` on the largest string field for defense in depth.
 */
export async function readJsonWithLimit(
  req: Request,
  maxBytes: number
): Promise<{ ok: true; data: unknown } | { ok: false; res: Response }> {
  const declared = req.headers.get('content-length')
  if (declared) {
    const n = Number(declared)
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, res: apiError(400, 'invalid_request', 'malformed body') }
    }
    if (n > maxBytes) {
      return { ok: false, res: apiError(413, 'payload_too_large', `body exceeds ${maxBytes} bytes`) }
    }
  }

  let text: string
  try {
    text = await req.text()
  } catch {
    return { ok: false, res: apiError(400, 'invalid_request', 'malformed body') }
  }

  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    return { ok: false, res: apiError(413, 'payload_too_large', `body exceeds ${maxBytes} bytes`) }
  }

  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: false, res: apiError(400, 'invalid_request', 'malformed body') }
  }
}
