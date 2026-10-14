// Energy & health: the body behind the runner. Pure rules; the game server
// applies them during races and @tiral/db stores them between races.
// See docs/economy-progress.md §13.5 and §14 (phase 2).

export const NEED_MAX = 100

/** Sprint speed vs walking — the only speed edge there is. */
export const SPRINT_MULTIPLIER = 1.35
/** A full tank lasts ~45 s of sprinting (races run 1–2 minutes). */
export const SPRINT_ENERGY_PER_SECOND = NEED_MAX / 45
/** Sprinting on an empty tank burns health instead: ~12 s to collapse. */
export const EMPTY_SPRINT_HEALTH_PER_SECOND = 8
/** Down this long after collapsing, then you carry on. */
export const COLLAPSE_SECONDS = 6
/** Health you get up with after a collapse. */
export const COLLAPSE_RECOVERY_HEALTH = 20

/** Full energy again ~4 hours after empty — being away is never punished. */
export const ENERGY_REGEN_PER_HOUR = 25
/** Health heals slowly on its own… */
export const HEALTH_REGEN_PER_HOUR = 5
/** …and fast while resting in your bed at home. */
export const RESTING_HEALTH_REGEN_PER_HOUR = 60
export const RESTING_ENERGY_REGEN_PER_HOUR = 40

export type Needs = { energy: number; health: number }

export type StoredNeeds = Needs & {
  /** When energy/health were last written. */
  at: Date
  /** Set while the player sleeps at home. */
  restingSince: Date | null
}

const clamp = (value: number) => Math.min(NEED_MAX, Math.max(0, value))

/** Current energy/health from what was stored plus time-based regen. */
export function currentNeeds(stored: StoredNeeds, now: Date): Needs {
  const hours = Math.max(0, now.getTime() - stored.at.getTime()) / 3_600_000
  const resting = stored.restingSince !== null
  return {
    energy: clamp(stored.energy + hours * (resting ? RESTING_ENERGY_REGEN_PER_HOUR : ENERGY_REGEN_PER_HOUR)),
    health: clamp(stored.health + hours * (resting ? RESTING_HEALTH_REGEN_PER_HOUR : HEALTH_REGEN_PER_HOUR))
  }
}

export type SprintTick = Needs & { collapsed: boolean }

/**
 * One tick of sprinting. Energy drains first; once it's empty, health pays.
 * Health hitting zero means a collapse (caller pauses the runner).
 */
export function applySprint(needs: Needs, seconds: number): SprintTick {
  let energy = needs.energy - SPRINT_ENERGY_PER_SECOND * seconds
  let health = needs.health
  if (energy < 0) {
    // The part of this tick spent on an empty tank costs health.
    const emptySeconds = -energy / SPRINT_ENERGY_PER_SECOND
    energy = 0
    health -= EMPTY_SPRINT_HEALTH_PER_SECOND * emptySeconds
  }
  if (health <= 0) {
    return { energy: 0, health: COLLAPSE_RECOVERY_HEALTH, collapsed: true }
  }
  return { energy, health, collapsed: false }
}

export function speedMultiplier(sprinting: boolean, collapsed: boolean): number {
  if (collapsed) return 0
  return sprinting ? SPRINT_MULTIPLIER : 1
}

// Street food at UGX-scale prices (BNG). Food refills energy; a proper meal
// also heals. Nothing makes you faster than a sprint.
export const FOODS = [
  { id: "chapati", name: "Chapati", price: 500, energy: 8, health: 0 },
  { id: "gonja", name: "Gonja", price: 1_000, energy: 15, health: 0 },
  { id: "rolex", name: "Rolex", price: 2_000, energy: 35, health: 0 },
  { id: "kikomando", name: "Kikomando", price: 3_000, energy: 45, health: 5 },
  { id: "plate", name: "Full plate", price: 7_000, energy: 70, health: 40 }
] as const

export type FoodId = (typeof FOODS)[number]["id"]

export function findFood(id: string) {
  return FOODS.find((food) => food.id === id) ?? null
}

export function eat(needs: Needs, foodId: FoodId): Needs {
  const food = findFood(foodId)
  if (!food) return needs
  return { energy: clamp(needs.energy + food.energy), health: clamp(needs.health + food.health) }
}
