import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator'

/**
 * Generate a single 2-word funky slug like `brave-otter`. Word lists are
 * adjective + animal — ~28k * ~350 = ~10M combinations, plenty of headroom.
 */
export function funkyName(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: '-',
    length: 2,
    style: 'lowerCase'
  })
}

/**
 * Try `desired` once; if taken, fall back to funky 2-word names. Avoids the
 * predictable `name-2`, `name-3` ladder that lets a caller enumerate or squat
 * adjacent slugs by guessing what someone else just took.
 *
 * Caps retries so a pathologically-saturated namespace fails loudly rather than
 * looping forever.
 */
export async function firstAvailableSlug(
  desired: string,
  isTaken: (slug: string) => Promise<boolean>
): Promise<string> {
  if (!(await isTaken(desired))) return desired
  for (let i = 0; i < 50; i++) {
    const candidate = funkyName()
    if (!(await isTaken(candidate))) return candidate
  }
  throw new Error('exhausted attempts to find an unused funky name')
}
