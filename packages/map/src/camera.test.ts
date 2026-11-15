import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { buildMercatorViewProjectionMatrix, type MapTransformLike } from "./camera"
import { lngLatToMercator } from "./mercator"

const transform = (centerOffset?: { x: number; y: number }): MapTransformLike => ({
  worldSize: 512 * 2 ** 17,
  cameraToCenterDistance: 900,
  bearingInRadians: 0.3,
  pitchInRadians: 0.84,
  rollInRadians: 0,
  fovInRadians: 0.6435,
  width: 400,
  height: 800,
  nearZ: 16,
  farZ: 9000,
  center: { lat: 0.3136, lng: 32.5811 },
  centerOffset
})

// Where the map's own centre lands on screen, in CSS px from the top-left.
function centreOnScreen(t: MapTransformLike) {
  const m = buildMercatorViewProjectionMatrix(t)
  const c = lngLatToMercator(t.center)
  const ndc = new THREE.Vector3(c.x, c.y, 0).applyMatrix4(m)
  return { x: (ndc.x * 0.5 + 0.5) * t.width, y: (-ndc.y * 0.5 + 0.5) * t.height }
}

describe("overlay camera", () => {
  it("puts the map centre in the middle of the screen with no padding", () => {
    const at = centreOnScreen(transform())
    expect(at.x).toBeCloseTo(200, 3)
    expect(at.y).toBeCloseTo(400, 3)
  })

  it("follows the map when camera padding moves the centre (the runner sits above the control pad)", () => {
    // Padding top 72, bottom 300: the map's centre sits (72 - 300) / 2 = 114 px above the middle.
    const at = centreOnScreen(transform({ x: 0, y: -114 }))
    expect(at.x).toBeCloseTo(200, 3)
    expect(at.y).toBeCloseTo(400 - 114, 3)
    const side = centreOnScreen(transform({ x: 30, y: 0 }))
    expect(side.x).toBeCloseTo(230, 3)
  })
})
