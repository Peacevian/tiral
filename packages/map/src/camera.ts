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
}

function makePerspective(fov: number, aspect: number, near: number, far: number): THREE.Matrix4 {
  const f = 1 / Math.tan(fov / 2)
  const nf = 1 / (near - far)
  return new THREE.Matrix4().set(
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, 2 * far * near * nf,
    0, 0, -1, 0
  )
}

export function buildMercatorViewProjectionMatrix(t: MapTransformLike): THREE.Matrix4 {
  const center = lngLatToMercator(t.center)
  const aspect = t.width / t.height
  const worldSize = t.worldSize

  const matrix = makePerspective(t.fovInRadians, aspect, t.nearZ, t.farZ)
  matrix.multiply(new THREE.Matrix4().makeScale(1, -1, 1))
  matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, -t.cameraToCenterDistance))
  if (t.rollInRadians) matrix.multiply(new THREE.Matrix4().makeRotationZ(-t.rollInRadians))
  matrix.multiply(new THREE.Matrix4().makeRotationX(t.pitchInRadians))
  matrix.multiply(new THREE.Matrix4().makeRotationZ(-t.bearingInRadians))
  matrix.multiply(
    new THREE.Matrix4().makeTranslation(-center.x * worldSize, -center.y * worldSize, 0)
  )
  matrix.multiply(new THREE.Matrix4().makeScale(worldSize, worldSize, worldSize))
  return matrix
}

export function metersToMercatorZ(meters: number): number {
  return meters / (2 * Math.PI * 6378137)
}
