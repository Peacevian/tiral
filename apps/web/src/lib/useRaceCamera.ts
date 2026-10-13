"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { LatLng } from "@tiral/game-core"

// One step closer than the lobby so roads read wider than a runner's stride.
const RACE_ZOOM = 17
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
  // True once the user grabs the map (drag/pinch/wheel). Follow stays off
  // until recenter is tapped, so the map is freely movable at any time.
  const [followSuspended, setFollowSuspended] = useState(false)
  const suspendedRef = useRef(false)

  const suspendFollow = useCallback(() => {
    suspendedRef.current = true
    setFollowSuspended(true)
  }, [])

  const flyToPlayer = useCallback(() => {
    if (!map) return false
    const target = coordinateRef.current
    if (!target) return false
    suspendedRef.current = false
    setFollowSuspended(false)
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

  // Any user-initiated camera move (drag, wheel, pinch) pauses follow.
  // Programmatic flights carry no originalEvent, so they don't suspend.
  useEffect(() => {
    if (!map) return
    const onMoveStart = (event: maplibregl.MapLibreEvent) => {
      if (event.originalEvent) suspendFollow()
    }
    map.on("movestart", onMoveStart)
    return () => {
      map.off("movestart", onMoveStart)
    }
  }, [map, suspendFollow])

  useEffect(() => {
    const enteredRacing = previousPhaseRef.current !== "racing" && phase === "racing"
    previousPhaseRef.current = phase
    if (enteredRacing) {
      suspendedRef.current = false
      setFollowSuspended(false)
      flyToPlayer()
    }
    if (phase !== "racing") {
      suspendedRef.current = false
      setFollowSuspended(false)
    }
  }, [phase, flyToPlayer])

  useEffect(() => {
    if (!map || phase !== "racing" || suspendedRef.current) return
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

  return { recenter: flyToPlayer, suspendFollow, followSuspended }
}
