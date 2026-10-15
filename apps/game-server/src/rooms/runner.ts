// What every room with a player walking the real roads shares: movement on
// the road graph, sprint/energy/health/collapse, and keeping the body in sync
// with the database. Races and hustles both build on this.
import { COLLAPSE_SECONDS, NEED_MAX, STRESS, applySprint, speedMultiplier, type LatLng } from "@tiral/game-core"
import {
  chooseBestEdge,
  classifyConnectedEdges,
  findNearestEdge,
  getRoadCoordinate,
  lateTurn,
  type PassedJunction,
  type RoadDirection,
  type RoadGraph,
  type RoadPosition
} from "@tiral/road-graph"
import { applyNeedsDeltas, loadNeeds } from "@tiral/db"

export const WALK_SPEED_METERS_PER_SECOND = 18
export const TURN_INTENT_TIMEOUT_MS = 3000
/** How often a runner is told their own energy/health. */
export const NEEDS_SYNC_MS = 500
/** How often changed energy/health/stress is written to the DB (one query per room). */
export const NEEDS_FLUSH_MS = 10_000

export type Runner = {
  id: string
  userId: string | null
  roadPosition: RoadPosition | null
  coordinate: LatLng | null
  moving: boolean
  turnIntent: { direction: RoadDirection; expiresAt: number } | null
  /** The junction just passed (for a turn tapped a moment too late). */
  lastJunction?: PassedJunction | null
  // Body: loaded from the DB for signed-in players, saved back as deltas.
  energy: number
  health: number
  sprinting: boolean
  collapsedUntil: number | null
  needsLoaded: boolean
  needsSentAt: number
  /** Changes since the last DB write (written as deltas). */
  pendingEnergy: number
  pendingHealth: number
  pendingStress: number
}

export function freshBody(): Pick<
  Runner,
  | "energy"
  | "health"
  | "sprinting"
  | "collapsedUntil"
  | "needsLoaded"
  | "needsSentAt"
  | "pendingEnergy"
  | "pendingHealth"
  | "pendingStress"
> {
  return {
    energy: NEED_MAX,
    health: NEED_MAX,
    sprinting: false,
    collapsedUntil: null,
    needsLoaded: false,
    needsSentAt: 0,
    pendingEnergy: 0,
    pendingHealth: 0,
    pendingStress: 0
  }
}

/** Snap a point to the nearest road; null if nothing is within `maxMeters`. */
export function snapToRoad(graph: RoadGraph, point: LatLng, maxMeters = Infinity) {
  const nearest = findNearestEdge(graph, point)
  if (!nearest || nearest.distanceMeters > maxMeters) return null
  const roadPosition: RoadPosition = {
    edgeId: nearest.edgeId,
    distanceAlongEdge: nearest.distanceAlongEdge,
    direction: 1
  }
  return { roadPosition, coordinate: getRoadCoordinate(graph, roadPosition) }
}

/** Spend energy outside of sprinting (e.g. carrying a load). */
/**
 * Why this runner can't do work costing `amount` energy, or null if they can.
 * Signed-in runners start at full energy until the DB answers, so wait for it
 * (a player at zero could otherwise work in the first moments of a shift).
 */
export function tiredReason(runner: Runner, amount: number): string | null {
  if (runner.userId && !runner.needsLoaded) return "One moment, checking your energy…"
  if (runner.energy < amount) return "You're too tired. Eat something or rest first."
  return null
}

export function spendEnergy(runner: Runner, amount: number) {
  const next = Math.max(0, runner.energy - amount)
  runner.pendingEnergy += next - runner.energy
  runner.energy = next
}

export type StepOptions = {
  /** Sprint drains this many times faster (carrying a load) or slower (on a bike). */
  sprintDrainFactor?: number
  /** Base speed multiplier (a bike is ~2× walking). */
  speedFactor?: number
}

/**
 * Advance one runner by one tick: sprint drain and collapse, then movement
 * along the road graph with turns at junctions. Returns whether anything a
 * client should see changed.
 */
export function stepRunner(
  graph: RoadGraph,
  runner: Runner,
  now: number,
  deltaSeconds: number,
  options: StepOptions = {}
): { changed: boolean; collapsedNow: boolean } {
  let changed = false
  if (runner.collapsedUntil !== null && now >= runner.collapsedUntil) {
    runner.collapsedUntil = null
    changed = true
  }
  if (!runner.moving || !runner.roadPosition || runner.collapsedUntil !== null) {
    return { changed, collapsedNow: false }
  }
  const sprinting = runner.sprinting
  if (sprinting) {
    const tick = applySprint(runner, deltaSeconds * (options.sprintDrainFactor ?? 1))
    runner.pendingEnergy += tick.energy - runner.energy
    runner.pendingHealth += tick.health - runner.health
    runner.energy = tick.energy
    runner.health = tick.health
    if (tick.collapsed) {
      // Banange! Down for a few seconds, never out.
      runner.collapsedUntil = now + COLLAPSE_SECONDS * 1000
      runner.pendingStress += STRESS.collapse
      return { changed: true, collapsedNow: true }
    }
  }
  const edge = graph.edges[runner.roadPosition.edgeId]
  if (!edge) {
    runner.moving = false
    return { changed: true, collapsedNow: false }
  }

  const distance =
    runner.roadPosition.distanceAlongEdge +
    WALK_SPEED_METERS_PER_SECOND *
      (options.speedFactor ?? 1) *
      speedMultiplier(sprinting, false) *
      deltaSeconds *
      runner.roadPosition.direction
  const reachedEnd = distance > edge.lengthMeters
  const reachedStart = distance < 0

  if (reachedEnd || reachedStart) {
    const nodeId = reachedEnd ? edge.toNodeId : edge.fromNodeId
    const candidates = classifyConnectedEdges(graph, runner.roadPosition)
    const intent = runner.turnIntent && runner.turnIntent.expiresAt > now ? runner.turnIntent.direction : null
    const selected = chooseBestEdge(candidates, intent)
    const fallback = chooseBestEdge(candidates, "straight")
    const chosen = selected ?? (intent ? null : fallback)

    if (chosen) {
      const chosenEdge = graph.edges[chosen.edgeId]!
      const overflow = reachedEnd ? distance - edge.lengthMeters : -distance
      const direction: 1 | -1 = chosenEdge.fromNodeId === nodeId ? 1 : -1
      runner.roadPosition = {
        edgeId: chosen.edgeId,
        distanceAlongEdge:
          direction === 1 ? Math.min(overflow, chosenEdge.lengthMeters) : Math.max(chosenEdge.lengthMeters - overflow, 0),
        direction
      }
      runner.lastJunction = { nodeId, candidates, chosenEdgeId: chosen.edgeId, intent }
      runner.turnIntent = null
      runner.coordinate = getRoadCoordinate(graph, runner.roadPosition)
    } else {
      runner.roadPosition = { ...runner.roadPosition, distanceAlongEdge: reachedEnd ? edge.lengthMeters : 0 }
      runner.moving = false
      runner.turnIntent = null
      runner.lastJunction = null
    }
  } else {
    runner.roadPosition = { ...runner.roadPosition, distanceAlongEdge: distance }
    runner.coordinate = getRoadCoordinate(graph, runner.roadPosition)
  }
  return { changed: true, collapsedNow: false }
}

/** Apply a "turn" request if that turn exists at the next junction. */
export function requestTurn(graph: RoadGraph, runner: Runner, direction: RoadDirection, now: number) {
  if (!runner.roadPosition) return
  if (direction !== "left" && direction !== "right" && direction !== "straight") return
  // Just went straight through a junction? Take the turn there instead.
  const late = lateTurn(graph, runner.roadPosition, runner.lastJunction ?? null, direction)
  if (late) {
    runner.roadPosition = late
    runner.coordinate = getRoadCoordinate(graph, late)
    runner.lastJunction = null
    runner.turnIntent = null
    return
  }
  const available = classifyConnectedEdges(graph, runner.roadPosition)
  if (!available.some((candidate) => candidate.direction === direction)) return
  runner.turnIntent = { direction, expiresAt: now + TURN_INTENT_TIMEOUT_MS }
}

export function turnAround(runner: Runner) {
  if (!runner.roadPosition) return
  runner.moving = false
  runner.turnIntent = null
  runner.lastJunction = null
  runner.roadPosition = {
    ...runner.roadPosition,
    direction: runner.roadPosition.direction === 1 ? -1 : 1
  }
}

/**
 * Keeps runners' bodies in sync with the database: loads them on join,
 * writes changes as deltas (one query per batch), and tells each runner
 * their own numbers.
 */
export class BodySync {
  constructor(private readonly deliver: (runner: Runner, message: string, payload: unknown) => void) {}

  async load(runner: Runner, isCurrent: () => boolean) {
    if (!runner.userId) return
    try {
      const needs = await loadNeeds(runner.userId)
      if (!isCurrent()) return
      runner.energy = needs.energy
      runner.health = needs.health
      runner.needsLoaded = true
      this.send(runner, Date.now())
      // Running wakes you: a zero-change write clears resting_since.
      if (needs.resting) void this.flush([runner], true)
    } catch (error) {
      console.error("Failed to load needs:", error)
    }
  }

  /**
   * Write changes as deltas and adopt the DB's answer (which includes regen
   * and any food bought meanwhile). Only changed runners unless `force`.
   */
  async flush(runners: Runner[], force = false) {
    // Only persist what we actually loaded, so a DB hiccup can't reset anyone.
    const batch = runners.filter(
      (runner) =>
        runner.userId &&
        runner.needsLoaded &&
        (force || runner.pendingEnergy !== 0 || runner.pendingHealth !== 0 || runner.pendingStress !== 0)
    )
    if (batch.length === 0) return
    const sent = batch.map((runner) => {
      const delta = {
        userId: runner.userId!,
        energy: runner.pendingEnergy,
        health: runner.pendingHealth,
        stress: runner.pendingStress
      }
      runner.pendingEnergy = 0
      runner.pendingHealth = 0
      runner.pendingStress = 0
      return { runner, delta }
    })
    try {
      const fresh = await applyNeedsDeltas(sent.map((entry) => entry.delta))
      const now = Date.now()
      for (const { runner } of sent) {
        const next = fresh.get(runner.userId!)
        if (!next) continue
        // Keep whatever changed while the query was in flight.
        runner.energy = Math.max(0, Math.min(NEED_MAX, next.energy + runner.pendingEnergy))
        runner.health = Math.max(0, Math.min(NEED_MAX, next.health + runner.pendingHealth))
        this.send(runner, now)
      }
    } catch (error) {
      for (const { runner, delta } of sent) {
        runner.pendingEnergy += delta.energy
        runner.pendingHealth += delta.health
        runner.pendingStress += delta.stress
      }
      console.error("Failed to flush needs:", error)
    }
  }

  send(runner: Runner, now: number) {
    runner.needsSentAt = now
    this.deliver(runner, "needs", {
      energy: Math.round(runner.energy * 10) / 10,
      health: Math.round(runner.health * 10) / 10,
      collapsedForMs: runner.collapsedUntil === null ? 0 : Math.max(0, runner.collapsedUntil - now)
    })
  }

  /** Send to anyone whose numbers are due a refresh. */
  sendDue(runners: Runner[], now: number) {
    for (const runner of runners) {
      if (now - runner.needsSentAt >= NEEDS_SYNC_MS) this.send(runner, now)
    }
  }
}

/**
 * Per-client message throttle for handlers that hit the database or broadcast
 * to the whole room. Returns false if `key` (e.g. "<sessionId>:refreshNeeds")
 * was allowed less than `ms` ago.
 */
export class MessageThrottle {
  private readonly last = new Map<string, number>()

  allow(sessionId: string, message: string, ms: number, now = Date.now()): boolean {
    const key = `${sessionId}:${message}`
    if (now - (this.last.get(key) ?? 0) < ms) return false
    this.last.set(key, now)
    return true
  }

  /** Forget a client that left. */
  forget(sessionId: string) {
    for (const key of this.last.keys()) if (key.startsWith(`${sessionId}:`)) this.last.delete(key)
  }
}

/** Messages a client may send per second before Colyseus drops it (floods only). */
export const MAX_MESSAGES_PER_SECOND = { race: 30, hustle: 30, stall: 60 } as const
/** Minimum gap between needs refreshes (each one writes to the database). */
export const REFRESH_NEEDS_MS = 2_000
/** Minimum gap between start-pin placements (each one scans the road graph and broadcasts). */
export const PLACE_START_MS = 300

/**
 * Wrap a timer callback so an error (or a rejected promise) in one room is
 * logged and skipped instead of crashing the whole game server.
 */
export function guarded(label: string, run: () => unknown): () => void {
  return () => {
    try {
      const result = run()
      if (result instanceof Promise) result.catch((error) => console.error(`[${label}] failed:`, error))
    } catch (error) {
      console.error(`[${label}] failed:`, error)
    }
  }
}
