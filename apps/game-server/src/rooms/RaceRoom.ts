import { Room, Client } from "@colyseus/core"
import {
  COLLAPSE_SECONDS,
  GIG_MAX_METERS,
  GIG_MIN_METERS,
  GIG_TIME_LIMIT_SECONDS,
  KAMPALA_ZONE,
  NEED_MAX,
  STRESS,
  applySprint,
  haversineDistanceMeters,
  speedMultiplier
} from "@tiral/game-core"
import {
  chooseBestEdge,
  classifyConnectedEdges,
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
import { applyNeedsDeltas, awardRaceEarnings, loadNeeds, payGig, recordRaceResults } from "@tiral/db"

const WALK_SPEED_METERS_PER_SECOND = 18
const TURN_INTENT_TIMEOUT_MS = 3000
const TICK_MS = 100
const COUNTDOWN_SECONDS = Number(process.env.RACE_COUNTDOWN_SECONDS ?? 20)
const ARRIVAL_RADIUS_METERS = Number(process.env.RACE_ARRIVAL_RADIUS ?? 25)
const FINISH_WINDOW_MS = 30_000
/** Boda gigs skip the lobby wait: a short "ready, go". */
const GIG_COUNTDOWN_SECONDS = 3
/** How often each racer is told their own energy/health. */
const NEEDS_SYNC_MS = 500
/** How often changed energy/health is written to the DB (one query per room). */
const NEEDS_FLUSH_MS = 10_000

type PlayerInfo = {
  id: string
  name: string
  userId: string | null
  loadout: AvatarLoadout
  startPointId: string | null
  startAt: { lat: number; lng: number } | null
  roadPosition: RoadPosition | null
  coordinate: { lat: number; lng: number } | null
  moving: boolean
  turnIntent: { direction: RoadDirection; expiresAt: number } | null
  finishPosition: number | null
  connected: boolean
  // Body: loaded from the DB for signed-in players, saved back after the race.
  energy: number
  health: number
  sprinting: boolean
  collapsedUntil: number | null
  needsLoaded: boolean
  needsSentAt: number
  /** Energy/health change since the last DB write (written as a delta). */
  pendingEnergy: number
  pendingHealth: number
  pendingStress: number
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

export type GigResult =
  | { delivered: true; paid: true; gross: number; cut: number; net: number; meters: number }
  | { delivered: true; paid: false; reason: "guest" | "daily_limit" | "duplicate" | "error"; meters: number }
  | { delivered: false; paid: false; reason: "late"; meters: number }

type BountyTarget = {
  destinationId: string
  edgeId: string
  distanceAlongEdge: number
  coordinate: { lat: number; lng: number }
}

export class RaceRoom extends Room {
  maxClients = 10

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
  /** "gig": a solo boda delivery against the clock instead of a race. */
  private mode: "race" | "gig" = "race"
  private gigDeadline: number | null = null
  private gigMeters = 0

  static async onAuth(token: unknown) {
    return verifyJoinToken(token)
  }

  onCreate(options: any) {
    if (options?.mode === "gig") {
      this.mode = "gig"
      this.maxClients = 1
    }
    this.roomCode = generateRoomCode()
    this.syncMetadata()
    this.onMessage("selectStart", (client, startPointId: string) => {
      if (this.phase !== "lobby" && this.phase !== "countdown") return
      const player = this.players[client.sessionId]
      if (!player || !this.roadGraph) return
      const start = KAMPALA_ZONE.startPoints.find((point) => point.id === startPointId)
      if (!start) return
      const nearest = findNearestEdge(this.roadGraph, start.position)
      if (!nearest) return
      player.startPointId = start.id
      player.roadPosition = {
        edgeId: nearest.edgeId,
        distanceAlongEdge: nearest.distanceAlongEdge,
        direction: 1
      }
      player.coordinate = getRoadCoordinate(this.roadGraph, player.roadPosition)
      player.moving = false
      player.turnIntent = null
      this.broadcast("roomState", this.getRoomState())
    })

    // Tap-to-place start: player drops a pin anywhere in the zone,
    // server snaps it to the nearest walkable road.
    this.onMessage("placeStart", (client, point: { lat: number; lng: number }) => {
      if (this.phase !== "lobby" && this.phase !== "countdown") return
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
      player.moving = false
      player.turnIntent = null
      this.broadcast("roomState", this.getRoomState())
    })

    this.onMessage("walk", (client, on: boolean) => {
      const player = this.players[client.sessionId]
      if (!player || this.phase !== "racing") return
      player.moving = on === true
    })

    this.onMessage("sprint", (client, on: boolean) => {
      const player = this.players[client.sessionId]
      if (!player) return
      player.sprinting = on === true
    })

    this.onMessage("turn", (client, direction: RoadDirection) => {
      const player = this.players[client.sessionId]
      if (!player || !this.roadGraph || !player.roadPosition) return
      if (this.phase !== "racing") return
      if (direction !== "left" && direction !== "right" && direction !== "straight") return
      const available = classifyConnectedEdges(this.roadGraph, player.roadPosition)
      if (!available.some((candidate) => candidate.direction === direction)) return
      player.turnIntent = { direction, expiresAt: Date.now() + TURN_INTENT_TIMEOUT_MS }
    })

    this.onMessage("turnAround", (client) => {
      const player = this.players[client.sessionId]
      if (!player || !player.roadPosition) return
      if (this.phase !== "racing") return
      player.moving = false
      player.turnIntent = null
      player.roadPosition = {
        ...player.roadPosition,
        direction: player.roadPosition.direction === 1 ? -1 : 1
      }
      this.broadcast("roomState", this.getRoomState())
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
        this.broadcast("roomState", this.getRoomState())
      })
      .catch((error) => {
        console.error("Failed to load road graph:", error)
      })

    this.tickInterval = setInterval(() => this.tickMovement(), TICK_MS)
    this.needsFlushInterval = setInterval(() => void this.flushNeeds(Object.values(this.players)), NEEDS_FLUSH_MS)

    // Food bought on the profile while still connected: pull fresh values now.
    this.onMessage("refreshNeeds", (client) => {
      const player = this.players[client.sessionId]
      if (player) void this.flushNeeds([player], true)
    })
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
        finishPosition: null,
        connected: true,
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
      void this.loadPlayerNeeds(client.sessionId)
    }
    // No auto-placement: the player stays off-map until they drop a start pin.
    this.broadcast("roomState", this.getRoomState())
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
    this.broadcast("roomState", this.getRoomState())
    this.syncMetadata()
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS)
      const rejoined = this.players[client.sessionId]
      if (rejoined) {
        rejoined.connected = true
        this.broadcast("roomState", this.getRoomState())
        this.syncMetadata()
      }
    } catch {
      const gone = this.players[client.sessionId]
      if (gone) void this.flushNeeds([gone])
      delete this.players[client.sessionId]
      this.broadcast("roomState", this.getRoomState())
      this.syncMetadata()
    }
  }

  onLeave(client: Client) {
    const leaving = this.players[client.sessionId]
    if (leaving) void this.flushNeeds([leaving])
    delete this.players[client.sessionId]
    const remaining = Object.keys(this.players).length
    if (remaining === 0) {
      this.stopCountdown()
    } else if (this.phase === "countdown" && remaining < 2) {
      this.stopCountdown()
      this.phase = "lobby"
      this.countdownSeconds = COUNTDOWN_SECONDS
    }
    this.broadcast("roomState", this.getRoomState())
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
    void this.flushNeeds(Object.values(this.players))
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
    if (!this.roadGraph || this.phase !== "racing") return
    const now = Date.now()
    const deltaSeconds = TICK_MS / 1000
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
      if (player.collapsedUntil !== null && now >= player.collapsedUntil) {
        player.collapsedUntil = null
        changed = true
      }
      const collapsed = player.collapsedUntil !== null
      if (!player.moving || !player.roadPosition || collapsed) continue
      const sprinting = player.sprinting
      if (sprinting) {
        const tick = applySprint(player, deltaSeconds)
        player.pendingEnergy += tick.energy - player.energy
        player.pendingHealth += tick.health - player.health
        player.energy = tick.energy
        player.health = tick.health
        if (tick.collapsed) {
          // Banange! Down for a few seconds, never out of the race.
          player.collapsedUntil = now + COLLAPSE_SECONDS * 1000
          player.pendingStress += STRESS.collapse
          changed = true
          this.sendNeeds(player, now)
          continue
        }
      }
      const edge = this.roadGraph.edges[player.roadPosition.edgeId]
      if (!edge) {
        player.moving = false
        changed = true
        continue
      }

      const distance =
        player.roadPosition.distanceAlongEdge +
        WALK_SPEED_METERS_PER_SECOND *
          speedMultiplier(sprinting, false) *
          deltaSeconds *
          player.roadPosition.direction
      const reachedEnd = distance > edge.lengthMeters
      const reachedStart = distance < 0

      if (reachedEnd || reachedStart) {
        const nodeId = reachedEnd ? edge.toNodeId : edge.fromNodeId
        const candidates = classifyConnectedEdges(this.roadGraph, player.roadPosition)
        const intent =
          player.turnIntent && player.turnIntent.expiresAt > now
            ? player.turnIntent.direction
            : null
        const selected = chooseBestEdge(candidates, intent)
        const fallback = chooseBestEdge(candidates, "straight")
        const chosen = selected ?? (intent ? null : fallback)

        if (chosen) {
          const chosenEdge = this.roadGraph.edges[chosen.edgeId]!
          const overflow = reachedEnd ? distance - edge.lengthMeters : -distance
          const direction: 1 | -1 = chosenEdge.fromNodeId === nodeId ? 1 : -1
          player.roadPosition = {
            edgeId: chosen.edgeId,
            distanceAlongEdge:
              direction === 1
                ? Math.min(overflow, chosenEdge.lengthMeters)
                : Math.max(chosenEdge.lengthMeters - overflow, 0),
            direction
          }
          player.turnIntent = null
          player.coordinate = getRoadCoordinate(this.roadGraph, player.roadPosition)
          changed = true
        } else {
          player.roadPosition = {
            ...player.roadPosition,
            distanceAlongEdge: reachedEnd ? edge.lengthMeters : 0
          }
          player.moving = false
          player.turnIntent = null
          changed = true
        }
      } else {
        player.roadPosition = { ...player.roadPosition, distanceAlongEdge: distance }
        player.coordinate = getRoadCoordinate(this.roadGraph, player.roadPosition)
        changed = true
      }
    }

    for (const player of Object.values(this.players)) {
      if (now - player.needsSentAt >= NEEDS_SYNC_MS) this.sendNeeds(player, now)
    }

    if (changed || arrived) {
      this.broadcast("positions", this.getPositions())
    }
    if (arrived) {
      this.broadcast("roomState", this.getRoomState())
    }

    if (this.mode === "gig" && this.gigDeadline !== null && now >= this.gigDeadline && this.finishOrder.length === 0) {
      this.finishRace()
      return
    }

    const racers = Object.values(this.players).filter((player) => player.roadPosition)
    const allFinished = racers.length > 0 && racers.every((player) => player.finishPosition !== null)
    if (this.finishOrder.length > 0 && (allFinished || (this.finishDeadline !== null && now >= this.finishDeadline))) {
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
      this.sendNeeds(player, Date.now())
    }
    if (this.mode === "gig") {
      this.finishGig()
      return
    }
    const finishedAt = new Date()
    // Winning a real race (someone to beat) takes the edge off.
    const winner = this.players[this.finishOrder[0] ?? ""]
    const field = Object.values(this.players).filter((player) => player.roadPosition).length
    if (winner && field >= 2) winner.pendingStress += STRESS.raceWin
    void this.flushNeeds(Object.values(this.players))
    this.broadcast("roomState", this.getRoomState())
    this.broadcast(
      "raceFinished",
      this.finishOrder.map((sessionId, index) => ({
        sessionId,
        name: this.players[sessionId]?.name ?? "Player",
        position: index + 1
      }))
    )
    // Everyone who actually raced (had a start), finished or not.
    const fieldSize = Object.values(this.players).filter((player) => player.roadPosition).length
    void this.persistResults(finishedAt, fieldSize)
  }

  private finishGig() {
    const player = Object.values(this.players)[0]
    const delivered = this.finishOrder.length > 0
    const meters = Math.round(this.gigMeters)
    this.gigDeadline = null
    this.broadcast("roomState", this.getRoomState())
    if (!player) return
    player.pendingStress += delivered ? STRESS.gigDelivered : STRESS.gigFailed
    void this.flushNeeds([player])
    const send = (result: GigResult) => {
      this.clients.find((candidate) => candidate.sessionId === player.id)?.send("gigResult", result)
    }
    if (!delivered) return send({ delivered: false, paid: false, reason: "late", meters })
    if (!player.userId) return send({ delivered: true, paid: false, reason: "guest", meters })
    const gigId = `${this.roomId}:${this.startedAt}`
    payGig({ userId: player.userId, gigId, distanceMeters: meters })
      .then((result) =>
        send(
          result.ok
            ? { delivered: true, paid: true, gross: result.gross, cut: result.cut, net: result.net, meters }
            : { delivered: true, paid: false, reason: result.reason, meters }
        )
      )
      .catch((error) => {
        console.error("Failed to pay gig:", error)
        send({ delivered: true, paid: false, reason: "error", meters })
      })
  }

  private async persistResults(finishedAt: Date, fieldSize: number) {
    if (!this.destinationId || !this.startedAt) return
    const placements = this.finishOrder.map((sessionId, index) => ({
      sessionId,
      userId: this.players[sessionId]?.userId ?? null,
      position: index + 1
    }))
    let raceId: string
    try {
      raceId = await recordRaceResults({
        roomCode: this.roomCode,
        destinationId: this.destinationId,
        startedAt: new Date(this.startedAt),
        finishedAt,
        playerCount: Object.keys(this.players).length,
        placements: placements.map(({ userId, position }) => ({ userId, position, finishedAt }))
      })
    } catch (error) {
      console.error("Failed to persist race results:", error)
      return
    }
    // Coins are paid separately so a ledger problem never loses the results.
    try {
      const payouts = await awardRaceEarnings({ raceId, finishedAt, fieldSize, placements })
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
    this.gigDeadline = null
    for (const player of Object.values(this.players)) {
      player.roadPosition = null
      player.coordinate = null
      player.moving = false
      player.turnIntent = null
      player.finishPosition = null
    }
    this.snapUnplacedPlayers()
    this.broadcast("roomState", this.getRoomState())
    this.syncMetadata()

    if (Object.keys(this.players).length >= 2) {
      this.beginCountdown()
    }
  }

  private async loadPlayerNeeds(sessionId: string) {
    const player = this.players[sessionId]
    if (!player?.userId) return
    try {
      const needs = await loadNeeds(player.userId)
      const current = this.players[sessionId]
      if (!current) return
      current.energy = needs.energy
      current.health = needs.health
      current.needsLoaded = true
      this.sendNeeds(current, Date.now())
      // Racing wakes you: a zero-change write clears resting_since.
      if (needs.resting) void this.flushNeeds([current], true)
    } catch (error) {
      console.error("Failed to load needs:", error)
    }
  }

  /**
   * Write energy/health changes as deltas, one query for the whole batch, and
   * adopt the DB's answer (which includes regen and any food bought mid-race).
   * Only players whose needs changed are written unless `force` is set.
   */
  private async flushNeeds(players: PlayerInfo[], force = false) {
    // Only persist what we actually loaded, so a DB hiccup can't reset anyone.
    const batch = players.filter(
      (player) => player.userId && player.needsLoaded && (force || player.pendingEnergy !== 0 || player.pendingHealth !== 0 || player.pendingStress !== 0)
    )
    if (batch.length === 0) return
    const sent = batch.map((player) => {
      const delta = {
        userId: player.userId!,
        energy: player.pendingEnergy,
        health: player.pendingHealth,
        stress: player.pendingStress
      }
      player.pendingEnergy = 0
      player.pendingHealth = 0
      player.pendingStress = 0
      return { player, delta }
    })
    try {
      const fresh = await applyNeedsDeltas(sent.map((entry) => entry.delta))
      const now = Date.now()
      for (const { player } of sent) {
        const next = fresh.get(player.userId!)
        if (!next) continue
        // Keep whatever changed while the query was in flight.
        player.energy = Math.max(0, Math.min(NEED_MAX, next.energy + player.pendingEnergy))
        player.health = Math.max(0, Math.min(NEED_MAX, next.health + player.pendingHealth))
        this.sendNeeds(player, now)
      }
    } catch (error) {
      for (const { player, delta } of sent) {
        player.pendingEnergy += delta.energy
        player.pendingHealth += delta.health
        player.pendingStress += delta.stress
      }
      console.error("Failed to flush needs:", error)
    }
  }

  private sendNeeds(player: PlayerInfo, now: number) {
    player.needsSentAt = now
    const client = this.clients.find((candidate) => candidate.sessionId === player.id)
    client?.send("needs", {
      energy: Math.round(player.energy * 10) / 10,
      health: Math.round(player.health * 10) / 10,
      collapsedForMs: player.collapsedUntil === null ? 0 : Math.max(0, player.collapsedUntil - now)
    })
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

  private getRoomState() {
    return {
      phase: this.phase,
      countdownSeconds: this.countdownSeconds,
      destinationId: this.destinationId,
      startedAt: this.startedAt,
      roomCode: this.roomCode,
      mode: this.mode,
      // Remaining time rather than a timestamp, so client clocks don't matter.
      gigRemainingMs: this.gigDeadline === null ? null : Math.max(0, this.gigDeadline - Date.now()),
      gigMeters: this.mode === "gig" ? Math.round(this.gigMeters) : null,
      players: this.players
    }
  }

  private beginCountdown() {
    this.phase = "countdown"
    this.broadcast("roomState", this.getRoomState())
    this.syncMetadata()

    let remaining = this.mode === "gig" ? GIG_COUNTDOWN_SECONDS : COUNTDOWN_SECONDS
    this.countdownSeconds = remaining
    this.countdownInterval = setInterval(() => {
      remaining--
      this.countdownSeconds = remaining
      this.broadcast("countdownTick", remaining)
      if (remaining <= 0) {
        this.stopCountdown()
        this.launchRace()
      }
    }, 1000)
  }

  private launchRace() {
    this.phase = "racing"
    // Anyone who never dropped a pin gets the default start so they can race.
    this.snapUnplacedPlayers()
    this.lock()
    this.startedAt = Date.now()
    this.finishOrder = []
    this.finishDeadline = null
    let options = [...KAMPALA_ZONE.bountyLocations].sort(() => Math.random() - 0.5)
    const courier = this.mode === "gig" ? Object.values(this.players)[0]?.coordinate ?? null : null
    if (courier) {
      // Drop-offs a proper ride away come first, the rest by how close they are to that range.
      const offRange = (meters: number) =>
        meters < GIG_MIN_METERS ? GIG_MIN_METERS - meters : meters > GIG_MAX_METERS ? meters - GIG_MAX_METERS : 0
      options = options
        .map((pick) => ({ pick, off: offRange(haversineDistanceMeters(courier, pick.position)) }))
        .sort((a, b) => a.off - b.off)
        .map((entry) => entry.pick)
    }
    const fallback = options[0]!
    this.destinationId = fallback.id
    this.bounty = null
    if (this.roadGraph) {
      const referenceEdges = Object.values(this.players)
        .map((player) => player.roadPosition?.edgeId)
        .filter((edgeId): edgeId is string => edgeId !== undefined && edgeId !== null)
      for (const pick of options) {
        const nearest = findNearestEdge(this.roadGraph, pick.position)
        if (!nearest) continue
        const reachable =
          referenceEdges.length === 0 ||
          referenceEdges.every((edgeId) => isEdgeReachable(this.roadGraph!, edgeId, nearest.edgeId))
        if (!reachable) continue
        this.destinationId = pick.id
        this.bounty = {
          destinationId: pick.id,
          edgeId: nearest.edgeId,
          distanceAlongEdge: nearest.distanceAlongEdge,
          coordinate: getRoadCoordinate(this.roadGraph, {
            edgeId: nearest.edgeId,
            distanceAlongEdge: nearest.distanceAlongEdge,
            direction: 1
          }) ?? pick.position
        }
        break
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
    if (this.mode === "gig") {
      // Paid by the straight-line distance from pickup to drop-off.
      this.gigMeters = courier && this.bounty ? haversineDistanceMeters(courier, this.bounty.coordinate) : GIG_MIN_METERS
      this.gigDeadline = Date.now() + GIG_TIME_LIMIT_SECONDS * 1000
    }
    this.broadcast("roomState", this.getRoomState())
    this.syncMetadata()
  }

  private stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
      this.countdownInterval = null
    }
  }
}
