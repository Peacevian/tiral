import * as THREE from "three"
import { BUILDING_DESIGNS, PLOT_SIZE_METERS, buildingHeight, type Building, type Facing } from "@tiral/game-core"
import { Builder, walls } from "./cityBuild"
import { BAY, FLOOR, HOUSE_BAY, SHOP_FLOOR } from "./cityTextures"

// What players have built on their plots (docs/land.md), as geometry in the
// city's local metres. The land grid and the city share one frame (web-
// mercator metres at the same anchor), so plot gx_gy is simply the square
// x ∈ [gx·20, gx·20+20), y ∈ [gy·20, gy·20+20) (y south). Each building
// stands back from the plot's street side, its front towards the street.

export type PlotOnMap = { gx: number; gy: number; facing: Facing }

/** Material slots (City.tsx has one material for each). */
export type BuildingPart = "shops" | "flats" | "balcony" | "towers" | "houses" | "iron" | "concrete" | "scaffold"

export type BuiltShape = {
  parts: Partial<Record<BuildingPart, Builder>>
  sign: { x: number; y: number; z: number; angle: number; width: number; height: number; text: string } | null
}

const WHITE = new THREE.Color("#ffffff")

/** The plot's street side: its middle, the way into the plot, and along the street. */
function frame(plot: PlotOnMap) {
  const x0 = plot.gx * PLOT_SIZE_METERS
  const y0 = plot.gy * PLOT_SIZE_METERS
  const s = PLOT_SIZE_METERS
  switch (plot.facing) {
    case "north":
      return { ox: x0 + s / 2, oy: y0, nx: 0, ny: 1 }
    case "south":
      return { ox: x0 + s / 2, oy: y0 + s, nx: 0, ny: -1 }
    case "east":
      return { ox: x0 + s, oy: y0 + s / 2, nx: -1, ny: 0 }
    default:
      return { ox: x0, oy: y0 + s / 2, nx: 1, ny: 0 }
  }
}

/** A closed ring, turned so its walls face out (as the city's buildings). */
function outward(points: number[][]): number[][] {
  let ring = [...points, points[0]!]
  const area = ring.slice(0, -1).reduce((sum, [x, y], i) => sum + x! * ring[i + 1]![1]! - ring[i + 1]![0]! * y!, 0)
  if (area > 0) ring = [...ring].reverse()
  return ring
}

export function shapeBuilding(plot: PlotOnMap, building: Building, progress: number, ready: boolean): BuiltShape {
  const design = BUILDING_DESIGNS[building.design]
  const { ox, oy, nx, ny } = frame(plot)
  // Along the street: the inward direction turned a quarter.
  const tx = -ny
  const ty = nx
  const at = (u: number, v: number) => [ox + tx * u + nx * v, oy + ty * u + ny * v]
  const w = design.width / 2
  const front = design.setback
  const back = design.setback + design.depth
  const ring = outward([at(-w, front), at(w, front), at(w, back), at(-w, back)])
  const wall = new THREE.Color(building.wall)
  const roofColour = new THREE.Color(building.roof)
  const full = buildingHeight(building)
  const parts: BuiltShape["parts"] = {}
  const part = (key: BuildingPart) => (parts[key] ??= new Builder())

  if (!ready) {
    // Going up: grey blocks and scaffolding, as high as the work has got.
    const h = Math.max(1.2, full * progress)
    walls(part("scaffold"), ring, 0, h, WHITE, BAY, FLOOR)
    part("concrete").polygon(ring.slice(0, -1), h, new THREE.Color("#B9B4AA"), 6)
    return { parts, sign: null }
  }

  const ground = Math.min(SHOP_FLOOR, full)
  switch (building.design) {
    case "kiosk":
      walls(part("shops"), ring, 0, full, wall.clone().lerp(WHITE, 0.3), BAY * 4, full)
      break
    case "shop":
    case "bar":
      walls(part("shops"), ring, 0, ground, wall.clone().lerp(WHITE, 0.3), BAY * 4, SHOP_FLOOR)
      if (full > ground + 0.4) walls(part(building.design === "bar" ? "balcony" : "flats"), ring, ground, full, wall, BAY, FLOOR)
      break
    case "flats":
      walls(part("balcony"), ring, 0, full, wall, BAY, FLOOR)
      break
    case "office":
      walls(part("towers"), ring, 0, full, wall.clone().lerp(WHITE, 0.6), BAY, FLOOR)
      break
    case "house":
      walls(part("houses"), ring, 0, full, wall, HOUSE_BAY, FLOOR)
      // A compound wall round the plot.
      {
        const s = PLOT_SIZE_METERS
        const x0 = plot.gx * s + 0.3
        const y0 = plot.gy * s + 0.3
        const x1 = x0 + s - 0.6
        const y1 = y0 + s - 0.6
        walls(part("houses"), outward([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), 0, 1.6, wall.clone().lerp(WHITE, 0.5), HOUSE_BAY * 3, 1.6 * 2)
      }
      break
  }

  // Roofs: a hipped iron roof on a house, flat ones elsewhere (concrete on
  // the tower), in the chosen colour.
  if (building.design === "house") {
    const rise = 2.2
    const ridge = Math.max(0, w - design.depth / 2)
    const mid = (front + back) / 2
    const eave = (u: number, v: number) => [...at(u, v), full]
    const top = (u: number) => [...at(u, mid), full + rise]
    const roof = part("iron")
    const uv = (p: number[]) => [p[0]! / 2, p[1]! / 2]
    const slope = (a: number[], b: number[], c: number[], d: number[], shade: number) =>
      roof.quad(a, b, c, d, [uv(a), uv(b), uv(c), uv(d)], roofColour.clone().multiplyScalar(shade))
    slope(eave(-w, front), eave(w, front), top(ridge), top(-ridge), 1)
    slope(eave(w, back), eave(-w, back), top(-ridge), top(ridge), 0.78)
    slope(eave(w, front), eave(w, back), top(ridge), top(ridge), 0.9)
    slope(eave(-w, back), eave(-w, front), top(-ridge), top(-ridge), 0.85)
  } else if (building.design === "office") {
    part("concrete").polygon(ring.slice(0, -1), full, WHITE, 6)
  } else {
    part("iron").polygon(ring.slice(0, -1), full, roofColour, 2)
  }

  // The sign over the front: above the shop fronts, or high on the tower.
  let sign: BuiltShape["sign"] = null
  if (building.sign && design.signed) {
    const [sx, sy] = at(0, front - 0.06)
    const width = Math.min(design.width - 1, building.design === "kiosk" ? 3.6 : 9)
    const height = width / 5.3
    const z = building.design === "office" ? full - height / 2 - 0.8 : building.design === "kiosk" ? full - height / 2 - 0.15 : ground - height / 2 - 0.1
    // A plane standing up (rotated a quarter about x) faces -y; turn it to face the street (-n).
    sign = { x: sx!, y: sy!, z, angle: Math.atan2(-nx, ny), width, height, text: building.sign }
  }
  return { parts, sign }
}
