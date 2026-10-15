/**
 * Numbers the test benches tweak (countdown, arrival radius, raid odds...).
 * Ignored unless ALLOW_TEST_OVERRIDES=1, so a stray variable on the server
 * can't change the game; a value that isn't a finite number is ignored too
 * (a NaN arrival radius would make every race unfinishable).
 */
const allowed = process.env.ALLOW_TEST_OVERRIDES === "1"

export function testOverride(name: string): number | null {
  if (!allowed) return null
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return null
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    console.warn(`Ignoring ${name}=${raw}: not a number`)
    return null
  }
  console.warn(`Test override active: ${name}=${value}`)
  return value
}

/**
 * A real setting from the environment (production sets RACE_COUNTDOWN_SECONDS
 * to 300): always honoured, but a value that isn't a number at least `min`
 * falls back to the default instead of breaking the game.
 */
export function configNumber(name: string, fallback: number, min = 0): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min) {
    console.warn(`Ignoring ${name}=${raw}: expected a number >= ${min}; using ${fallback}`)
    return fallback
  }
  return value
}
