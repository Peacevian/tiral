"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { LatLng } from "@tiral/game-core"

// One step closer than the lobby so roads read wider than a runner's stride.
const RACE_ZOOM = 17
const PHONE_ZOOM = 17.5
const RACE_PITCH = 48
const START_FLIGHT_MS = 2000
const FOLLOW_GLIDE_MS = 400
const FOLLOW_DEAD_ZONE_FRACTION = 0.25

function cameraFrame(): { zoom: number; padding: maplibregl.PaddingOptions | null } {
  const phone = typeof window !== "undefined" && window.innerWidth < 768
  const game = typeof document !== "undefined" ? document.querySelector(".tiral-game") : null
  const raw = game instanceof HTMLElement ? game.style.getPropertyValue("--tiral-controls") : ""
  const controls = Number.parseFloat(raw) || 0
  return {
    zoom: phone ? PHONE_ZOOM : RACE_ZOOM,
    // Bottom padding parks the runner in the map above the pad. No padding
    // when the play screen has no deck (a hustle shift uses this camera too).
    padding: controls > 0 ? { top: 72, bottom: controls + 12, left: 16, right: 16 } : null
  }
}

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
  const overviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const frame = cameraFrame()
    map.flyTo({
      center: [target.lng, target.lat],
      zoom: frame.zoom,
      pitch: RACE_PITCH,
      bearing: toBearingDegrees(headingRef.current),
      padding: frame.padding ?? undefined,
      duration: START_FLIGHT_MS,
      // Not "essential": with Reduce Motion on, MapLibre jumps instead of flying.
      essential: false
    })
    return true
  }, [map])

  // Any user-initiated camera move (drag, wheel, pinch) pauses follow.
  // Programmatic flights carry no originalEvent, so they don't suspend.
  useEffect(() => {
    if (!map) return
    const onMoveStart = (event: maplibregl.MapLibreEvent) => {
      if (!event.originalEvent) return
      // Grabbing the map during an overview cancels the trip back.
      if (overviewTimer.current) {
        clearTimeout(overviewTimer.current)
        overviewTimer.current = null
      }
      suspendFollow()
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
    // Let a glide (or the race-start flight) finish instead of restarting it
    // on every position update.
    if (map.isEasing() || map.isMoving()) return
    const canvas = map.getCanvas()
    const point = map.project([target.lng, target.lat])
    const frame = cameraFrame()
    const pad = frame.padding
    const top = pad?.top ?? 0
    const bottom = pad?.bottom ?? 0
    const left = pad?.left ?? 0
    const right = pad?.right ?? 0
    const centerX = left + (canvas.clientWidth - left - right) / 2
    const centerY = top + (canvas.clientHeight - top - bottom) / 2
    const threshold =
      Math.min(canvas.clientWidth, canvas.clientHeight) * FOLLOW_DEAD_ZONE_FRACTION
    const dx = point.x - centerX
    const dy = point.y - centerY
    if (Math.hypot(dx, dy) > threshold) {
      map.easeTo({
        center: [target.lng, target.lat],
        padding: pad ?? undefined,
        duration: FOLLOW_GLIDE_MS
      })
    }
  }, [map, phase, coordinate])

  // Briefly frame several points (e.g. you + a job's pickup and drop-off),
  // then fly back and resume following.
  const showOverview = useCallback(
    (points: LatLng[], padding: maplibregl.PaddingOptions, holdMs = 2500) => {
      if (!map || points.length === 0) return
      if (overviewTimer.current) clearTimeout(overviewTimer.current)
      suspendedRef.current = true
      const lngs = points.map((point) => point.lng)
      const lats = points.map((point) => point.lat)
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)]
        ],
        { padding, maxZoom: cameraFrame().zoom, duration: 900, essential: false }
      )
      overviewTimer.current = setTimeout(() => {
        overviewTimer.current = null
        flyToPlayer()
      }, holdMs + 900)
    },
    [map, flyToPlayer]
  )
  useEffect(
    () => () => {
      if (overviewTimer.current) clearTimeout(overviewTimer.current)
    },
    []
  )

  return { recenter: flyToPlayer, suspendFollow, followSuspended, showOverview }
}
