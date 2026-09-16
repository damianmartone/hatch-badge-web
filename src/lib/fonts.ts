/** Weights the badge renderer draws with. */
const WEIGHTS = [500, 600, 700]

let ready: Promise<void> | null = null

/**
 * Canvas text measurement silently falls back to a system font if Geist hasn't
 * loaded yet, which would shift the whole layout. Await this before rendering.
 */
export function ensureGeist(): Promise<void> {
  if (!ready) {
    ready = Promise.all(
      WEIGHTS.map((w) => document.fonts.load(`${w} 64px Geist`, 'ABCabc0123')),
    )
      .then(() => document.fonts.ready)
      .then(() => undefined)
      .catch(() => undefined)
  }
  return ready
}
