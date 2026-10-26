"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { haversineDistanceMeters, type LatLng } from "@tiral/game-core"
import {
  chooseBestEdge,
  classifyConnectedEdges,
  findNearestEdge,
  getDistanceToUpcomingNode,
  getRoadCoordinate,
  getRoadHeading,
  getUpcomingNode,
  lateTurn,
  type PassedJunction,
  type RoadDirection,
  type RoadGraph,
  type RoadPosition
} from "@tiral/road-graph"

const WALK_SPEED_METERS_PER_SECOND = 18
/**
 * A junction's turns can be picked once it's this close: at least 28 m, or
 * ~2.5 s of running at the current speed (sprinting covers 28 m in about 1 s).
 */
const TURN_DECISION_DISTANCE_METERS = 28
const TURN_DECISION_SECONDS = 2.5
/** A picked turn lasts this long on the server; it's renewed until the junction is passed. */
const TURN_INTENT_TIMEOUT_MS = 3000
const TURN_INTENT_RENEW_MS = 2000

/** One way on at the next junction, named after its street when it has one. */
export type JunctionOption = { direction: RoadDirection; name: string | null }
const DIRECTION_ORDER: readonly RoadDirection[] = ["left", "straight", "right"]
/**
 * How far the predicted runner may stray from the server's before it's
 * corrected. While moving, the phone legitimately runs ahead of the server by
 * speed × network delay (300–600 ms on 3G), so the tolerance grows with speed.
 */
const RECONCILE_MOVING_METERS = 12
const RECONCILE_MOVING_SECONDS = 0.7
const RECONCILE_STILL_METERS = 3
/** Standing still, a correction this small along the same road glides instead of jumping. */
const GLIDE_MAX_METERS = 20
const GLIDE_MS = 250
/**
 * Running, a correction this small along the same road is blended in over
 * about CATCH_UP_SECONDS (most of it in that time) instead of a jump: after a
 * stalled frame the phone lags the server, and snapping looked like a leap.
 */
const CATCH_UP_MAX_METERS = 60
const CATCH_UP_SECONDS = 0.2
/** Longest frame step, as the server's tick (longer stalls are lost time on both). */
const MAX_STEP_SECONDS = 0.25
/**
 * While walking, the exact position lives in refs and is drawn every frame by
 * whoever reads `live` (the runner's 3D avatar). React state (HUD text, camera,
 * distances) only follows at this rate, not 60–120 times a second.
 */
const PUBLISH_EVERY_MS = 100

/** Where the runner is drawn right now (updated every animation frame). */
export type LiveRunner = { lat: number; lng: number; heading: number }

export type RoadInput =
  | { type: "walk"; on: boolean }
  | { type: "turn"; direction: RoadDirection }
  | { type: "turnAround" }

/** Keys typed into a text box (e.g. the join code) aren't game controls. */
function isTyping(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  return !!target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
}

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
  // Bumped when a picked turn is actually taken at a junction (the bar flashes).
  const [turnLandedAt, setTurnLandedAt] = useState(0)
  const positionRef = useRef<RoadPosition | null>(null)
  const liveRef = useRef<LiveRunner | null>(null)
  const publishedAtRef = useRef(0)
  const movingRef = useRef(false)
  const turnIntentRef = useRef<{ direction: RoadDirection; expiresAt: number } | null>(null)
  /**
   * A turn tapped before its junction was close (or at one without that
   * road): picked once a junction is close, other than the one skipped.
   */
  const queuedRef = useRef<{ direction: RoadDirection; skipNodeId: string | null } | null>(null)
  const [queuedTurn, setQueuedTurn] = useState<RoadDirection | null>(null)
  // The junction just passed, for a turn tapped a moment late (lateTurn).
  const lastJunctionRef = useRef<PassedJunction | null>(null)
  // A small correction from the server, played out over GLIDE_MS while standing.
  const glideRef = useRef<{ from: number; to: RoadPosition; startedAt: number } | null>(null)
  // Running: metres along the road still to add (or take back) to meet the server.
  const catchUpRef = useRef<{ edgeId: string; remaining: number } | null>(null)
  const onInputRef = useRef(onInput)
  onInputRef.current = onInput
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  /** How close a junction must be for its turns to be picked (by distance or by time at this speed). */
  const decisionDistance = useCallback(
    () => Math.max(TURN_DECISION_DISTANCE_METERS, WALK_SPEED_METERS_PER_SECOND * (speedRef?.current ?? 1) * TURN_DECISION_SECONDS),
    [speedRef]
  )

  /** Move the runner: refs always; React state now, or at most every PUBLISH_EVERY_MS. */
  const commit = useCallback(
    (next: RoadPosition | null, publish: "now" | "throttled" = "now") => {
      positionRef.current = next
      if (graph && next) {
        const coordinate = getRoadCoordinate(graph, next)
        liveRef.current = coordinate ? { lat: coordinate.lat, lng: coordinate.lng, heading: getRoadHeading(graph, next) } : null
      } else {
        liveRef.current = null
      }
      const now = performance.now()
      if (publish === "now" || now - publishedAtRef.current >= PUBLISH_EVERY_MS) {
        publishedAtRef.current = now
        setPosition(next)
      }
    },
    [graph]
  )

  // No seed, no avatar: the player stays off-map until they drop a start pin.
  // Crucially this also CLEARS any stale position (previous race, HMR state)
  // so an avatar can never appear before an explicit placement.
  useEffect(() => {
    if (!graph || !start) {
      commit(null)
      return
    }
    const nearest = findNearestEdge(graph, start)
    if (!nearest) return
    const next: RoadPosition = {
      edgeId: nearest.edgeId,
      distanceAlongEdge: nearest.distanceAlongEdge,
      direction: 1
    }
    commit(next)
    setFeedback(nearest.distanceMeters > 20 ? "Snapped to the nearest walkable road" : null)
  }, [graph, start?.lat, start?.lng, commit])

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
    // Stopping: show exactly where the runner stopped (state may lag 100 ms).
    if (!on && positionRef.current) commit(positionRef.current)
    onInputRef.current?.({ type: "walk", on })
  }, [commit])

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
      const deltaSeconds = Math.min((time - previousTime) / 1000, MAX_STEP_SECONDS)
      previousTime = time
      const current = positionRef.current

      const glide = glideRef.current
      if (glide && current) {
        if (movingRef.current || current.edgeId !== glide.to.edgeId) {
          glideRef.current = null
        } else {
          const t = Math.min(1, (time - glide.startedAt) / GLIDE_MS)
          const eased = t * (2 - t)
          commit({ ...glide.to, distanceAlongEdge: glide.from + (glide.to.distanceAlongEdge - glide.from) * eased }, t < 1 ? "throttled" : "now")
          if (t >= 1) glideRef.current = null
        }
      }

      // A turn tapped early becomes the pick once its junction is close.
      const queued = queuedRef.current
      if (
        queued && current &&
        getUpcomingNode(graph, current)?.id !== queued.skipNodeId &&
        getDistanceToUpcomingNode(graph, current) <= decisionDistance()
      ) {
        queuedRef.current = null
        setQueuedTurn(null)
        controlsRef.current.requestTurn(queued.direction)
      }

      // A picked turn stays picked until the junction: renew it (here and on
      // the server) before it expires, e.g. while standing still before the turn.
      const picked = turnIntentRef.current
      if (picked && current && picked.expiresAt - time < TURN_INTENT_TIMEOUT_MS - TURN_INTENT_RENEW_MS) {
        turnIntentRef.current = { direction: picked.direction, expiresAt: time + TURN_INTENT_TIMEOUT_MS }
        onInputRef.current?.({ type: "turn", direction: picked.direction })
      }

      // Stopped: a running catch-up is stale (standing corrections glide instead).
      if (!movingRef.current) catchUpRef.current = null
      if (movingRef.current && current) {
        const edge = graph.edges[current.edgeId]
        if (edge) {
          const speed = WALK_SPEED_METERS_PER_SECOND * (speedRef?.current ?? 1)
          let distance = current.distanceAlongEdge + speed * deltaSeconds * current.direction
          const catchUp = catchUpRef.current
          if (catchUp && catchUp.edgeId === current.edgeId) {
            const step = catchUp.remaining * (1 - Math.exp(-deltaSeconds / CATCH_UP_SECONDS))
            distance += step
            catchUp.remaining -= step
            if (Math.abs(catchUp.remaining) < 0.05) catchUpRef.current = null
          } else if (catchUp) {
            catchUpRef.current = null
          }
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
                lastJunctionRef.current = { nodeId, candidates, chosenEdgeId: chosen.edgeId, intent }
                if (intent && intent !== "straight") setTurnLandedAt(time)
                commit(next)
                setTurnIntent(null)
                turnIntentRef.current = null
                setFeedback(null)
              }
            } else {
              distance = reachedEnd ? edge.lengthMeters : 0
              commit({ ...current, distanceAlongEdge: distance })
              lastJunctionRef.current = null
              setMoving(false)
              movingRef.current = false
              onInputRef.current?.({ type: "walk", on: false })
              setFeedback(intent ? `No ${intent} road here` : "Choose a direction at the junction")
            }
          } else {
            // Same road: refs every frame, React state at most every 100 ms.
            commit({ ...current, distanceAlongEdge: distance }, "throttled")
          }
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enterEdge, graph, commit, decisionDistance])

  // Handlers change with the graph; the listeners are registered once and call
  // the latest ones through this ref (not re-added on every render).
  const controlsRef = useRef({ updateMoving: (_on: boolean) => {}, requestTurn: (_direction: RoadDirection) => {}, turnAround: () => {} })

  useEffect(() => {
    const updateMoving = (on: boolean) => controlsRef.current.updateMoving(on)
    const requestTurn = (direction: RoadDirection) => controlsRef.current.requestTurn(direction)
    const turnAround = () => controlsRef.current.turnAround()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTyping(event)) return
      // Lower-case so Shift (sprint) + W still walks.
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === "w" || key === "ArrowUp") updateMoving(true)
      if (key === "a" || key === "ArrowLeft") requestTurn("left")
      if (key === "d" || key === "ArrowRight") requestTurn("right")
      if (key === "s" || key === "ArrowDown") turnAround()
      if (key === " ") updateMoving(false)
      // A game key while a button still has focus (just clicked "Quick race",
      // a tool...): Space would also press that button. Steering wins: drop the
      // focus, and don't let Space click it. Dialogs keep their focus.
      const GAME_KEYS = ["w", "a", "s", "d", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
      const focused = document.activeElement
      if (GAME_KEYS.includes(key) && focused instanceof HTMLButtonElement && !focused.closest('[role="dialog"], [role="alertdialog"]')) {
        if (key === " ") event.preventDefault()
        focused.blur()
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (isTyping(event)) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === "w" || key === "ArrowUp") updateMoving(false)
    }

    // Switching tabs while holding W never sends the keyup: stop walking, so
    // the server doesn't keep the runner going (and draining energy) unseen.
    const onBlur = () => {
      if (movingRef.current) updateMoving(false)
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [])

  const requestTurn = useCallback((direction: RoadDirection) => {
    if (lockedRef.current) {
      setFeedback("Wait for the race to start")
      return
    }
    const current = positionRef.current
    if (!graph || !current) return
    // Just went straight through a junction? Take the turn there instead (the
    // server does the same, so both agree).
    const late = lateTurn(graph, current, lastJunctionRef.current, direction)
    if (late) {
      lastJunctionRef.current = null
      turnIntentRef.current = null
      setTurnIntent(null)
      commit(late)
      onInputRef.current?.({ type: "turn", direction })
      setFeedback(`${direction[0]!.toUpperCase()}${direction.slice(1)} turn taken`)
      return
    }
    const distance = getDistanceToUpcomingNode(graph, current)
    if (distance > decisionDistance()) {
      // Too early to see the junction's roads: remember it until it's close.
      queuedRef.current = { direction, skipNodeId: null }
      setQueuedTurn(direction)
      setFeedback(`${direction[0]!.toUpperCase()}${direction.slice(1)} at the next junction`)
      return
    }
    const available = classifyConnectedEdges(graph, current)
    if (!available.some((candidate) => candidate.direction === direction)) {
      // Not at this junction: keep it for the one after.
      queuedRef.current = { direction, skipNodeId: getUpcomingNode(graph, current)?.id ?? null }
      setQueuedTurn(direction)
      setFeedback(`No ${direction} here, so ${direction} at the one after`)
      return
    }
    turnIntentRef.current = { direction, expiresAt: performance.now() + TURN_INTENT_TIMEOUT_MS }
    setTurnIntent(direction)
    onInputRef.current?.({ type: "turn", direction })
    setFeedback(`${direction[0]!.toUpperCase()}${direction.slice(1)} turn selected`)
  }, [graph, commit, decisionDistance])

  // Running keeps running the other way (the server does the same).
  const turnAround = useCallback(() => {
    if (lockedRef.current) {
      setFeedback("Wait for the race to start")
      return
    }
    onInputRef.current?.({ type: "turnAround" })
    turnIntentRef.current = null
    queuedRef.current = null
    setQueuedTurn(null)
    lastJunctionRef.current = null
    glideRef.current = null
    catchUpRef.current = null
    setTurnIntent(null)
    setFeedback("Turned around on the road")
    const current = positionRef.current
    if (current) commit({ ...current, direction: (current.direction === 1 ? -1 : 1) as 1 | -1 })
  }, [commit])

  /**
   * The server owns where you really are (it decides arrivals). The runner on
   * screen is predicted locally for responsiveness; when it strays beyond a
   * small tolerance (latency, a turn the server took differently, a start
   * snapped to another road), snap it to the server's position.
   */
  const reconcile = useCallback(
    (server: RoadPosition, serverMoving: boolean) => {
      if (!graph || !graph.edges[server.edgeId]) return
      const serverCoordinate = getRoadCoordinate(graph, server)
      if (!serverCoordinate) return
      const current = positionRef.current
      const clientCoordinate = current ? getRoadCoordinate(graph, current) : null
      const gap = clientCoordinate ? haversineDistanceMeters(clientCoordinate, serverCoordinate) : Infinity
      const sameEdge = current?.edgeId === server.edgeId && current.direction === server.direction
      const moving = movingRef.current || serverMoving
      const speed = WALK_SPEED_METERS_PER_SECOND * (speedRef?.current ?? 1)
      const limit = moving ? Math.max(RECONCILE_MOVING_METERS, speed * RECONCILE_MOVING_SECONDS) : RECONCILE_STILL_METERS
      // Within tolerance is fine, except standing still on a different road
      // (e.g. a start snapped to another street at a junction): adopt the server's.
      if (gap <= limit && (sameEdge || moving)) return
      // Standing still on the same road, a little off (the server stopped a
      // few metres later than the phone): slide there instead of jumping.
      if (!moving && sameEdge && current && gap <= GLIDE_MAX_METERS) {
        glideRef.current = { from: current.distanceAlongEdge, to: server, startedAt: performance.now() }
        return
      }
      // Running on the same road: blend the difference in over the next frames.
      if (moving && movingRef.current && sameEdge && current && gap <= CATCH_UP_MAX_METERS) {
        catchUpRef.current = { edgeId: current.edgeId, remaining: server.distanceAlongEdge - current.distanceAlongEdge }
        return
      }
      glideRef.current = null
      catchUpRef.current = null
      commit(server)
    },
    [graph, commit]
  )

  /** Undo a picked or queued turn (tapping the lit arrow again). */
  const cancelTurn = useCallback(() => {
    queuedRef.current = null
    setQueuedTurn(null)
    turnIntentRef.current = null
    setTurnIntent(null)
    // The server's copy runs out on its own (it's no longer renewed).
    setFeedback(null)
  }, [])

  controlsRef.current = { updateMoving, requestTurn, turnAround }

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
  // The next junction's ways on, once it's close enough to pick one (only the roads that exist).
  const junction = useMemo<JunctionOption[] | null>(() => {
    if (!graph || !position || distanceToJunction === null || distanceToJunction > decisionDistance()) return null
    const candidates = classifyConnectedEdges(graph, position)
    const options = DIRECTION_ORDER.flatMap((direction) => {
      const best = chooseBestEdge(candidates, direction)
      return best ? [{ direction, name: graph.edges[best.edgeId]?.name ?? null }] : []
    })
    return options.length > 0 ? options : null
  }, [graph, position, distanceToJunction, decisionDistance])

  return {
    position,
    coordinate,
    heading,
    moving,
    turnIntent,
    /** A turn tapped before its junction was close (it becomes turnIntent there). */
    queuedTurn,
    feedback,
    distanceToJunction,
    /** The next junction's choices once it's close (null otherwise). */
    junction,
    /** performance.now() of the last turn actually taken (for a flash / vibration). */
    turnLandedAt,
    /** Read every frame to draw the runner smoothly (React state lags up to 100 ms). */
    live: liveRef,
    setMoving: updateMoving,
    requestTurn,
    turnAround,
    cancelTurn,
    reconcile
  }
}
