"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LatLng } from "@tiral/game-core"
import {
  chooseBestEdge,
  classifyConnectedEdges,
  findNearestEdge,
  getDistanceToUpcomingNode,
  getRoadCoordinate,
  getRoadHeading,
  type RoadDirection,
  type RoadGraph,
  type RoadPosition
} from "@tiral/road-graph"

const WALK_SPEED_METERS_PER_SECOND = 18
const TURN_DECISION_DISTANCE_METERS = 28
const TURN_INTENT_TIMEOUT_MS = 3000

export type RoadInput =
  | { type: "walk"; on: boolean }
  | { type: "turn"; direction: RoadDirection }
  | { type: "turnAround" }

export function useRoadMovement(
  graph: RoadGraph | null,
  start: LatLng | null,
  onInput?: (input: RoadInput) => void,
  locked = false,
  /** Live speed factor (sprint ×1.35, collapsed 0); mirrors the server. */
  speedRef?: { current: number }
) {
  const [position, setPosition] = useState<RoadPosition | null>(null)
  const [moving, setMoving] = useState(false)
  const [turnIntent, setTurnIntent] = useState<RoadDirection | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const positionRef = useRef<RoadPosition | null>(null)
  const movingRef = useRef(false)
  const turnIntentRef = useRef<{ direction: RoadDirection; expiresAt: number } | null>(null)
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  // No seed, no avatar: the player stays off-map until they drop a start pin.
  // Crucially this also CLEARS any stale position (previous race, HMR state)
  // so an avatar can never appear before an explicit placement.
  useEffect(() => {
    if (!graph || !start) {
      positionRef.current = null
      setPosition(null)
      return
    }
    const nearest = findNearestEdge(graph, start)
    if (!nearest) return
    const next: RoadPosition = {
      edgeId: nearest.edgeId,
      distanceAlongEdge: nearest.distanceAlongEdge,
      direction: 1
    }
    positionRef.current = next
    setPosition(next)
    setFeedback(nearest.distanceMeters > 20 ? "Snapped to the nearest walkable road" : null)
  }, [graph, start?.lat, start?.lng])

  useEffect(() => {
    movingRef.current = moving
  }, [moving])

  const updateMoving = useCallback((on: boolean) => {
    if (lockedRef.current && on) {
      setFeedback("Wait for the race to start")
      return
    }
    setMoving(on)
    movingRef.current = on
    onInputRef.current?.({ type: "walk", on })
  }, [])

  useEffect(() => {
    if (locked) {
      setMoving(false)
      movingRef.current = false
    }
  }, [locked])

  const enterEdge = useCallback((edgeId: string, nodeId: string, overflow: number): RoadPosition | null => {
    if (!graph) return null
    const edge = graph.edges[edgeId]
    if (!edge) return null
    const direction: 1 | -1 = edge.fromNodeId === nodeId ? 1 : -1
    return {
      edgeId,
      distanceAlongEdge: direction === 1
        ? Math.min(overflow, edge.lengthMeters)
        : Math.max(edge.lengthMeters - overflow, 0),
      direction
    }
  }, [graph])

  useEffect(() => {
    if (!graph) return
    let frame = 0
    let previousTime = performance.now()

    const tick = (time: number) => {
      const deltaSeconds = Math.min((time - previousTime) / 1000, 0.1)
      previousTime = time
      const current = positionRef.current

      if (movingRef.current && current) {
        const edge = graph.edges[current.edgeId]
        if (edge) {
          const speed = WALK_SPEED_METERS_PER_SECOND * (speedRef?.current ?? 1)
          let distance = current.distanceAlongEdge + speed * deltaSeconds * current.direction
          const reachedEnd = distance > edge.lengthMeters
          const reachedStart = distance < 0

          if (reachedEnd || reachedStart) {
            const nodeId = reachedEnd ? edge.toNodeId : edge.fromNodeId
            const candidates = classifyConnectedEdges(graph, current)
            const intent = turnIntentRef.current && turnIntentRef.current.expiresAt > time
              ? turnIntentRef.current.direction
              : null
            const selected = chooseBestEdge(candidates, intent)
            const fallback = chooseBestEdge(candidates, "straight")
            const chosen = selected ?? (intent ? null : fallback)

            if (chosen) {
              const overflow = reachedEnd ? distance - edge.lengthMeters : -distance
              const next = enterEdge(chosen.edgeId, nodeId, overflow)
              if (next) {
                positionRef.current = next
                setPosition(next)
                setTurnIntent(null)
                turnIntentRef.current = null
                setFeedback(null)
              }
            } else {
              distance = reachedEnd ? edge.lengthMeters : 0
              const stopped = { ...current, distanceAlongEdge: distance }
              positionRef.current = stopped
              setPosition(stopped)
              setMoving(false)
              movingRef.current = false
              onInputRef.current?.({ type: "walk", on: false })
              setFeedback(intent ? `No ${intent} road here` : "Choose a direction at the junction")
            }
          } else {
            const next = { ...current, distanceAlongEdge: distance }
            positionRef.current = next
            setPosition(next)
          }
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enterEdge, graph])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      // Lower-case so Shift (sprint) + W still walks.
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === "w" || key === "ArrowUp") updateMoving(true)
      if (key === "a" || key === "ArrowLeft") requestTurn("left")
      if (key === "d" || key === "ArrowRight") requestTurn("right")
      if (key === "s" || key === "ArrowDown") turnAround()
      if (key === " ") updateMoving(false)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === "w" || key === "ArrowUp") updateMoving(false)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  })

  const requestTurn = useCallback((direction: RoadDirection) => {
    if (lockedRef.current) {
      setFeedback("Wait for the race to start")
      return
    }
    const current = positionRef.current
    if (!graph || !current) return
    const distance = getDistanceToUpcomingNode(graph, current)
    if (distance > TURN_DECISION_DISTANCE_METERS) {
      setFeedback(`Turn available in ${Math.round(distance)} m`)
      return
    }
    const available = classifyConnectedEdges(graph, current)
    if (!available.some((candidate) => candidate.direction === direction)) {
      setFeedback(`No ${direction} road here`)
      return
    }
    turnIntentRef.current = { direction, expiresAt: performance.now() + TURN_INTENT_TIMEOUT_MS }
    setTurnIntent(direction)
    onInputRef.current?.({ type: "turn", direction })
    setFeedback(`${direction[0]!.toUpperCase()}${direction.slice(1)} turn selected`)
  }, [graph])

  const turnAround = useCallback(() => {
    if (lockedRef.current) {
      setFeedback("Wait for the race to start")
      return
    }
    setMoving(false)
    movingRef.current = false
    onInputRef.current?.({ type: "turnAround" })
    turnIntentRef.current = null
    setTurnIntent(null)
    setFeedback("Turned around on the road")
    setPosition((current) => {
      if (!current) return current
      const next = { ...current, direction: (current.direction === 1 ? -1 : 1) as 1 | -1 }
      positionRef.current = next
      return next
    })
  }, [])

  const coordinate = useMemo(
    () => graph && position ? getRoadCoordinate(graph, position) ?? start : start,
    [graph, position, start]
  )
  const heading = useMemo(
    () => graph && position ? getRoadHeading(graph, position) : 0,
    [graph, position]
  )
  const distanceToJunction = useMemo(
    () => graph && position ? getDistanceToUpcomingNode(graph, position) : null,
    [graph, position]
  )
  const availableDirections = useMemo(
    () => graph && position ? classifyConnectedEdges(graph, position).map((candidate) => candidate.direction) : [],
    [graph, position]
  )

  return {
    position,
    coordinate,
    heading,
    moving,
    turnIntent,
    feedback,
    distanceToJunction,
    availableDirections,
    setMoving: updateMoving,
    requestTurn,
    turnAround
  }
}
