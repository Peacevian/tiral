export const WALL_MATERIALS = ["plaster", "wood", "brick", "concrete", "mud"] as const
export type WallMaterial = (typeof WALL_MATERIALS)[number]

export const FLOOR_MATERIALS = ["tile", "wood", "concrete", "carpet", "earth"] as const
export type FloorMaterial = (typeof FLOOR_MATERIALS)[number]

export const ROOF_MATERIALS = ["ironsheet", "thatch", "tile", "flat"] as const
export type RoofMaterial = (typeof ROOF_MATERIALS)[number]

export const WALL_COLORS = [
  "#e7e5e4",
  "#d6d3d1",
  "#fef3c7",
  "#fde68a",
  "#bfdbfe",
  "#fbcfe8",
  "#bbf7d0",
  "#c7d2fe"
] as const

export const FLOOR_COLORS = [
  "#a8a29e",
  "#d6d3d1",
  "#78350f",
  "#451a03",
  "#9a3412",
  "#1c1917"
] as const

export const ROOF_COLORS = [
  "#7f1d1d",
  "#78350f",
  "#57534e",
  "#292524",
  "#14532d"
] as const

export const TRIM_COLORS = ["#f59e0b", "#e7e5e4", "#78350f", "#292524", "#b91c1c"] as const

export const ROOM_GRID = 6
export const MAX_ITEMS = 24

export type FurnitureId =
  | "bed"
  | "table"
  | "chair"
  | "sofa"
  | "rug"
  | "plant"
  | "shelf"
  | "lamp"
  | "television"
  | "stove"
  | "fridge"

export type FurnitureSpec = {
  id: FurnitureId
  label: string
  width: number
  depth: number
  colors: readonly string[]
}

export const FURNITURE: readonly FurnitureSpec[] = [
  { id: "bed", label: "Bed", width: 2, depth: 3, colors: ["#7f1d1d", "#1e3a8a", "#14532d", "#78350f", "#581c87"] },
  { id: "table", label: "Table", width: 2, depth: 2, colors: ["#78350f", "#451a03", "#292524", "#1f2937"] },
  { id: "chair", label: "Chair", width: 1, depth: 1, colors: ["#78350f", "#b91c1c", "#1e3a8a", "#292524"] },
  { id: "sofa", label: "Sofa", width: 2, depth: 1, colors: ["#0f766e", "#1e3a8a", "#7f1d1d", "#78350f", "#292524"] },
  { id: "rug", label: "Rug", width: 2, depth: 3, colors: ["#78350f", "#7f1d1d", "#1e3a8a", "#0f766e", "#581c87"] },
  { id: "plant", label: "Plant", width: 1, depth: 1, colors: ["#14532d", "#15803d", "#3f6212"] },
  { id: "shelf", label: "Shelf", width: 1, depth: 2, colors: ["#78350f", "#292524", "#1f2937"] },
  { id: "lamp", label: "Lamp", width: 1, depth: 1, colors: ["#f59e0b", "#e7e5e4", "#292524"] },
  { id: "television", label: "TV", width: 2, depth: 1, colors: ["#0f172a", "#1f2937"] },
  { id: "stove", label: "Stove", width: 1, depth: 2, colors: ["#292524", "#1f2937", "#e7e5e4"] },
  { id: "fridge", label: "Fridge", width: 1, depth: 1, colors: ["#e7e5e4", "#94a3b8", "#292524"] }
] as const

export const FURNITURE_BY_ID: Record<FurnitureId, FurnitureSpec> = Object.fromEntries(
  FURNITURE.map((item) => [item.id, item])
) as Record<FurnitureId, FurnitureSpec>

export type Rotation = 0 | 90 | 180 | 270
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

/** Where a piece was bought: Owino (basic), Kikuubo (good), Acacia Mall (luxury). */
export type FurnitureGrade = "owino" | "kikuubo" | "acacia"
export const FURNITURE_GRADES: readonly FurnitureGrade[] = ["owino", "kikuubo", "acacia"]

export type PlacedItem = {
  /** The owned piece (a house_items row) this is. */
  id: string
  item: FurnitureId
  x: number
  z: number
  rot: Rotation
  color: string
  /** How fancy it is (looks, and for beds and sofas, comfort). Basic when missing. */
  grade?: FurnitureGrade
}

export type HouseColors = {
  wall: string
  floor: string
  roof: string
  trim: string
}

export type HouseLoadout = {
  version: 1
  wallMaterial: WallMaterial
  floorMaterial: FloorMaterial
  roofMaterial: RoofMaterial
  colors: HouseColors
  items: PlacedItem[]
}

export const DEFAULT_HOUSE: HouseLoadout = {
  version: 1,
  wallMaterial: "plaster",
  floorMaterial: "tile",
  roofMaterial: "ironsheet",
  colors: {
    wall: "#e7e5e4",
    floor: "#a8a29e",
    roof: "#7f1d1d",
    trim: "#f59e0b"
  },
  // Everyone starts with an empty room: furniture is bought (shop.ts).
  items: []
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
}

function isIntegerInRange(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < max
}

function footprintFits(item: FurnitureId, x: number, z: number, rot: Rotation): boolean {
  const spec = FURNITURE_BY_ID[item]
  const swapped = rot === 90 || rot === 270
  const width = swapped ? spec.depth : spec.width
  const depth = swapped ? spec.width : spec.depth
  return x + width <= ROOM_GRID && z + depth <= ROOM_GRID
}

function isValidPlacedItem(value: unknown, seenIds: Set<string>): value is PlacedItem {
  if (typeof value !== "object" || value === null) return false
  const item = value as Record<string, unknown>
  if (typeof item.id !== "string" || item.id.length === 0 || item.id.length > 64) return false
  if (seenIds.has(item.id)) return false
  if (typeof item.item !== "string" || !(item.item in FURNITURE_BY_ID)) return false
  const spec = FURNITURE_BY_ID[item.item as FurnitureId]
  if (!isIntegerInRange(item.x, ROOM_GRID) || !isIntegerInRange(item.z, ROOM_GRID)) return false
  if (!ROTATIONS.includes(item.rot as Rotation)) return false
  if (!isHexColor(item.color) || !spec.colors.includes(item.color)) return false
  if (item.grade !== undefined && !FURNITURE_GRADES.includes(item.grade as FurnitureGrade)) return false
  if (!footprintFits(item.item as FurnitureId, item.x as number, item.z as number, item.rot as Rotation)) {
    return false
  }
  seenIds.add(item.id)
  return true
}

export function isValidHouseLoadout(value: unknown): value is HouseLoadout {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const house = value as Record<string, unknown>
  if (house.version !== 1) return false
  if (!WALL_MATERIALS.includes(house.wallMaterial as WallMaterial)) return false
  if (!FLOOR_MATERIALS.includes(house.floorMaterial as FloorMaterial)) return false
  if (!ROOF_MATERIALS.includes(house.roofMaterial as RoofMaterial)) return false

  const colors = house.colors
  if (typeof colors !== "object" || colors === null || Array.isArray(colors)) return false
  const palette = colors as Record<string, unknown>
  if (!isHexColor(palette.wall) || !(WALL_COLORS as readonly string[]).includes(palette.wall)) return false
  if (!isHexColor(palette.floor) || !(FLOOR_COLORS as readonly string[]).includes(palette.floor)) return false
  if (!isHexColor(palette.roof) || !(ROOF_COLORS as readonly string[]).includes(palette.roof)) return false
  if (!isHexColor(palette.trim) || !(TRIM_COLORS as readonly string[]).includes(palette.trim)) return false

  if (!Array.isArray(house.items) || house.items.length > MAX_ITEMS) return false
  const seenIds = new Set<string>()
  return house.items.every((item) => isValidPlacedItem(item, seenIds))
}

export function sanitizeHouseLoadout(value: unknown): HouseLoadout {
  return isValidHouseLoadout(value) ? value : structuredClone(DEFAULT_HOUSE)
}
