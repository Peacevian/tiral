// Hangouts players go to and meet (docs/kyadondo.md): first Kyadondo Rugby
// Grounds. You ride there, walk around with everyone else who's there, and buy
// pork and drinks at the counters. Prices are real Kampala prices. These are
// the rules; the game server runs the room and @tiral/db takes the money.

export type VenueId = "kyadondo"

export const VENUES: Record<VenueId, { name: string; area: string; rideFare: number; capacity: number; icon: string; position: { lat: number; lng: number } }> = {
  // The gate on Jinja Road (OpenStreetMap: Kyadondo Rugby Club).
  kyadondo: { name: "Kyadondo Rugby Grounds", area: "Lugogo, Jinja Road", rideFare: 9_000, capacity: 40, icon: "🏉", position: { lat: 0.32545, lng: 32.6072 } }
}

export function findVenue(id: string) {
  return id in VENUES ? { id: id as VenueId, ...VENUES[id as VenueId] } : null
}

/** Where things are in the Kyadondo scene (metres; pitch along x, Jinja Road at −z). */
export const KYADONDO = {
  /** Inside the gate, where you arrive. */
  arrival: { x: -57, z: -53 },
  /** The walkable grounds. */
  bounds: { minX: -78, maxX: 78, minZ: -64, maxZ: 64 },
  counters: {
    grill: { x: -20, z: 45.5, name: "Pork joint" },
    bar: { x: 1, z: 45.2, name: "Bar" }
  }
} as const

export type Counter = keyof typeof KYADONDO.counters

/** How close you must stand to a counter to order. */
export const COUNTER_REACH_METERS = 8
/** Who shares a round or a platter: everyone this close to you. */
export const TABLE_REACH_METERS = 7

export type MenuItemId = "pork_quarter" | "pork_half" | "pork_kilo" | "soda" | "beer" | "bucket" | "spirits"

export const VENUE_MENU: ReadonlyArray<{
  id: MenuItemId
  name: string
  counter: Counter
  price: number
  /** Energy back (food). */
  energy: number
  /** Stress off (negative). */
  stress: number
  /** Shared with everyone at your table (TABLE_REACH_METERS), each getting the same. */
  shared?: boolean
}> = [
  { id: "pork_quarter", name: "Pork, quarter kilo", counter: "grill", price: 15_000, energy: 15, stress: -2 },
  { id: "pork_half", name: "Pork, half kilo", counter: "grill", price: 30_000, energy: 30, stress: -3 },
  { id: "pork_kilo", name: "Pork platter, a kilo (share)", counter: "grill", price: 55_000, energy: 25, stress: -4, shared: true },
  { id: "soda", name: "Soda", counter: "bar", price: 3_000, energy: 3, stress: -1 },
  { id: "beer", name: "Beer", counter: "bar", price: 7_000, energy: 0, stress: -4 },
  { id: "bucket", name: "Bucket of beers (share)", counter: "bar", price: 35_000, energy: 0, stress: -5, shared: true },
  { id: "spirits", name: "Spirits, a bottle", counter: "bar", price: 60_000, energy: 0, stress: -12 }
]

export function findMenuItem(id: string) {
  return VENUE_MENU.find((item) => item.id === id) ?? null
}

/** A round of beers for everyone at your table (and you): the beer price for each. */
export const ROUND_ITEM: MenuItemId = "beer"
export function roundPrice(people: number): number {
  return (findMenuItem(ROUND_ITEM)?.price ?? 7_000) * Math.max(1, people)
}

/** Followers a TikTok-connected player gains for treating others (rounds and shared plates). */
export function treatFollowers(othersTreated: number): number {
  return Math.min(20, Math.max(0, othersTreated) * 2)
}

export function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Keep a position on the grounds. */
export function clampToVenue(point: { x: number; z: number }): { x: number; z: number } {
  const { minX, maxX, minZ, maxZ } = KYADONDO.bounds
  return {
    x: Math.max(minX, Math.min(maxX, Number.isFinite(point.x) ? point.x : 0)),
    z: Math.max(minZ, Math.min(maxZ, Number.isFinite(point.z) ? point.z : 0))
  }
}

/** Something you can't walk through: x0..x1 by z0..z1 (metres). */
export type Block = { x0: number; x1: number; z0: number; z1: number }

const box = (x0: number, x1: number, z0: number, z1: number): Block => ({ x0, x1, z0, z1 })
const post = (x: number, z: number, r = 0.5): Block => box(x - r, x + r, z - r, z + r)

/** What's solid at Kyadondo (matches the scene: buildings, counters, the stage, tents, masts, trees). */
export const KYADONDO_BLOCKS: readonly Block[] = [
  box(-7, 7, -45, -35), // clubhouse
  box(-35, -9, -34.8, -31), // west stand
  box(9, 35, -34.8, -31), // east stand
  // Pork joint: back and side walls, the grill, the prep table.
  box(-28, -12, 54.7, 55.4),
  box(-28.2, -27.7, 44, 55),
  box(-12.3, -11.8, 44, 55),
  box(-25, -15, 47, 49),
  box(-27, -21, 52, 54),
  // Bar: walls, the counter, the fridges.
  box(-8, 10, 54.7, 55.4),
  box(-8.2, -7.7, 44, 55),
  box(9.7, 10.2, 44, 55),
  box(-6.1, 8.1, 45.9, 47.3),
  box(-5, 6.7, 53, 54.5),
  box(14, 37, 45, 58.2), // stage and speakers
  box(-45, -35, 52, 60), // toilets
  box(40, 54, 50, 60), // changing rooms
  // Tents: the table and chairs under each.
  ...[-30, -18, -6, 6].map((x) => box(x - 1.6, x + 1.6, 34.4, 37.6)),
  // Floodlight masts and the H posts' padding.
  ...[
    [-56, -32],
    [56, -32],
    [-56, 32],
    [56, 32]
  ].map(([x, z]) => post(x!, z!, 0.45)),
  ...[-50, 50].flatMap((x) => [post(x, -2.8, 0.35), post(x, 2.8, 0.35)]),
  // Trees round the edge.
  ...[
    [-74, -50],
    [-74, -20],
    [-74, 10],
    [-74, 40],
    [74, -50],
    [74, -18],
    [74, 14],
    [74, 44],
    [-60, 60],
    [60, 60],
    [-40, -58],
    [40, -58]
  ].map(([x, z]) => post(x!, z!, 0.6))
]

/** How wide a person is (their distance from anything solid). */
export const PERSON_RADIUS = 0.35

function blocked(x: number, z: number, blocks: readonly Block[]): boolean {
  const { minX, maxX, minZ, maxZ } = KYADONDO.bounds
  if (x < minX || x > maxX || z < minZ || z > maxZ) return true
  const r = PERSON_RADIUS
  return blocks.some((b) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r)
}

/**
 * A step from `from` towards `to`: the whole step if it's clear, otherwise
 * sliding along whatever is in the way (x only, then z only), otherwise none.
 */
export function walkStep(from: { x: number; z: number }, to: { x: number; z: number }, blocks: readonly Block[] = KYADONDO_BLOCKS): { x: number; z: number } {
  if (!blocked(to.x, to.z, blocks)) return { x: to.x, z: to.z }
  if (!blocked(to.x, from.z, blocks)) return { x: to.x, z: from.z }
  if (!blocked(from.x, to.z, blocks)) return { x: from.x, z: to.z }
  return { x: from.x, z: from.z }
}

/** Is this spot free to stand on? */
export function standable(point: { x: number; z: number }, blocks: readonly Block[] = KYADONDO_BLOCKS): boolean {
  return !blocked(point.x, point.z, blocks)
}

/** Walking and jogging speeds (m/s). */
export const WALK_SPEED = 3.2
export const JOG_SPEED = 6
