"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { lngLatToMercator, mercatorToLngLat } from "@tiral/map"
import maplibregl from "maplibre-gl"
import { BUILDING_DESIGNS, buildProgress, findPlot, type Building } from "@tiral/game-core"
import { LAND_CHANGED_EVENT } from "@/lib/landEvents"
import { shapeBuilding, type BuildingPart } from "./playerBuildings"
import { useMapOrigin } from "@/components/ThreeLayer"
import { isLiteDevice } from "@/lib/deviceTier"
import { OWN_BUILDING_AREAS, buildingsHeight } from "@/lib/mapStyle"
import { ANCHOR, loadIndex, loadTile, tileBounds, toLocal, type CityIndex, type TileData } from "./cityData"
import { buildFar, buildNear, disposeNear, triangles, type NearTile } from "./cityBuild"
import {
  balconyTexture,
  barredTexture,
  concreteRoofTexture,
  flatsTexture,
  gridTowerTexture,
  groundImage,
  houseTexture,
  ironRoofTexture,
  louvreTexture,
  scaffoldTexture,
  shopTexture,
  signTexture,
  towerTexture
} from "./cityTextures"

// All of Kampala drawn by Tiral (docs/city.md): every OpenStreetMap building
// with its real height (Google Open Buildings 2.5D), in tiles of ~550 m that
// load near where the map is looking and are dropped when it's gone.
//  - Near (~450 m): the full look: facades with windows, shops, houses, iron
//    and concrete roofs, water tanks, trees and street lights.
//  - Further (up to ~2 km, less when zoomed in): plain blocks at their real
//    heights, one mesh a tile.
//  - Beyond that the map's own blocks carry on; they're flattened wherever
//    Tiral's tiles are.
// Tiles are fetched (a few at once) and built one at a time between frames,
// nearest first, so the screen never freezes. The map underneath keeps
// drawing the roads and their names, over a pavement ground.

const EARTH = 2 * Math.PI * 6378137
/** Below this map zoom the city is too small to see (as the map's own 3D blocks). */
export const CITY_MIN_ZOOM = 14.8
/** The full look, trees and lights from this zoom in. */
const NEAR_ZOOM = 15.8
/** All of Kampala the tiles cover (make_tiles.py). */
const KAMPALA = { south: 0.235, west: 32.5, north: 0.42, east: 32.68 }

/** How far (m) from the middle of the map tiles load, by zoom; cheap phones less. */
function reach(zoom: number, lite: boolean) {
  const far = zoom >= 17 ? 900 : zoom >= 16 ? 1400 : 2000
  const near = zoom >= NEAR_ZOOM ? 450 : 0
  return lite ? { far: far * 0.6, near: near * 0.7 } : { far, near }
}

// ---------------------------------------------------------------------------
// Shared parts: materials and the instanced models (made once, on first use).

const flat = (color?: string) => new THREE.MeshBasicMaterial({ color, toneMapped: false })

/** One geometry from parts, each painted its own colour (vertex colours). */
function painted(parts: Array<[THREE.BufferGeometry, string]>) {
  const positions: number[] = []
  const colors: number[] = []
  for (const [part, colour] of parts) {
    const geometry = part.index ? part.toNonIndexed() : part
    const color = new THREE.Color(colour)
    const array = geometry.attributes.position!.array
    for (let i = 0; i < array.length; i += 3) {
      positions.push(array[i]!, array[i + 1]!, array[i + 2]!)
      // A little shading by height, so the shapes read without lighting.
      const shade = 0.82 + 0.18 * Math.min(1, Math.max(0, array[i + 2]! / 6))
      colors.push(color.r * shade, color.g * shade, color.b * shade)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

const up = (geometry: THREE.BufferGeometry) => geometry.rotateX(Math.PI / 2)

type Parts = ReturnType<typeof makeParts>
let shared: Parts | null = null

function makeParts(lite: boolean) {
  // Unlit: the sun is baked into the vertex colours (the map's mirrored
  // projection would confuse lit materials about which side faces up).
  const make = (map?: THREE.Texture) => new THREE.MeshBasicMaterial({ ...(map ? { map } : {}), vertexColors: true, side: THREE.DoubleSide, toneMapped: false })
  return {
    towers: [make(towerTexture()), make(gridTowerTexture())],
    flats: [make(flatsTexture()), make(balconyTexture()), make(barredTexture()), make(louvreTexture())],
    shops: make(shopTexture()),
    houses: make(houseTexture()),
    iron: make(ironRoofTexture()),
    concrete: make(concreteRoofTexture()),
    scaffold: make(scaffoldTexture()),
    plain: make(),
    painted: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    // A trunk and one leafy crown: ~30 triangles a tree.
    tree: painted([
      [up(new THREE.CylinderGeometry(0.18, 0.28, 3.2, 5, 1, true)).translate(0, 0, 1.6), "#6B4A2B"],
      [new THREE.IcosahedronGeometry(2.4, 0).scale(1, 1, 0.85).translate(0, 0, 4.3), "#55873C"]
    ]),
    light: painted([
      [up(new THREE.CylinderGeometry(0.08, 0.12, 7.5, 5, 1, true)).translate(0, 0, 3.75), "#5B6168"],
      [new THREE.BoxGeometry(1.8, 0.1, 0.1).translate(0.9, 0, 7.4), "#5B6168"],
      [new THREE.BoxGeometry(0.6, 0.28, 0.16).translate(1.7, 0, 7.3), "#F8F3E1"]
    ]),
    tank: up(new THREE.CylinderGeometry(0.9, 0.9, 1.8, lite ? 8 : 12)).translate(0, 0, 0.9),
    tankMaterial: flat("#2A2E33")
  }
}

/** Trees vary a little in colour. */
const TREE_GREENS = ["#ffffff", "#e6f0d8", "#f4f8e8", "#d8e6c8"].map((c) => new THREE.Color(c))

function Instances({ geometry, material, items, tint }: { geometry: THREE.BufferGeometry; material: THREE.Material; items: THREE.Matrix4[]; tint?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  // Before the frame that shows them (not after, at the origin).
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    items.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix)
      if (tint) mesh.setColorAt(i, TREE_GREENS[i % TREE_GREENS.length]!)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // So the phone can skip the tile's trees when they're off screen.
    mesh.computeBoundingSphere()
  }, [items, tint])
  if (items.length === 0) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} />
}

function NearMeshes({ near, parts }: { near: NearTile; parts: Parts }) {
  return (
    <>
      {near.houses && <mesh geometry={near.houses} material={parts.houses} />}
      {near.shops && <mesh geometry={near.shops} material={parts.shops} />}
      {near.flats.map((geometry, i) => geometry && <mesh key={`f${i}`} geometry={geometry} material={parts.flats[i]} />)}
      {near.towers.map((geometry, i) => geometry && <mesh key={`t${i}`} geometry={geometry} material={parts.towers[i]} />)}
      {near.iron && <mesh geometry={near.iron} material={parts.iron} />}
      {near.concrete && <mesh geometry={near.concrete} material={parts.concrete} />}
      <Instances geometry={parts.tree} material={parts.painted} items={near.trees} tint />
      <Instances geometry={parts.light} material={parts.painted} items={near.lights} />
      <Instances geometry={parts.tank} material={parts.tankMaterial} items={near.tanks} />
    </>
  )
}

// ---------------------------------------------------------------------------
// The map underneath: pavement instead of the plain grey over Kampala, and the
// map's own 3D blocks flattened wherever Tiral has drawn its tiles.

const GROUND_LAYER = "tiral-city-ground"

function square(b: { south: number; west: number; north: number; east: number }) {
  return [
    [
      [b.west, b.south],
      [b.east, b.south],
      [b.east, b.north],
      [b.west, b.north],
      [b.west, b.south]
    ]
  ]
}

function useMapGround(map: maplibregl.Map | null, drawn: number[][][][]) {
  useEffect(() => {
    if (!map) return
    // (isStyleLoaded() stays false while tiles load, so just try, and again
    // on the next style event until the style's there.)
    const apply = () => {
      try {
        if (!map.getLayer("background")) return
        if (map.getLayer("tiral-buildings-3d") && map.getLayoutProperty("tiral-buildings-3d", "visibility") !== "none") map.setLayoutProperty("tiral-buildings-3d", "visibility", "none")
        if (map.getLayer(GROUND_LAYER)) return
        if (!map.hasImage(GROUND_LAYER)) map.addImage(GROUND_LAYER, groundImage())
        if (!map.getSource(GROUND_LAYER)) map.addSource(GROUND_LAYER, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: square(KAMPALA) } } })
        // Over the plain ground, under parks, water and every road and label.
        const layers = map.getStyle().layers
        const before = layers.find((layer) => layer.id === "park") ?? layers.find((layer) => layer.type === "line" || layer.type === "symbol")
        map.addLayer({ id: GROUND_LAYER, type: "fill", source: GROUND_LAYER, minzoom: CITY_MIN_ZOOM - 0.5, paint: { "fill-pattern": GROUND_LAYER, "fill-opacity": ["interpolate", ["linear"], ["zoom"], CITY_MIN_ZOOM - 0.5, 0, CITY_MIN_ZOOM, 1] } }, before?.id)
      } catch {
        // Style not parsed yet.
      }
    }
    apply()
    map.on("styledata", apply)
    map.on("load", apply)
    return () => {
      map.off("styledata", apply)
      map.off("load", apply)
      try {
        if (map.getLayer(GROUND_LAYER)) map.removeLayer(GROUND_LAYER)
        if (map.getSource(GROUND_LAYER)) map.removeSource(GROUND_LAYER)
        if (map.getLayer("tiral-buildings-3d")) map.setLayoutProperty("tiral-buildings-3d", "visibility", "visible")
        if (map.getLayer("building-3d")) map.setPaintProperty("building-3d", "fill-extrusion-height", buildingsHeight(isLiteDevice(), OWN_BUILDING_AREAS))
      } catch {
        // The map itself is gone.
      }
    }
  }, [map])

  // Flatten the map's own blocks where Tiral's tiles are drawn (a moment
  // after they change: restyling the map's layer isn't free).
  useEffect(() => {
    if (!map) return
    const timer = window.setTimeout(() => {
      try {
        if (map.getLayer("building-3d")) map.setPaintProperty("building-3d", "fill-extrusion-height", buildingsHeight(isLiteDevice(), [...OWN_BUILDING_AREAS, ...drawn]))
      } catch {
        // Style not ready: the next change tries again.
      }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [map, drawn])
}

// ---------------------------------------------------------------------------

type Entry = {
  key: string
  /** Middle of the tile, local metres. */
  x: number
  y: number
  data?: TileData
  loading?: boolean
  /** Undefined: not built; null: built, but nothing in it. */
  far?: THREE.BufferGeometry | null
  near?: NearTile
  wantFar: boolean
  wantNear: boolean
  distance: number
}

type Shown = { key: string; far: THREE.BufferGeometry | null | undefined; near: NearTile | undefined }

export type CityStats = {
  tiles: number
  near: number
  far: number
  downloadedKB: number
  buildings: number
  triangles: number
  buildMs: number
  slowestBuildMs: number
  queued: number
}

/** Tiral's city. Inside a <ThreeLayer>; `map` is that layer's map. */
export function City({ map }: { map: maplibregl.Map | null }) {
  const origin = useMapOrigin()
  const group = useRef<THREE.Group>(null)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const [parts, setParts] = useState<Parts | null>(null)
  const [shown, setShown] = useState<Shown[]>([])
  const [drawn, setDrawn] = useState<number[][][][]>([])
  const mercator = useMemo(() => lngLatToMercator(ANCHOR), [])
  const scale = 1 / (EARTH * Math.cos((ANCHOR.lat * Math.PI) / 180))
  const lite = useMemo(() => isLiteDevice(), [])
  useMapGround(map, drawn)

  const state = useRef({
    index: null as CityIndex | null,
    entries: new Map<string, Entry>(),
    fetching: 0,
    downloaded: 0,
    buildMs: 0,
    slowest: 0,
    lastPlan: 0,
    zoom: 0
  })

  useEffect(() => {
    // Draw calls and triangles per frame, for the test bench.
    if (process.env.NODE_ENV === "development") Object.assign(window, { __cityRenderer: gl, __cityScene: scene })
  }, [gl, scene])

  useEffect(() => {
    let alive = true
    let timer = 0
    const s = state.current
    const publish = () => {
      const list: Shown[] = []
      const squares: number[][][][] = []
      for (const e of s.entries.values()) {
        if (!e.far && !e.near) continue
        list.push({ key: e.key, far: e.far, near: e.near })
        squares.push(square(tileBounds(s.index!, e.key)))
      }
      setShown(list)
      setDrawn(squares)
      map?.triggerRepaint()
      if (process.env.NODE_ENV === "development") report(s.entries, list, s)
    }
    const neighbours = (e: Entry) => {
      const [y, x] = e.key.split("_").map(Number) as [number, number]
      const around: TileData[] = []
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const data = s.entries.get(`${y + dy}_${x + dx}`)?.data
          if (data) around.push(data)
        }
      return around
    }
    // One piece of work, then let the phone draw a frame.
    const pump = () => {
      if (!alive) return
      timer = window.setTimeout(pump, 40)
      if (!s.index) return
      const entries = [...s.entries.values()].filter((e) => e.wantFar || e.wantNear || e.data || e.far !== undefined || e.near).sort((a, b) => a.distance - b.distance)
      // Fetch what's wanted, nearest first, a few at once.
      for (const e of entries) {
        if (s.fetching >= 4) break
        if ((e.wantFar || e.wantNear) && !e.data && !e.loading) {
          e.loading = true
          s.fetching++
          loadTile(s.index, e.key)
            .then((data) => {
              if (!alive) return
              e.data = data
              s.downloaded += data.bytes
            })
            .catch((error) => console.warn(error))
            .finally(() => {
              e.loading = false
              s.fetching--
            })
        }
      }
      let changed = false
      // Drop what's out of reach (the near look only once the plain blocks are there).
      for (const e of entries) {
        if (!e.wantFar && !e.wantNear && (e.far !== undefined || e.near)) {
          e.far?.dispose()
          if (e.near) disposeNear(e.near)
          e.far = undefined
          e.near = undefined
          changed = true
        } else if (e.near && !e.wantNear && e.far !== undefined) {
          disposeNear(e.near)
          e.near = undefined
          changed = true
        }
      }
      // Keep downloaded tiles for coming back, up to a point.
      const cached = entries.filter((e) => e.data && !e.wantFar && !e.wantNear)
      for (const e of cached.slice(120)) e.data = undefined
      // Build one: the full look where it's wanted, else plain blocks.
      const job =
        entries.find((e) => e.wantNear && e.data && !e.near) ??
        entries.find((e) => e.data && e.far === undefined && ((e.wantFar && !e.near) || (e.near && !e.wantNear)))
      if (job) {
        const t0 = performance.now()
        if (job.wantNear && !job.near) job.near = buildNear(job.data!, neighbours(job), lite)
        else job.far = buildFar(job.data!)
        const took = performance.now() - t0
        s.buildMs += took
        s.slowest = Math.max(s.slowest, took)
        changed = true
      }
      if (changed) publish()
    }
    void loadIndex()
      .then((index) => {
        if (!alive) return
        shared ??= makeParts(lite)
        setParts(shared)
        s.index = index
        for (const key of Object.keys(index.tiles)) {
          const b = tileBounds(index, key)
          const [x, y] = toLocal((b.south + b.north) / 2, (b.west + b.east) / 2)
          s.entries.set(key, { key, x, y, wantFar: false, wantNear: false, distance: Infinity })
        }
        s.lastPlan = 0
        pump()
      })
      .catch((error) => console.error("City failed to load:", error))
    return () => {
      alive = false
      window.clearTimeout(timer)
      for (const e of s.entries.values()) {
        e.far?.dispose()
        if (e.near) disposeNear(e.near)
      }
      s.entries.clear()
      s.index = null
    }
  }, [map, lite])

  useFrame(() => {
    const g = group.current
    const s = state.current
    const zoom = Math.log2(origin.current.worldSize / 512)
    if (g) {
      // Too far out to see: leave it to the map.
      g.visible = zoom >= CITY_MIN_ZOOM
      g.position.set(mercator.x - origin.current.x, mercator.y - origin.current.y, 0)
      // Metres to mercator units (x, y and height alike, as for the runners).
      g.scale.setScalar(scale)
    }
    // Which tiles are wanted, a couple of times a second (or when the zoom jumps).
    const now = performance.now()
    if (!s.index || (now - s.lastPlan < 500 && Math.abs(zoom - s.zoom) < 0.5)) return
    s.lastPlan = now
    s.zoom = zoom
    const centre = mercatorToLngLat({ x: origin.current.x, y: origin.current.y })
    const [cx, cy] = toLocal(centre.lat, centre.lng)
    const { far, near } = zoom >= CITY_MIN_ZOOM ? reach(zoom, lite) : { far: 0, near: 0 }
    // Distances to the tile's edge, roughly (half its diagonal off the middle).
    const half = s.index.cell * 111_000 * 0.71
    for (const e of s.entries.values()) {
      e.distance = Math.max(0, Math.hypot(e.x - cx, e.y - cy) - half)
      // A little slack before dropping, so tiles at the edge don't flicker in and out.
      e.wantFar = e.distance < (e.far !== undefined || e.near ? far * 1.25 : far)
      e.wantNear = near > 0 && e.distance < (e.near ? near * 1.4 : near)
    }
  })

  if (!parts) return null
  // Static: the overlay needn't keep redrawing for the city alone (ThreeLayer).
  return (
    <group ref={group} userData={{ static: true }}>
      {shown.map((tile) => (
        <group key={tile.key}>{tile.near ? <NearMeshes near={tile.near} parts={parts} /> : tile.far && <mesh geometry={tile.far} material={parts.plain} />}</group>
      ))}
      <PlayerBuildings parts={parts} map={map} />
    </group>
  )
}

/** Sizes for the test bench (development only): window.__cityStats. */
function report(entries: Map<string, Entry>, list: Shown[], s: { downloaded: number; buildMs: number; slowest: number }) {
  let tris = 0
  let buildings = 0
  let queued = 0
  for (const e of entries.values()) {
    if (e.near) {
      const n = e.near
      tris += [...n.towers, ...n.flats, n.shops, n.houses, n.iron, n.concrete].reduce((sum, g) => sum + triangles(g), 0)
      tris += n.trees.length * triangles(shared!.tree) + n.lights.length * triangles(shared!.light) + n.tanks.length * triangles(shared!.tank)
    } else tris += triangles(e.far)
    if (e.far || e.near) buildings += e.data?.buildings.length ?? 0
    if ((e.wantFar && e.far === undefined && !e.near) || (e.wantNear && !e.near)) queued++
  }
  const stats: CityStats = {
    tiles: list.length,
    near: list.filter((t) => t.near).length,
    far: list.filter((t) => t.far && !t.near).length,
    downloadedKB: Math.round(s.downloaded / 1024),
    buildings,
    triangles: Math.round(tris),
    buildMs: Math.round(s.buildMs),
    slowestBuildMs: Math.round(s.slowest),
    queued
  }
  ;(window as unknown as { __cityStats?: CityStats }).__cityStats = stats
}

// ---------------------------------------------------------------------------
// What players have built on their plots (docs/land.md): fetched with the
// land list, rebuilt when it changes (LAND_CHANGED_EVENT) and every 20 s
// (builds take minutes).

type PlotBuilding = { plotId: string; ownerName?: string; building: Building | null }

/** Name tags show from this zoom in (closer than a race's usual view). */
const TAG_ZOOM = 16.3

const SIGN_BOARDS = ["#E85F0C", "#1E56A8", "#C8102E", "#2F7D4A", "#6D28D9", "#0E7490", "#B45309"]

function PlayerBuildings({ parts, map }: { parts: Parts; map: maplibregl.Map | null }) {
  const [plots, setPlots] = useState<PlotBuilding[]>([])
  const [minute, setMinute] = useState(0)
  useEffect(() => {
    let alive = true
    // The test bench can show made-up buildings (dev only: /dev/city?buildings=demo).
    const demo = process.env.NODE_ENV === "development" ? (window as unknown as { __demoLand?: PlotBuilding[] }).__demoLand : undefined
    if (demo) {
      setPlots(demo)
      return
    }
    const load = () =>
      fetch("/api/land", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ claimed: PlotBuilding[] }>) : null))
        .then((body) => {
          if (alive && body) setPlots(body.claimed.filter((c) => c.building))
        })
        .catch(() => undefined)
    void load()
    const onChange = () => void load()
    window.addEventListener(LAND_CHANGED_EVENT, onChange)
    const timer = window.setInterval(() => {
      setMinute((m) => m + 1)
      void load()
    }, 20_000)
    return () => {
      alive = false
      window.removeEventListener(LAND_CHANGED_EVENT, onChange)
      window.clearInterval(timer)
    }
  }, [])

  const built = useMemo(() => {
    void minute
    const now = new Date()
    return plots.flatMap(({ plotId, building }) => {
      const plot = findPlot(plotId)
      if (!plot || !building) return []
      const { progress, ready } = buildProgress(building, now)
      const shape = shapeBuilding(plot, building, progress, ready)
      const meshes = (Object.entries(shape.parts) as Array<[BuildingPart, NonNullable<(typeof shape.parts)[BuildingPart]>]>).flatMap(([part, builder]) => {
        const geometry = builder.geometry()
        return geometry ? [{ part, geometry }] : []
      })
      const sign = shape.sign && { ...shape.sign, texture: signTexture(shape.sign.text, SIGN_BOARDS[Math.abs(plot.gx * 31 + plot.gy * 17) % SIGN_BOARDS.length]!) }
      return [{ plotId, meshes, sign }]
    })
  }, [plots, minute])

  // Tags change only when a building finishes (not on every refresh).
  const tagKey = JSON.stringify(plots.map(({ plotId, ownerName, building }) => [plotId, ownerName, building?.design, building?.sign, building ? buildProgress(building).ready : null]))

  // A name tag over each player's building: what it is and whose it is
  // ("🏪 Mama Rose · VibeTrader"). On the Land page a tap opens the plot;
  // elsewhere (races, hustles) they can't be tapped, so nobody leaves a race
  // by accident.
  useEffect(() => {
    if (!map) return
    const onLand = window.location.pathname === "/land"
    const markers = plots.flatMap(({ plotId, ownerName, building }) => {
      const plot = findPlot(plotId)
      if (!plot || !building) return []
      const design = BUILDING_DESIGNS[building.design]
      const ready = buildProgress(building).ready
      const el = document.createElement(onLand ? "button" : "div")
      el.className = `tiral-plot-tag${onLand ? "" : " tiral-plot-tag--still"}`
      const what = document.createElement("span")
      what.className = "tiral-plot-tag__what"
      // Text only (names and signs are typed by players).
      what.textContent = `${ready ? design.icon : "🚧"} ${building.sign ?? design.name}`
      el.append(what)
      if (ownerName) {
        const who = document.createElement("span")
        who.className = "tiral-plot-tag__who"
        who.textContent = ownerName
        el.append(who)
      }
      if (onLand) {
        el.setAttribute("aria-label", `${building.sign ?? design.name}, ${ownerName ?? "a player"}'s plot`)
        el.addEventListener("click", (event) => {
          event.stopPropagation()
          window.dispatchEvent(new CustomEvent("tiral:select-plot", { detail: plotId }))
        })
      }
      return [new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -6] }).setLngLat([plot.center.lng, plot.center.lat]).addTo(map)]
    })
    const show = () => {
      const visible = map.getZoom() >= TAG_ZOOM
      for (const marker of markers) marker.getElement().style.visibility = visible ? "visible" : "hidden"
    }
    show()
    map.on("zoom", show)
    return () => {
      map.off("zoom", show)
      for (const marker of markers) marker.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when tagKey says so
  }, [tagKey, map])

  useEffect(() => {
    map?.triggerRepaint()
    return () => {
      for (const b of built) {
        for (const m of b.meshes) m.geometry.dispose()
        b.sign?.texture.dispose()
      }
    }
  }, [built, map])

  const material: Record<BuildingPart, THREE.Material> = {
    shops: parts.shops,
    flats: parts.flats[0]!,
    balcony: parts.flats[1]!,
    towers: parts.towers[0]!,
    houses: parts.houses,
    iron: parts.iron,
    concrete: parts.concrete,
    scaffold: parts.scaffold
  }
  return (
    <>
      {built.map((b) => (
        <group key={b.plotId}>
          {b.meshes.map((m) => (
            <mesh key={m.part} geometry={m.geometry} material={material[m.part]} />
          ))}
          {b.sign && (
            <mesh position={[b.sign.x, b.sign.y, b.sign.z]} rotation={[Math.PI / 2, 0, b.sign.angle, "ZXY"]}>
              <planeGeometry args={[b.sign.width, b.sign.height]} />
              <meshBasicMaterial map={b.sign.texture} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          )}
        </group>
      ))}
    </>
  )
}
