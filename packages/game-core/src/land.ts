// Land players can claim and build on (docs/land.md). Phase 1: the empty 20 m
// plots of central Kampala and Lugogo, bought outright with coins, with a
// small weekly ground rent so plots of players who stop playing come back to
// the market. These are the rules; @tiral/db takes the money.
import type { LatLng } from "./geo.js"
import { LAND_PLOT_ROWS } from "./landPlots.js"

export const PLOT_SIZE_METERS = 20
/** How many plots one player may hold at a time. */
export const MAX_PLOTS_PER_PLAYER = 2
/** Weekly ground rent, as a share of what the plot cost. */
export const GROUND_RENT_RATE = 0.01
export const RENT_WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** Unpaid this many weeks past the due date, the plot goes back on the market. */
export const RENT_GRACE_WEEKS = 4
/** Ground rent can be paid this many weeks ahead at most. */
export const MAX_RENT_WEEKS_AHEAD = 8

export type PlotArea = "central" | "lugogo"
export type Frontage = "main" | "street" | "back"

export type Plot = {
  id: string
  gx: number
  gy: number
  price: number
  frontage: Frontage
  area: PlotArea
  /** North-west, north-east, south-east, south-west. */
  corners: [LatLng, LatLng, LatLng, LatLng]
  center: LatLng
}

export const PLOT_AREAS: Record<PlotArea, { name: string; bounds: { south: number; west: number; north: number; east: number } }> = {
  central: { name: "Central Kampala", bounds: { south: 0.309, west: 32.574, north: 0.321, east: 32.588 } },
  lugogo: { name: "Lugogo", bounds: { south: 0.32, west: 32.6, north: 0.332, east: 32.616 } }
}

export const FRONTAGE_LABEL: Record<Frontage, string> = { main: "On a main road", street: "On a street", back: "Back plot" }

// The plot grid: 20 m squares in web-mercator metres at the city's anchor
// (the same frame as the 3D city, apps/web/src/components/city/cityData.ts).
export const LAND_ANCHOR: LatLng = { lat: 0.3275, lng: 32.59 }
const METERS = 2 * Math.PI * 6378137 * Math.cos((LAND_ANCHOR.lat * Math.PI) / 180)
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2
const ANCHOR_Y = mercY(LAND_ANCHOR.lat)

/** A point in the grid's metres (x east, y south) as latitude and longitude. */
export function landToLatLng(x: number, y: number): LatLng {
  const my = ANCHOR_Y + y / METERS
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI, lng: LAND_ANCHOR.lng + (x / METERS) * 360 }
}

export function plotId(gx: number, gy: number): string {
  return `${gx}_${gy}`
}

const AREAS: PlotArea[] = ["central", "lugogo"]
const FRONTAGES: Frontage[] = ["back", "street", "main"]

function toPlot([gx, gy, price, frontage, area]: readonly [number, number, number, 0 | 1 | 2, 0 | 1]): Plot {
  const x0 = gx * PLOT_SIZE_METERS
  const y0 = gy * PLOT_SIZE_METERS
  const x1 = x0 + PLOT_SIZE_METERS
  const y1 = y0 + PLOT_SIZE_METERS
  return {
    id: plotId(gx, gy),
    gx,
    gy,
    price,
    frontage: FRONTAGES[frontage]!,
    area: AREAS[area]!,
    corners: [landToLatLng(x0, y0), landToLatLng(x1, y0), landToLatLng(x1, y1), landToLatLng(x0, y1)],
    center: landToLatLng(x0 + PLOT_SIZE_METERS / 2, y0 + PLOT_SIZE_METERS / 2)
  }
}

let byId: Map<string, Plot> | null = null

/** Every plot that can be claimed. */
export function allPlots(): Plot[] {
  byId ??= new Map(LAND_PLOT_ROWS.map((row) => [plotId(row[0], row[1]), toPlot(row)]))
  return [...byId.values()]
}

export function findPlot(id: string): Plot | null {
  if (!byId) allPlots()
  return byId!.get(id) ?? null
}

/** A week's ground rent for a plot bought at `price` (to the nearest 1,000). */
export function weeklyGroundRent(price: number): number {
  return Math.max(1_000, Math.round((price * GROUND_RENT_RATE) / 1_000) * 1_000)
}

/** What claiming costs: the plot, plus its first week's ground rent. */
export function claimCost(plot: Pick<Plot, "price">): number {
  return plot.price + weeklyGroundRent(plot.price)
}

export type RentState = "paid" | "overdue" | "lapsed"

/**
 * Where a plot's ground rent stands: paid up; overdue (still yours, for up to
 * RENT_GRACE_WEEKS); or lapsed (it's back on the market).
 */
export function rentState(rentPaidUntil: Date, now: Date = new Date()): RentState {
  const late = now.getTime() - rentPaidUntil.getTime()
  if (late <= 0) return "paid"
  return late <= RENT_GRACE_WEEKS * RENT_WEEK_MS ? "overdue" : "lapsed"
}

/**
 * How many weeks of rent may be paid now: weeks owed first (each payment
 * extends from where the rent was paid up to), then up to
 * MAX_RENT_WEEKS_AHEAD ahead of today. None once the plot has lapsed.
 */
export function rentWeeksPayable(rentPaidUntil: Date, now: Date = new Date()): number {
  if (rentState(rentPaidUntil, now) === "lapsed") return 0
  const horizon = now.getTime() + MAX_RENT_WEEKS_AHEAD * RENT_WEEK_MS
  return Math.max(0, Math.floor((horizon - rentPaidUntil.getTime()) / RENT_WEEK_MS))
}
