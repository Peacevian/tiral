"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl"
import type { LatLng } from "@tiral/game-core"
import { findNearestEdge, type RoadGraph } from "@tiral/road-graph"

// Must stay in sync with the server's snap guard (RaceRoom).
const MAX_START_SNAP_METERS = 500
const NOTICE_MS = 2600

type UseStartPlacementOptions = {
  map: MapLibreMap | null
  graph: RoadGraph | null
  /** Placement window open (lobby/countdown + connected). Gates the listener, never the mode. */
  canPlace: boolean
  /** Race running or over: placement is done, disarm. */
  placementOver: boolean
  /** Last server-confirmed pin (snapped). Null until the player places one. */
  serverPin: LatLng | null
  sendPlaceStart(lat: number, lng: number): void
}

// Explicit tap-to-place placement mode.
//
// Arming is the player's own action (button), so socket blips or phase
// changes can never silently disarm it: the tap listener simply waits for
// the window to reopen. Taps render an optimistic pin instantly; the
// server-snapped pin replaces it on broadcast. The last pin is re-sent
// automatically if the server comes back without it (drop/rejoin).
export function useStartPlacement({
  map,
  graph,
  canPlace,
  placementOver,
  serverPin,
  sendPlaceStart
}: UseStartPlacementOptions) {
  const [armed, setArmed] = useState(false)
  const [optimisticPin, setOptimisticPin] = useState<LatLng | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const lastSentRef = useRef<LatLng | null>(null)
  const resentRef = useRef(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    },
    []
  )

  // Adopt the server pin: confirmation clears the optimistic one.
  useEffect(() => {
    if (serverPin) {
      setOptimisticPin(null)
      resentRef.current = false
      lastSentRef.current = serverPin
    }
  }, [serverPin])

  // Race over: stand down.
  useEffect(() => {
    if (placementOver) setArmed(false)
  }, [placementOver])

  // Server lost our pin (drop/rejoin with a fresh player): re-send it.
  useEffect(() => {
    if (canPlace && !serverPin && lastSentRef.current && !resentRef.current) {
      resentRef.current = true
      sendPlaceStart(lastSentRef.current.lat, lastSentRef.current.lng)
    }
  }, [canPlace, serverPin, sendPlaceStart])

  // Tap listener: only needs map + graph + armed + open window.
  useEffect(() => {
    if (!map || !graph || !armed || !canPlace) return
    const onTap = (event: MapMouseEvent) => {
      const nearest = findNearestEdge(graph, {
        lat: event.lngLat.lat,
        lng: event.lngLat.lng
      })
      if (!nearest || nearest.distanceMeters > MAX_START_SNAP_METERS) {
        flashNotice("Too far from a walkable road — tap closer to a street")
        return
      }
      const pin = { lat: event.lngLat.lat, lng: event.lngLat.lng }
      lastSentRef.current = pin
      resentRef.current = false
      setOptimisticPin(pin)
      sendPlaceStart(pin.lat, pin.lng)
    }
    map.on("click", onTap)
    return () => {
      map.off("click", onTap)
    }
  }, [map, graph, armed, canPlace, sendPlaceStart, flashNotice])

  // Crosshair reflects the mode, so it can never silently revert.
  useEffect(() => {
    if (!map) return
    map.getCanvas().style.cursor = armed && canPlace ? "crosshair" : ""
    return () => {
      map.getCanvas().style.cursor = ""
    }
  }, [map, armed, canPlace])

  const effectivePin = serverPin ?? optimisticPin

  return {
    armed,
    setArmed,
    effectivePin,
    hasPin: effectivePin !== null,
    notice
  }
}
