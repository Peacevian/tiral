// What players build on their plots (docs/land.md, phase 2): ready-made
// designs they make their own with colours, floors (within limits) and a
// sign. Building is paid up front and takes real time; meanwhile the 3D city
// shows scaffolding. A house can be lived in instead of renting.

export type BuildingDesignId = "kiosk" | "shop" | "bar" | "flats" | "office" | "house"

export type BuildingDesign = {
  id: BuildingDesignId
  name: string
  icon: string
  blurb: string
  minFloors: number
  maxFloors: number
  /** Cost with the fewest floors, and for each floor above that. */
  cost: number
  costPerFloor: number
  /** Build time with the fewest floors, and for each floor above that. */
  hours: number
  hoursPerFloor: number
  /** Footprint in metres: along the street, and back from it. */
  width: number
  depth: number
  /** Metres back from the street (a yard or forecourt in front). */
  setback: number
  /** Has a sign over the front. */
  signed: boolean
}

export const BUILDING_DESIGNS: Record<BuildingDesignId, BuildingDesign> = {
  kiosk: { id: "kiosk", name: "Kiosk", icon: "🏪", blurb: "A small kiosk on the street: airtime, sweets, a rolex stand.", minFloors: 1, maxFloors: 1, cost: 150_000, costPerFloor: 0, hours: 6, hoursPerFloor: 0, width: 4, depth: 3, setback: 1, signed: true },
  shop: { id: "shop", name: "Shop", icon: "🛍️", blurb: "Lock-up shops along the front, a store room upstairs.", minFloors: 1, maxFloors: 2, cost: 400_000, costPerFloor: 200_000, hours: 12, hoursPerFloor: 6, width: 14, depth: 10, setback: 1.5, signed: true },
  bar: { id: "bar", name: "Bar", icon: "🍻", blurb: "A bar and restaurant: music, pork and cold drinks.", minFloors: 1, maxFloors: 2, cost: 1_500_000, costPerFloor: 500_000, hours: 24, hoursPerFloor: 12, width: 15, depth: 12, setback: 3, signed: true },
  flats: { id: "flats", name: "Flats", icon: "🏢", blurb: "A block of flats with balconies.", minFloors: 2, maxFloors: 6, cost: 1_500_000, costPerFloor: 500_000, hours: 36, hoursPerFloor: 12, width: 16, depth: 14, setback: 2.5, signed: false },
  office: { id: "office", name: "Office tower", icon: "🏙️", blurb: "Glass offices: your mark on the skyline.", minFloors: 4, maxFloors: 10, cost: 10_000_000, costPerFloor: 1_000_000, hours: 72, hoursPerFloor: 12, width: 16, depth: 16, setback: 2, signed: true },
  house: { id: "house", name: "House", icon: "🏡", blurb: "Your own house with a compound: live in it and stop paying rent.", minFloors: 1, maxFloors: 2, cost: 2_000_000, costPerFloor: 2_500_000, hours: 36, hoursPerFloor: 24, width: 12, depth: 10, setback: 5, signed: false }
}

export const BUILDING_DESIGN_IDS = Object.keys(BUILDING_DESIGNS) as BuildingDesignId[]

/** Wall colours to choose from (the city's own palette, a little brighter). */
export const WALL_COLOURS = ["#F3E3B5", "#ECE3D0", "#E6C9A8", "#F0D9C9", "#D4E2CF", "#CFD8DC", "#BFD7EA", "#F7C59F", "#E8C8B8", "#FFFFFF"] as const
/** Roof colours: iron sheets (or the concrete edge of a flat roof). */
export const ROOF_COLOURS = ["#9A5A3C", "#A44A3F", "#5D7A93", "#2F7D4A", "#8C8F87", "#3B4750"] as const

export const SIGN_MAX = 24
export const FLOOR_HEIGHT_METERS = 3.2

export type BuildingPlan = { design: BuildingDesignId; floors: number; wall: string; roof: string; sign: string | null }

/** A building on a plot, as stored (land_plots.building). */
export type Building = BuildingPlan & { cost: number; startedAt: string; readyAt: string }

export function buildingCost(design: BuildingDesign, floors: number): number {
  return design.cost + design.costPerFloor * (floors - design.minFloors)
}

export function buildingHours(design: BuildingDesign, floors: number): number {
  return design.hours + design.hoursPerFloor * (floors - design.minFloors)
}

/** Height in metres (a bar and a shop have a tall ground floor). */
export function buildingHeight(plan: Pick<BuildingPlan, "design" | "floors">): number {
  if (plan.design === "kiosk") return 2.8
  return plan.floors * FLOOR_HEIGHT_METERS + (plan.design === "shop" || plan.design === "bar" ? 0.6 : 0)
}

// Words a sign may not carry (a first line of defence; reports and admins
// do the rest). Matched as whole words, any case.
const BLOCKED = ["fuck", "fucking", "shit", "bitch", "cunt", "dick", "pussy", "nigger", "nigga", "fag", "faggot", "whore", "slut", "porn"]

/** A sign's text, tidied: printable letters and digits and a little punctuation, at most SIGN_MAX characters. */
export function cleanSign(text: string): string | null {
  const tidy = text.normalize("NFKC").replace(/\s+/g, " ").trim()
  if (!tidy) return null
  if (tidy.length > SIGN_MAX || !/^[\p{L}\p{N} '&.,!?\-]+$/u.test(tidy)) return null
  const lower = ` ${tidy.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ")} `
  if (BLOCKED.some((word) => lower.includes(` ${word} `))) return null
  return tidy
}

export type PlanCheck = { ok: true; plan: BuildingPlan; cost: number; hours: number } | { ok: false; error: string }

/** Check (and tidy) what a player wants to build. */
export function checkPlan(input: { design?: unknown; floors?: unknown; wall?: unknown; roof?: unknown; sign?: unknown }): PlanCheck {
  const design = typeof input.design === "string" ? BUILDING_DESIGNS[input.design as BuildingDesignId] : undefined
  if (!design) return { ok: false, error: "Pick something to build." }
  const floors = typeof input.floors === "number" && Number.isInteger(input.floors) ? input.floors : NaN
  if (!(floors >= design.minFloors && floors <= design.maxFloors)) return { ok: false, error: `A ${design.name.toLowerCase()} has ${design.minFloors === design.maxFloors ? design.minFloors : `${design.minFloors}–${design.maxFloors}`} floor${design.maxFloors === 1 ? "" : "s"}.` }
  const wall = WALL_COLOURS.find((c) => c === input.wall)
  const roof = ROOF_COLOURS.find((c) => c === input.roof)
  if (!wall || !roof) return { ok: false, error: "Pick the colours." }
  let sign: string | null = null
  if (design.signed && typeof input.sign === "string" && input.sign.trim()) {
    sign = cleanSign(input.sign)
    if (!sign) return { ok: false, error: `Signs are up to ${SIGN_MAX} letters and numbers, and nothing rude.` }
  }
  return { ok: true, plan: { design: design.id, floors, wall, roof, sign }, cost: buildingCost(design, floors), hours: buildingHours(design, floors) }
}

/** How far along a building is (0 to 1), and whether it's finished. */
export function buildProgress(building: Pick<Building, "startedAt" | "readyAt">, now: Date = new Date()): { progress: number; ready: boolean } {
  const start = new Date(building.startedAt).getTime()
  const end = new Date(building.readyAt).getTime()
  const progress = end <= start ? 1 : Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)))
  return { progress, ready: now.getTime() >= end }
}

/** A stored building, checked (anything unreadable counts as no building). */
export function readBuilding(value: unknown): Building | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const check = checkPlan({ design: v.design, floors: v.floors, wall: v.wall, roof: v.roof, sign: v.sign })
  if (!check.ok || typeof v.startedAt !== "string" || typeof v.readyAt !== "string" || typeof v.cost !== "number") return null
  return { ...check.plan, cost: v.cost, startedAt: v.startedAt, readyAt: v.readyAt }
}

/** Your own house's look on the Home page: a bungalow, or a house with a garden. */
export function ownHouseLook(floors: number): "ntinda" | "muyenga" {
  return floors >= 2 ? "muyenga" : "ntinda"
}

