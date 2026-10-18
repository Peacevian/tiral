// What each rented home looks like on the Home page: how big your room is
// (in furniture squares a side, up to ROOM_GRID), which floor it's on, the
// ground around it and where the camera stands. Plain data, so the page and
// the customizer can use it without pulling in three.js.

import { FURNITURE_BY_ID, ROOM_GRID, ROTATIONS, type HouseLoadout, type PlacedItem } from "@tiral/houses"
import type { HousingTierId } from "@tiral/game-core"

export type HomeLook = {
  /** Your room is room × room squares (furniture outside it goes into storage). */
  room: number
  /** Height of your floor above the ground (an upstairs flat). */
  level: number
  /** The ground around the building. */
  ground: string
  /** Outside camera position and target, relative to the ground under your room. */
  camera: [number, number, number]
  target: [number, number, number]
  blurb: string
}

export const HOME_LOOKS: Record<HousingTierId, HomeLook> = {
  kisenyi: {
    room: 4,
    level: 0,
    ground: "#B9A27C",
    camera: [6.5, 6, 8],
    target: [-1.5, 0.8, 0],
    blurb: "One room in a row of muzigo rentals, a shared yard and a washing line"
  },
  kawempe: {
    room: 5,
    level: 0,
    ground: "#B5AA88",
    camera: [7.5, 6.5, 8.5],
    target: [-1, 0.8, 0],
    blurb: "A bigger room in a rental block; the bathroom is shared, out back"
  },
  ntinda: {
    room: 6,
    level: 0,
    ground: "#A9C68F",
    camera: [9, 8, 10.5],
    target: [-1.5, 0.8, 0],
    blurb: "A self-contained bungalow of your own behind a compound wall and gate"
  },
  kololo: {
    room: 6,
    level: 6,
    ground: "#A9C68F",
    camera: [11, 3, 13],
    target: [-2, -2, 0],
    blurb: "A flat on the top floor of an apartment block, with a balcony"
  }
}

export function homeLook(id: string | null | undefined): HomeLook {
  return HOME_LOOKS[(id ?? "kisenyi") as HousingTierId] ?? HOME_LOOKS.kisenyi
}

function dims(item: PlacedItem) {
  const spec = FURNITURE_BY_ID[item.item]
  const swapped = item.rot === 90 || item.rot === 270
  return swapped ? { w: spec.depth, d: spec.width } : { w: spec.width, d: spec.depth }
}

function cells(item: PlacedItem): string[] {
  const { w, d } = dims(item)
  const out: string[] = []
  for (let x = item.x; x < item.x + w; x++) for (let z = item.z; z < item.z + d; z++) out.push(`${x},${z}`)
  return out
}

/** Does the item sit wholly inside a room × room room? */
export function fitsRoom(item: PlacedItem, room: number): boolean {
  const { w, d } = dims(item)
  return item.x >= 0 && item.z >= 0 && item.x + w <= room && item.z + d <= room
}

/** A free spot for this piece in the room (any rotation), or null if it won't fit. */
export function freeSpot(items: readonly PlacedItem[], candidate: PlacedItem, room: number): PlacedItem | null {
  const taken = new Set(items.filter((item) => item.id !== candidate.id).flatMap(cells))
  for (const rot of [candidate.rot, ...ROTATIONS.filter((r) => r !== candidate.rot)]) {
    const probe = { ...candidate, rot }
    const { w, d } = dims(probe)
    for (let z = 0; z + d <= room; z++) {
      for (let x = 0; x + w <= room; x++) {
        const placed = { ...probe, x, z }
        if (!cells(placed).some((cell) => taken.has(cell))) return placed
      }
    }
  }
  return null
}

/**
 * Your furniture in a home of this size: pieces that fit stay where they are,
 * the rest are moved into free spots if there's room, and whatever still
 * doesn't fit goes into storage (kept in the loadout where it was, so it comes
 * back in a bigger home).
 */
export function fitHouse(house: HouseLoadout, room: number): { placed: PlacedItem[]; stored: PlacedItem[] } {
  if (room >= ROOM_GRID) return { placed: house.items, stored: [] }
  const placed: PlacedItem[] = []
  const stored: PlacedItem[] = []
  const overflow: PlacedItem[] = []
  for (const item of house.items) {
    if (fitsRoom(item, room) && !cells(item).some((cell) => placed.some((other) => cells(other).includes(cell)))) placed.push(item)
    else overflow.push(item)
  }
  for (const item of overflow) {
    const spot = freeSpot(placed, item, room)
    if (spot) placed.push(spot)
    else stored.push(item)
  }
  return { placed, stored }
}

/**
 * Back to a loadout for the whole ROOM_GRID: the room's pieces as placed, and
 * stored pieces moved to free squares outside the room (so nothing overlaps
 * and they come back in a bigger home).
 */
export function packHouse(placed: readonly PlacedItem[], stored: readonly PlacedItem[]): PlacedItem[] {
  const items = [...placed]
  for (const item of stored) items.push(freeSpot(items, item, ROOM_GRID) ?? item)
  return items
}
