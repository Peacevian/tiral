import * as THREE from "three"
import { BAY, FLOOR, HOUSE_BAY, SHOP_FLOOR } from "./cityTextures"
import type { Footprint, Segment, TileData } from "./cityData"

// Turning a tile of buildings into geometry, at two levels of detail:
//  - far: plain blocks, one mesh a tile, no textures (the sun baked into the
//    colours);
//  - near: facades with windows, shops, houses, roofs with tanks, trees and
//    street lights, merged into one mesh per material.

const TOWER_HEIGHT = 24
/** Up to this tall a building is a one-storey house (house walls, no shops). */
const HOUSE_HEIGHT = 5.2

/** Building colours, by `colour` in the tile files (make_tiles.py): towers, low buildings, church, hotel, shelter roof. */
export const CITY_COLOURS = [
  ...["#B8C4CE", "#A9B8C4", "#C9CED3", "#9FB3C2", "#BFC7CC"],
  ...["#ECE3D0", "#E7D3A8", "#D9C2A0", "#E9DCC4", "#CFD8DC", "#E8C8B8", "#F3E3B5", "#D4E2CF", "#E6C9A8", "#F0D9C9"],
  "#ECE6DA",
  "#F3F0EA",
  "#9AA5AD"
].map((c) => new THREE.Color(c))

const ROOF_COLOURS = ["#8E9AA3", "#9A5A3C", "#7A8B98", "#A44A3F", "#5D7A93", "#8C8F87"].map((c) => new THREE.Color(c))
const WHITE = new THREE.Color("#ffffff")
const TOWER_ROOF = new THREE.Color("#C9C6C0")

/** Geometry under construction: positions, uvs, colours and triangles. */
class Builder {
  positions: number[] = []
  uvs: number[] = []
  colors: number[] = []
  indices: number[] = []
  quad(a: number[], b: number[], c: number[], d: number[], uv: number[][], color: THREE.Color, shade = [1, 1, 1, 1]) {
    const base = this.positions.length / 3
    for (const [i, p] of [a, b, c, d].entries()) {
      this.positions.push(p[0]!, p[1]!, p[2]!)
      this.uvs.push(uv[i]![0]!, uv[i]![1]!)
      this.colors.push(color.r * shade[i]!, color.g * shade[i]!, color.b * shade[i]!)
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  polygon(ring: number[][], z: number, color: THREE.Color, uvScale: number) {
    const base = this.positions.length / 3
    const contour = ring.map(([x, y]) => new THREE.Vector2(x, y))
    const triangles = THREE.ShapeUtils.triangulateShape(contour, [])
    for (const [x, y] of ring) {
      this.positions.push(x!, y!, z)
      this.uvs.push(x! / uvScale, y! / uvScale)
      this.colors.push(color.r, color.g, color.b)
    }
    for (const [a, b, c] of triangles) this.indices.push(base + a!, base + b!, base + c!)
  }
  /** Null when nothing was added (no empty draw calls). */
  geometry(withUv = true) {
    if (this.indices.length === 0) return null
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3))
    if (withUv) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2))
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3))
    geometry.setIndex(this.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1))
    geometry.computeBoundingSphere()
    return geometry
  }
}

/** The afternoon sun (from the west, high): walls facing it are bright, the others in shade. */
const SUN = new THREE.Vector2(-0.8, -0.35).normalize()

/** Walls of one band around a ring, UVs in bays and floors, sun baked into the colour. */
function walls(builder: Builder, ring: number[][], z0: number, z1: number, color: THREE.Color, bayWidth: number, floorHeight: number) {
  let along = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i]!
    const [bx, by] = ring[i + 1]!
    const length = Math.hypot(bx! - ax!, by! - ay!)
    if (length < 0.05) continue
    const u0 = along / bayWidth
    const u1 = (along + length) / bayWidth
    // Outward normal (the ring runs so that outside is on the left).
    const nx = (by! - ay!) / length
    const ny = -(bx! - ax!) / length
    const light = 0.68 + 0.32 * Math.max(0, nx * SUN.x + ny * SUN.y)
    const lit = color.clone().multiplyScalar(light)
    // A touch darker at the bottom: grounds the building.
    builder.quad(
      [ax!, ay!, z0],
      [bx!, by!, z0],
      [bx!, by!, z1],
      [ax!, ay!, z1],
      [
        [u0, z0 / floorHeight],
        [u1, z0 / floorHeight],
        [u1, z1 / floorHeight],
        [u0, z1 / floorHeight]
      ],
      lit,
      z0 < 0.1 ? [0.82, 0.82, 1, 1] : [1, 1, 1, 1]
    )
    along += length
  }
}

/** Is the point inside the ring (x, y)? */
function inRing(x: number, y: number, ring: number[][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside
  }
  return inside
}

/** Things in 20 m cells by bounding box, to look up only what's near a point. */
class Grid<T> {
  cells = new Map<number, T[]>()
  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + cy + 32768
  }
  add(item: T, minX: number, minY: number, maxX: number, maxY: number) {
    for (let cx = Math.floor(minX / 20); cx <= Math.floor(maxX / 20); cx++)
      for (let cy = Math.floor(minY / 20); cy <= Math.floor(maxY / 20); cy++) {
        const key = this.key(cx, cy)
        const list = this.cells.get(key)
        if (list) list.push(item)
        else this.cells.set(key, [item])
      }
  }
  near(x: number, y: number): T[] {
    return this.cells.get(this.key(Math.floor(x / 20), Math.floor(y / 20))) ?? []
  }
}

// ---------------------------------------------------------------------------

/** Plain blocks for a whole tile: one mesh, no textures. */
export function buildFar(tile: TileData): THREE.BufferGeometry | null {
  const builder = new Builder()
  for (const { ring, h, colour, seed } of tile.buildings) {
    const tint = CITY_COLOURS[colour] ?? WHITE
    walls(builder, ring, 0, h, tint, 1, 1)
    builder.polygon(ring.slice(0, -1), h, h >= TOWER_HEIGHT ? TOWER_ROOF : ROOF_COLOURS[seed % ROOF_COLOURS.length]!, 1)
  }
  return builder.geometry(false)
}

/** Facade styles: low buildings (flats variants) and towers. */
export const LOW_STYLES = 4
export const TOWER_STYLES = 2

export type NearTile = {
  towers: Array<THREE.BufferGeometry | null>
  flats: Array<THREE.BufferGeometry | null>
  shops: THREE.BufferGeometry | null
  houses: THREE.BufferGeometry | null
  iron: THREE.BufferGeometry | null
  concrete: THREE.BufferGeometry | null
  trees: THREE.Matrix4[]
  lights: THREE.Matrix4[]
  tanks: THREE.Matrix4[]
}

const Z = new THREE.Vector3(0, 0, 1)

/**
 * The full look for one tile. `around` is the tile and whichever neighbours
 * are loaded, so trees and lights near the edge still keep off their
 * buildings and roads.
 */
export function buildNear(tile: TileData, around: TileData[], lite: boolean): NearTile {
  const towerStyles = Array.from({ length: TOWER_STYLES }, () => new Builder())
  const lowStyles = Array.from({ length: LOW_STYLES }, () => new Builder())
  const shops = new Builder()
  const houses = new Builder()
  const iron = new Builder()
  const concrete = new Builder()
  const tanks: THREE.Matrix4[] = []
  for (const { ring, h, colour, shops: shopFront, seed } of tile.buildings) {
    const tint = CITY_COLOURS[colour] ?? WHITE
    const roof = ring.slice(0, -1)
    if (h >= TOWER_HEIGHT) {
      // Towers: glass or punched windows all the way down, a concrete roof with black water tanks.
      walls(towerStyles[seed % TOWER_STYLES]!, ring, 0, h, WHITE, BAY, FLOOR)
      concrete.polygon(roof, h, WHITE, 6)
      const cx = roof.reduce((sum, p) => sum + p[0]!, 0) / roof.length
      const cy = roof.reduce((sum, p) => sum + p[1]!, 0) / roof.length
      tanks.push(new THREE.Matrix4().makeTranslation(cx, cy, h), new THREE.Matrix4().makeTranslation(cx + 2.2, cy - 0.6, h))
      continue
    }
    if (h <= HOUSE_HEIGHT && !shopFront) {
      // A house: one storey of plastered wall, window and door.
      walls(houses, ring, 0, h, tint, HOUSE_BAY, h)
    } else {
      const flats = lowStyles[seed % LOW_STYLES]!
      const ground = shopFront ? Math.min(SHOP_FLOOR, h) : 0
      // Shops along the ground floor where there are shops (the centre, markets, shop buildings).
      if (shopFront) walls(shops, ring, 0, ground, tint.clone().lerp(WHITE, 0.4), BAY * 4, SHOP_FLOOR)
      if (h > ground + 0.4) walls(flats, ring, ground, h, tint, BAY, FLOOR)
    }
    iron.polygon(roof, h, ROOF_COLOURS[seed % ROOF_COLOURS.length]!, 2)
  }

  // Lookups for where trees and lights may stand: no building, no road.
  const footprints = new Grid<Footprint>()
  const surfaces = new Grid<Segment>()
  for (const t of around) {
    for (const f of t.buildings) footprints.add(f, f.minX - 1.2, f.minY - 1.2, f.maxX + 1.2, f.maxY + 1.2)
    for (const s of t.segments) {
      const reach = s.width / 2 + 1
      surfaces.add(s, Math.min(s.ax, s.bx) - reach, Math.min(s.ay, s.by) - reach, Math.max(s.ax, s.bx) + reach, Math.max(s.ay, s.by) + reach)
    }
  }
  const clear = (x: number, y: number) =>
    !footprints
      .near(x, y)
      .some((f) => x > f.minX - 1.2 && x < f.maxX + 1.2 && y > f.minY - 1.2 && y < f.maxY + 1.2 && (inRing(x, y, f.ring) || inRing(x + 1, y, f.ring) || inRing(x - 1, y, f.ring) || inRing(x, y + 1, f.ring) || inRing(x, y - 1, f.ring)))
  const offRoad = (x: number, y: number) =>
    surfaces.near(x, y).every(({ ax, ay, bx, by, width }) => {
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) > width / 2 + 0.9
    })

  // Trees along the pavements (every ~16 m, alternate sides; half as many on
  // cheap phones) and street lights on the bigger roads (every ~32 m).
  const trees: THREE.Matrix4[] = []
  const lights: THREE.Matrix4[] = []
  const spacing = 16
  for (const { ax, ay, bx, by, width, along } of tile.segments) {
    const length = Math.hypot(bx - ax, by - ay)
    if (length < 0.05) continue
    const ux = (bx - ax) / length
    const uy = (by - ay) / length
    const nx = -uy
    const ny = ux
    for (let d = along % spacing === 0 ? spacing / 2 : spacing - (along % spacing); d < length; d += spacing) {
      const step = Math.round((along + d) / spacing)
      const sign = step % 2 === 0 ? 1 : -1
      if (!lite || step % 4 < 2) {
        const side = width / 2 + 1.9
        const x = ax + ux * d + nx * side * sign
        const y = ay + uy * d + ny * side * sign
        if (clear(x, y) && offRoad(x, y)) {
          const s = 0.85 + ((step * 37) % 10) / 25
          trees.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromAxisAngle(Z, x), new THREE.Vector3(s, s, s * (0.9 + ((step * 13) % 5) / 20))))
        }
      }
      // On the other side of the road from the tree, just off the kerb.
      if (!lite && width >= 8 && step % 2 === 0) {
        const side = width / 2 + 1.2
        const x = ax + ux * d - nx * side * sign
        const y = ay + uy * d - ny * side * sign
        if (clear(x, y) && offRoad(x, y)) lights.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromAxisAngle(Z, Math.atan2(ny * sign, nx * sign)), new THREE.Vector3(1, 1, 1)))
      }
    }
  }
  return {
    towers: towerStyles.map((b) => b.geometry()),
    flats: lowStyles.map((b) => b.geometry()),
    shops: shops.geometry(),
    houses: houses.geometry(),
    iron: iron.geometry(),
    concrete: concrete.geometry(),
    trees,
    lights,
    tanks
  }
}

export function disposeNear(near: NearTile) {
  for (const geometry of [...near.towers, ...near.flats, near.shops, near.houses, near.iron, near.concrete]) geometry?.dispose()
}

/** Triangles in a geometry (for the test bench). */
export function triangles(geometry: THREE.BufferGeometry | null | undefined): number {
  if (!geometry) return 0
  return (geometry.index ? geometry.index.count : geometry.attributes.position!.count) / 3
}
