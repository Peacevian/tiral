import * as THREE from "three"
import type { LatLng } from "@tiral/game-core"
import { lngLatToMercator } from "./mercator.js"

export type MapTransformLike = {
  worldSize: number
  cameraToCenterDistance: number
  bearingInRadians: number
  pitchInRadians: number
  rollInRadians: number
  fovInRadians: number
  width: number
  height: number
  nearZ: number
  farZ: number
  center: LatLng
  /**
   * Where the camera's centre sits relative to the middle of the screen, in CSS
   * px (the map's own `centerOffset`, which camera padding sets). The map shifts
   * everything it draws by this; so must the overlay, or avatars slide off the roads.
   */
  centerOffset?: { x: number; y: number }
}

// Reused every frame: this runs once per rendered frame of the 3D overlay.
const step = new THREE.Matrix4()

function setPerspective(
  out: THREE.Matrix4,
  fov: number,
  aspect: number,
  near: number,
  far: number,
  shiftX = 0,
  shiftY = 0
): THREE.Matrix4 {
  const f = 1 / Math.tan(fov / 2)
  const nf = 1 / (near - far)
  return out.set(
    f / aspect, 0, shiftX, 0,
    0, f, shiftY, 0,
    0, 0, (far + near) * nf, 2 * far * near * nf,
    0, 0, -1, 0
  )
}

/** The map's view-projection in mercator units, written into `out` (no allocations). */
export function buildMercatorViewProjectionMatrix(t: MapTransformLike, out = new THREE.Matrix4()): THREE.Matrix4 {
  const center = lngLatToMercator(t.center)
  const aspect = t.width / t.height
  const worldSize = t.worldSize

  // The same off-centre shift the map puts in its projection (maplibre-gl transform).
  const offset = t.centerOffset
  const matrix = setPerspective(
    out,
    t.fovInRadians,
    aspect,
    t.nearZ,
    t.farZ,
    offset ? (-offset.x * 2) / t.width : 0,
    offset ? (offset.y * 2) / t.height : 0
  )
  matrix.multiply(step.makeScale(1, -1, 1))
  matrix.multiply(step.makeTranslation(0, 0, -t.cameraToCenterDistance))
  if (t.rollInRadians) matrix.multiply(step.makeRotationZ(-t.rollInRadians))
  matrix.multiply(step.makeRotationX(t.pitchInRadians))
  matrix.multiply(step.makeRotationZ(-t.bearingInRadians))
  matrix.multiply(step.makeTranslation(-center.x * worldSize, -center.y * worldSize, 0))
  matrix.multiply(step.makeScale(worldSize, worldSize, worldSize))
  return matrix
}

export function metersToMercatorZ(meters: number): number {
  return meters / (2 * Math.PI * 6378137)
}
