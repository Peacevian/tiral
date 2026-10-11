"use client"

import { useCallback, useEffect, useRef } from "react"
import type { LatLng } from "@tiral/game-core"

const RACE_ZOOM = 16
const RACE_PITCH = 48
const START_FLIGHT_MS = 2000
const FOLLOW_GLIDE_MS = 400
const FOLLOW_DEAD_ZONE_FRACTION = 0.25

function toBearingDegrees(headingRadians: number): number {
  return (headingRadians * 180) / Math.PI
}

export function useRaceCamera(
  map: maplibregl.Map | null,
  phase: string,
  coordinate: LatLng | null,
  heading: number
) {
  const previousPhaseRef = useRef(phase)
  const coordinateRef = useRef(coordinate)
  const headingRef = useRef(heading)
  coordinateRef.current = coordinate
  headingRef.current = heading

  const flyToPlayer = useCallback(() => {
    if (!map) return false
    const target = coordinateRef.current
    if (!target) return false
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: RACE_ZOOM,
      pitch: RACE_PITCH,
      bearing: toBearingDegrees(headingRef.current),
      duration: START_FLIGHT_MS,
      essential: true
    })
    return true
  }, [map])

  useEffect(() => {
    const enteredRacing = previousPhaseRef.current !== "racing" && phase === "racing"
    previousPhaseRef.current = phase
    if (enteredRacing) {
      flyToPlayer()
    }
  }, [phase, flyToPlayer])

  useEffect(() => {
    if (!map || phase !== "racing") return
    const target = coordinate
    if (!target) return
    const canvas = map.getCanvas()
    const point = map.project([target.lng, target.lat])
    const threshold =
      Math.min(canvas.clientWidth, canvas.clientHeight) * FOLLOW_DEAD_ZONE_FRACTION
    const dx = point.x - canvas.clientWidth / 2
    const dy = point.y - canvas.clientHeight / 2
    if (Math.hypot(dx, dy) > threshold) {
      map.easeTo({ center: [target.lng, target.lat], duration: FOLLOW_GLIDE_MS })
    }
  }, [map, phase, coordinate])

  return { recenter: flyToPlayer }
}
