import { Room, Client, ServerError } from "@colyseus/core"
import { KAMPALA_ZONE, STRESS, chooseBounty, distinctRacers, haversineDistanceMeters } from "@tiral/game-core"
import {
  findNearestEdge,
  getRoadCoordinate,
  isEdgeReachable,
  type RoadDirection,
  type RoadGraph,
  type RoadPosition
} from "@tiral/road-graph"
import { loadRoadGraph } from "../roads.js"
import { verifyJoinToken, type JoinIdentity } from "../auth.js"
import { sanitizeLoadout, type AvatarLoadout } from "@tiral/avatars"
import { randomUUID } from "node:crypto"
import { awardRaceEarnings, recordRaceResults } from "@tiral/db"
import { withRetry } from "../retry.js"
import { configNumber } from "../testOverrides.js"
import {
  BodySync,
  MAX_MESSAGES_PER_SECOND,
  MessageThrottle,
  NEEDS_FLUSH_MS,
  guarded,
  PLACE_START_MS,
  REFRESH_NEEDS_MS,
  freshBody,
  requestTurn,
  stepRunner,
  turnAround,
  type Runner
} from "./runner.js"

const TICK_MS = 100
const COUNTDOWN_SECONDS = configNumber("RACE_COUNTDOWN_SECONDS", 20, 1)
const ARRIVAL_RADIUS_METERS = configNumber("RACE_ARRIVAL_RADIUS", 25, 1)
const FINISH_WINDOW_MS = 30_000
/** A race nobody can finish (lost bounty, everyone idle) ends after this. */
const MAX_RACE_MS = configNumber("RACE_MAX_MINUTES", 15, 1) * 60_000

type PlayerInfo = Runner & {
  name: string
  loadout: AvatarLoadout
  startPointId: string | null
  startAt: { lat: number; lng: number } | null
  /** Chose a start themselves (everyone else gets the default one at the gun). */
  pickedStart: boolean
  finishPosition: number | null
  connected: boolean
}

const RECONNECT_SECONDS = 30

const MAX_START_SNAP_METERS = 500

const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const usedRoomCodes = new Set<string>()

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = ""
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]!
    }
    if (!usedRoomCodes.has(code)) {
      usedRoomCodes.add(code)
      return code
    }
  }
  return Math.random().toString(36).slice(2, 6).toUpperCase()
}

type BountyTarget = {
  destinationId: string
  edgeId: string
  distanceAlongEdge: number
  coordinate: { lat: number; lng: number }
}

export class RaceRoom extends Room {
  maxClients = 10
  // A flooding client is dropped; real play sends a handful per second.
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND.race
  private readonly throttle = new MessageThrottle()

  private phase: "lobby" | "countdown" | "racing" | "finished" = "lobby"
  private countdownSeconds = COUNTDOWN_SECONDS
  private countdownInterval: ReturnType<typeof setInterval> | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private needsFlushInterval: ReturnType<typeof setInterval> | null = null
  private players: Record<string, PlayerInfo> = {}
  private startedAt: number | null = null
  private destinationId: string | null = null
  private bounty: BountyTarget | null = null
  private finishOrder: string[] = []
  private finishDeadline: number | null = null
  private roadGraph: RoadGraph | null = null
  private roomCode = ""
  private lastTickAt: number | null = null
  private readonly body = new BodySync((runner, message, payload) => {
    this.clients.find((candidate) => candidate.sessionId === runner.id)?.send(message, payload)
  })

  // Only signed-in players (TikTok or guest account) race; the web app asks
  // first, and this stops anyone skipping that step.
  static async onAuth(token: unknown) {
    const identity = await verifyJoinToken(token)
    if (identity.guest) throw new ServerError(401, "Sign in to race")
    return identity
  }

  onCreate(_options: any) {
    this.roomCode = generateRoomCode()
    this.syncMetadata()
    this.onMessage("selectStart", (client, startPointId: string) => {
      if (this.phase !== "lobby" && this.phase !== "countdown") return
      if (!this.throttle.allow(client.sessionId, "start", PLACE_START_MS)) return
      const player = this.players[client.sessionId]
      if (!player || !this.roadGraph) return
      const start = KAMPALA_ZONE.startPoints.find((point) => point.id === startPointId)
      if (!start) return
      const nearest = findNearestEdge(this.roadGraph, start.position)
      if (!nearest) return
      player.startPointId = start.id
      player.pickedStart = true
      player.roadPosition = {
        edgeId: nearest.edgeId,
        distanceAlongEdge: nearest.distanceAlongEdge,
        direction: 1
      }
      player.coordinate = getRoadCoordinate(this.roadGraph, player.roadPosition)
      player.moving = false
      player.turnIntent = null
      this.sendRoomState()
    })

    // Tap-to-place start: player drops a pin anywhere in the zone,
    // server snaps it to the nearest walkable road.
    this.onMessage("placeStart", (client, point: { lat: number; lng: number }) => {
      if (this.phase !== "lobby" && this.phase !== "countdown") return
      if (!this.throttle.allow(client.sessionId, "start", PLACE_START_MS)) return
      const player = this.players[client.sessionId]
      if (!player || !this.roadGraph) return
      const lat = Number(point?.lat)
      const lng = Number(point?.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      const bounds = KAMPALA_ZONE.bounds
      if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) {
        return
      }
      const nearest = findNearestEdge(this.roadGraph, { lat, lng })
      if (!nearest || nearest.distanceMeters > MAX_START_SNAP_METERS) return
      player.startPointId = null
      player.roadPosition = {
        edgeId: nearest.edgeId,
        distanceAlongEdge: nearest.distanceAlongEdge,
        direction: 1
      }
      player.coordinate = getRoadCoordinate(this.roadGraph, player.roadPosition)
      player.startAt = player.coordinate ? { ...player.coordinate } : null
      player.pickedStart = true
      player.moving = false
      player.turnIntent = null
      this.sendRoomState()
    })

    this.onMessage("walk", (client, on: boolean) => {
      const player = this.players[client.sessionId]
      if (!player || this.phase !== "racing" || player.finishPosition !== null) return
      player.moving = on === true
    })

    this.onMessage("sprint", (client, on: boolean) => {
      const player = this.players[client.sessionId]
      if (!player || player.finishPosition !== null) return
      player.sprinting = on === true
    })

    this.onMessage("turn", (client, direction: RoadDirection) => {
      const player = this.players[client.sessionId]
      if (!player || !this.roadGraph || this.phase !== "racing" || player.finishPosition !== null) return
      requestTurn(this.roadGraph, player, direction, Date.now())
    })

    this.onMessage("turnAround", (client) => {
      const player = this.players[client.sessionId]
      if (!player || !player.roadPosition || this.phase !== "racing" || player.finishPosition !== null) return
      turnAround(player)
      this.sendRoomState()
    })

    this.onMessage("playAgain", () => {
      if (this.phase !== "finished") return
      this.resetToLobby()
    })

    this.onMessage("startNow", (client) => {
      if (this.phase !== "lobby") return
      if (!this.players[client.sessionId]) return
      if (Object.keys(this.players).length < 1) return
      this.beginCountdown()
    })

    loadRoadGraph()
      .then((graph) => {
        this.roadGraph = graph
        this.snapUnplacedPlayers()
        this.sendRoomState()
      })
      .catch((error) => {
        console.error("Failed to load road graph:", error)
      })

    this.tickInterval = setInterval(guarded("race tick", () => this.tickMovement()), TICK_MS)
    this.needsFlushInterval = setInterval(guarded("race needs flush", () => this.body.flush(Object.values(this.players))), NEEDS_FLUSH_MS)

    // Food bought on the profile while still connected: pull fresh values now.
    this.onMessage("refreshNeeds", (client) => {
      const player = this.players[client.sessionId]
      if (player && this.throttle.allow(client.sessionId, "refreshNeeds", REFRESH_NEEDS_MS)) void this.body.flush([player], true)
    })
  }

  /** An error in a message handler or room method: log it, keep the room (and server) alive. */
  onUncaughtException(error: unknown, methodName: string) {
    console.error(`[race ${this.roomId}] ${methodName} failed:`, error)
  }

  onJoin(client: Client, options: any, auth?: JoinIdentity) {
    if (this.phase === "finished") {
      this.resetToLobby()
    }
    const existing = this.players[client.sessionId]
    if (existing) {
      existing.connected = true
      existing.loadout = sanitizeLoadout(options?.loadout)
    } else {
      const verified = auth && !auth.guest ? auth : null
      // One racer per account: a second tab would count as a second person
      // (more pay, podium spots) and can't be told apart on the map.
      const twin = verified ? Object.values(this.players).find((player) => player.userId === verified.userId) : undefined
      if (twin?.connected) throw new ServerError(409, "You're already in this race in another tab")
      // A tab that dropped (closed, lost signal) hands its seat to this one.
      if (twin) {
        void this.body.flush([twin])
        delete this.players[twin.id]
      }
      const name =
        verified?.displayName && verified.displayName.length > 0
          ? verified.displayName
          : `Player ${Object.keys(this.players).length + 1}`
      this.players[client.sessionId] = {
        id: client.sessionId,
        name,
        userId: verified ? verified.userId : null,
        loadout: sanitizeLoadout(options?.loadout),
        startPointId: null,
        startAt: null,
        roadPosition: null,
        coordinate: null,
        moving: false,
        turnIntent: null,
        pickedStart: false,
        finishPosition: null,
        connected: true,
        ...freshBody()
      }
      const joined = this.players[client.sessionId]!
      void this.body.load(joined, () => this.players[client.sessionId] === joined)
    }
    // No auto-placement: the player stays off-map until they drop a start pin.
    this.sendRoomState()
    this.syncMetadata()

    if (Object.keys(this.players).length >= 2 && this.phase === "lobby") {
      this.beginCountdown()
    }
  }

  async onDrop(client: Client) {
    const player = this.players[client.sessionId]
    if (!player) return
    player.connected = false
    player.moving = false
    this.sendRoomState()
    this.syncMetadata()
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS)
      const rejoined = this.players[client.sessionId]
      if (rejoined) {
        rejoined.connected = true
        this.sendRoomState()
        this.syncMetadata()
      }
    } catch {
      const gone = this.players[client.sessionId]
      if (gone) void this.body.flush([gone])
      delete this.players[client.sessionId]
      this.sendRoomState()
      this.syncMetadata()
    }
  }

  onLeave(client: Client) {
    this.throttle.forget(client.sessionId)
    const leaving = this.players[client.sessionId]
    if (leaving) void this.body.flush([leaving])
    delete this.players[client.sessionId]
    const remaining = Object.keys(this.players).length
    if (remaining === 0) {
      this.stopCountdown()
    } else if (this.phase === "countdown" && remaining < 2) {
      this.stopCountdown()
      this.phase = "lobby"
      this.countdownSeconds = COUNTDOWN_SECONDS
    }
    this.sendRoomState()
    this.syncMetadata()
  }

  onDispose() {
    usedRoomCodes.delete(this.roomCode)
    this.stopCountdown()
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
    if (this.needsFlushInterval) {
      clearInterval(this.needsFlushInterval)
      this.needsFlushInterval = null
    }
    void this.body.flush(Object.values(this.players))
  }

  private syncMetadata() {
    this.setMetadata({
      roomCode: this.roomCode,
      phase: this.phase,
      playerCount: Object.keys(this.players).length,
      maxClients: this.maxClients,
      countdownSeconds: this.phase === "countdown" ? this.countdownSeconds : null
    })
  }

  private snapPlayer(sessionId: string) {
    if (!this.roadGraph) return
    const player = this.players[sessionId]
    if (!player || player.roadPosition) return
    // Previously pinned spot wins, then legacy preset starts, then default.
    const start =
      player.startAt ??
      KAMPALA_ZONE.startPoints.find((point) => point.id === player.startPointId)?.position ??
      KAMPALA_ZONE.startPoints[0]!.position
    const nearest = findNearestEdge(this.roadGraph, start)
    if (!nearest) return
    player.roadPosition = {
      edgeId: nearest.edgeId,
      distanceAlongEdge: nearest.distanceAlongEdge,
      direction: 1
    }
    player.coordinate = getRoadCoordinate(this.roadGraph, player.roadPosition)
    if (player.coordinate) player.startAt = { ...player.coordinate }
  }

  private snapUnplacedPlayers() {
    for (const sessionId of Object.keys(this.players)) {
      this.snapPlayer(sessionId)
    }
  }

  private tickMovement() {
    if (!this.roadGraph || this.phase !== "racing") {
      this.lastTickAt = null
      return
    }
    const now = Date.now()
    // Real elapsed time, not the nominal tick: timers fire late, and a fixed
    // step would leave the server's runners behind what players see.
    const deltaSeconds = Math.min(0.25, (now - (this.lastTickAt ?? now - TICK_MS)) / 1000)
    this.lastTickAt = now
    let changed = false
    let arrived = false

    for (const player of Object.values(this.players)) {
      if (player.coordinate && !this.finishOrder.includes(player.id)) {
        if (this.hasReachedBounty(player.coordinate)) {
          this.finishOrder.push(player.id)
          player.finishPosition = this.finishOrder.length
          player.moving = false
          player.turnIntent = null
          arrived = true
          if (this.finishOrder.length === 1) {
            this.finishDeadline = now + FINISH_WINDOW_MS
          }
          continue
        }
      }
      // Finished runners stay at the treasure.
      if (player.finishPosition !== null) continue
      const step = stepRunner(this.roadGraph, player, now, deltaSeconds)
      if (step.changed) changed = true
      if (step.collapsedNow) this.body.send(player, now)
    }

    this.body.sendDue(Object.values(this.players), now)

    if (changed || arrived) {
      this.broadcast("positions", this.getPositions())
    }
    if (arrived) {
      this.sendRoomState()
    }

    const racers = Object.values(this.players).filter((player) => player.roadPosition)
    const allFinished = racers.length > 0 && racers.every((player) => player.finishPosition !== null)
    if (this.finishOrder.length > 0 && (allFinished || (this.finishDeadline !== null && now >= this.finishDeadline))) {
      this.finishRace()
    } else if (this.startedAt !== null && now - this.startedAt >= MAX_RACE_MS) {
      // Time's up: whoever arrived keeps their place; nobody else is ranked.
      this.finishRace()
    }
  }

  private hasReachedBounty(coordinate: { lat: number; lng: number }) {
    if (!this.bounty) return false
    return haversineDistanceMeters(coordinate, this.bounty.coordinate) <= ARRIVAL_RADIUS_METERS
  }

  private finishRace() {
    this.phase = "finished"
    this.finishDeadline = null
    this.syncMetadata()
    for (const player of Object.values(this.players)) {
      player.moving = false
      player.turnIntent = null
      player.sprinting = false
      player.collapsedUntil = null
      this.body.send(player, Date.now())
    }
    const finishedAt = new Date()
    // Winning a real race (someone to beat) takes the edge off.
    const winner = this.players[this.finishOrder[0] ?? ""]
    const field = this.fieldSize()
    if (winner && field >= 2) winner.pendingStress += STRESS.raceWin
    void this.body.flush(Object.values(this.players))
    this.sendRoomState()
    this.broadcast(
      "raceFinished",
      this.finishOrder.map((sessionId, index) => ({
        sessionId,
        name: this.players[sessionId]?.name ?? "Player",
        position: index + 1
      }))
    )
    // Everyone who actually raced (had a start), finished or not.
    const fieldSize = this.fieldSize()
    void this.persistResults(finishedAt, fieldSize)
  }

  private async persistResults(finishedAt: Date, fieldSize: number) {
    // A race that timed out with nobody at the treasure has nothing to record.
    if (!this.destinationId || !this.startedAt || this.finishOrder.length === 0) return
    const placements = this.finishOrder.map((sessionId, index) => ({
      sessionId,
      userId: this.players[sessionId]?.userId ?? null,
      position: index + 1
    }))
    let raceId: string
    try {
      // Captured once: the room may reset while a retry waits.
      const input = {
        raceId: randomUUID(),
        roomCode: this.roomCode,
        destinationId: this.destinationId,
        startedAt: new Date(this.startedAt),
        finishedAt,
        playerCount: Object.keys(this.players).length,
        placements: placements.map(({ userId, position }) => ({ userId, position, finishedAt }))
      }
      raceId = await withRetry("Race results", () => recordRaceResults(input))
    } catch (error) {
      console.error("Failed to persist race results:", error)
      return
    }
    // Coins are paid separately so a ledger problem never loses the results.
    try {
      const payouts = await withRetry("Race earnings", () => awardRaceEarnings({ raceId, finishedAt, fieldSize, placements }))
      for (const payout of payouts) {
        const sessionId = placements.find((placement) => placement.userId === payout.userId)?.sessionId
        const client = this.clients.find((candidate) => candidate.sessionId === sessionId)
        client?.send("earnings", { earnings: payout.earnings, position: payout.position })
      }
    } catch (error) {
      console.error("Failed to award race earnings:", error)
    }
  }

  private resetToLobby() {
    this.stopCountdown()
    this.unlock()
    this.phase = "lobby"
    this.countdownSeconds = COUNTDOWN_SECONDS
    this.startedAt = null
    this.destinationId = null
    this.bounty = null
    this.finishOrder = []
    this.finishDeadline = null
    for (const player of Object.values(this.players)) {
      player.roadPosition = null
      player.coordinate = null
      player.moving = false
      player.turnIntent = null
      player.finishPosition = null
    }
    this.snapUnplacedPlayers()
    this.sendRoomState()
    this.syncMetadata()

    if (Object.keys(this.players).length >= 2) {
      this.beginCountdown()
    }
  }

  private getPositions() {
    const positions: Record<
      string,
      {
        roadPosition: RoadPosition | null
        coordinate: { lat: number; lng: number } | null
        moving: boolean
        sprinting: boolean
        collapsed: boolean
        loadout: AvatarLoadout
      }
    > = {}
    for (const [sessionId, player] of Object.entries(this.players)) {
      positions[sessionId] = {
        roadPosition: player.roadPosition,
        coordinate: player.coordinate,
        moving: player.moving && player.collapsedUntil === null,
        sprinting: player.sprinting && player.moving,
        collapsed: player.collapsedUntil !== null,
        loadout: player.loadout
      }
    }
    return positions
  }

  /**
   * The room as `viewer` may see it. Before the race, rivals' starts stay
   * secret: seeing them would let the last player to pick sit in the middle
   * of everyone, or drop a pin to push the treasure (never placed near any
   * start) away from a rival. Each player only learns whether the others have
   * picked (`hasStart`); all starts are revealed when the race begins.
   */
  private getRoomState(viewer: string | null = null) {
    const secret = this.phase === "lobby" || this.phase === "countdown"
    const players: Record<string, PlayerInfo & { hasStart: boolean }> = {}
    for (const [id, player] of Object.entries(this.players)) {
      const hasStart = player.pickedStart
      players[id] =
        secret && id !== viewer
          ? { ...player, startAt: null, startPointId: null, coordinate: null, roadPosition: null, hasStart }
          : { ...player, hasStart }
    }
    return {
      phase: this.phase,
      countdownSeconds: this.countdownSeconds,
      destinationId: this.destinationId,
      startedAt: this.startedAt,
      roomCode: this.roomCode,
      players
    }
  }

  /** Room state to everyone: each player's own view before the race, one shared view after. */
  private sendRoomState() {
    if (this.phase === "lobby" || this.phase === "countdown") {
      for (const client of this.clients) client.send("roomState", this.getRoomState(client.sessionId))
    } else {
      this.broadcast("roomState", this.getRoomState())
    }
  }

  private beginCountdown() {
    this.phase = "countdown"
    this.sendRoomState()
    this.syncMetadata()

    let remaining = COUNTDOWN_SECONDS
    this.countdownSeconds = remaining
    this.countdownInterval = setInterval(guarded("race countdown", () => {
      remaining--
      this.countdownSeconds = remaining
      this.broadcast("countdownTick", remaining)
      if (remaining <= 0) {
        this.stopCountdown()
        this.launchRace()
      }
    }), 1000)
  }

  /** People racing (with a start): one account in several tabs counts once. */
  private fieldSize() {
    return distinctRacers(
      Object.values(this.players)
        .filter((player) => player.roadPosition)
        .map((player) => player.userId)
    )
  }

  private launchRace() {
    this.phase = "racing"
    // Anyone who never dropped a pin gets the default start so they can race.
    this.snapUnplacedPlayers()
    this.lock()
    this.startedAt = Date.now()
    this.finishOrder = []
    this.finishDeadline = null
    const options = [...KAMPALA_ZONE.bountyLocations].sort(() => Math.random() - 0.5)
    const fallback = options[0]!
    this.destinationId = fallback.id
    this.bounty = null
    if (this.roadGraph) {
      const referenceEdges = Object.values(this.players)
        .map((player) => player.roadPosition?.edgeId)
        .filter((edgeId): edgeId is string => edgeId !== undefined && edgeId !== null)
      // Every reachable spot, with how close the nearest racer starts to it.
      const starts = Object.values(this.players)
        .map((player) => player.coordinate)
        .filter((coordinate): coordinate is NonNullable<typeof coordinate> => coordinate !== null)
      const candidates: Array<{ item: { pick: (typeof options)[number]; edgeId: string; distanceAlongEdge: number }; nearestStartMeters: number }> = []
      for (const pick of options) {
        const nearest = findNearestEdge(this.roadGraph, pick.position)
        if (!nearest) continue
        const reachable =
          referenceEdges.length === 0 ||
          referenceEdges.every((edgeId) => isEdgeReachable(this.roadGraph!, edgeId, nearest.edgeId))
        if (!reachable) continue
        candidates.push({
          item: { pick, edgeId: nearest.edgeId, distanceAlongEdge: nearest.distanceAlongEdge },
          nearestStartMeters: starts.length ? Math.min(...starts.map((start) => haversineDistanceMeters(start, pick.position))) : Infinity
        })
      }
      // Never a finish someone is already standing on.
      const chosen = chooseBounty(candidates, Math.random())
      if (chosen) {
        this.destinationId = chosen.pick.id
        this.bounty = {
          destinationId: chosen.pick.id,
          edgeId: chosen.edgeId,
          distanceAlongEdge: chosen.distanceAlongEdge,
          coordinate: getRoadCoordinate(this.roadGraph, {
            edgeId: chosen.edgeId,
            distanceAlongEdge: chosen.distanceAlongEdge,
            direction: 1
          }) ?? chosen.pick.position
        }
      }
      if (!this.bounty) {
        const nearest = findNearestEdge(this.roadGraph, fallback.position)
        if (nearest) {
          this.bounty = {
            destinationId: fallback.id,
            edgeId: nearest.edgeId,
            distanceAlongEdge: nearest.distanceAlongEdge,
            coordinate: getRoadCoordinate(this.roadGraph, {
              edgeId: nearest.edgeId,
              distanceAlongEdge: nearest.distanceAlongEdge,
              direction: 1
            }) ?? fallback.position
          }
        }
      }
    }
    for (const player of Object.values(this.players)) {
      player.moving = false
      player.turnIntent = null
      player.finishPosition = null
    }
    this.sendRoomState()
    this.syncMetadata()
  }

  private stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
      this.countdownInterval = null
    }
  }
}
