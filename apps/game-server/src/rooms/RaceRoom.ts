import { Room, Client } from "@colyseus/core"
import { KAMPALA_ZONE, haversineDistanceMeters } from "@tiral/game-core"
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
import { awardRaceEarnings, recordRaceResults } from "@tiral/db"

const WALK_SPEED_METERS_PER_SECOND = 18
const TURN_INTENT_TIMEOUT_MS = 3000
const TICK_MS = 100
const COUNTDOWN_SECONDS = Number(process.env.RACE_COUNTDOWN_SECONDS ?? 300)
const ARRIVAL_RADIUS_METERS = Number(process.env.RACE_ARRIVAL_RADIUS ?? 25)
const FINISH_WINDOW_MS = 30_000

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

  private phase: "lobby" | "countdown" | "racing" | "finished" = "lobby"
  private countdownSeconds = COUNTDOWN_SECONDS
  private countdownInterval: ReturnType<typeof setInterval> | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private players: Record<string, PlayerInfo> = {}
  private startedAt: number | null = null
  private destinationId: string | null = null
  private bounty: BountyTarget | null = null
  private finishOrder: string[] = []
  private finishDeadline: number | null = null
  private roadGraph: RoadGraph | null = null
  private roomCode = ""

  static async onAuth(token: unknown) {
    return verifyJoinToken(token)
  }

  onCreate(_options: any) {
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
        connected: true
      }
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
      delete this.players[client.sessionId]
      this.broadcast("roomState", this.getRoomState())
      this.syncMetadata()
    }
  }

  onLeave(client: Client) {
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
      if (!player.moving || !player.roadPosition) continue
      const edge = this.roadGraph.edges[player.roadPosition.edgeId]
      if (!edge) {
        player.moving = false
        changed = true
        continue
      }

      const distance =
        player.roadPosition.distanceAlongEdge +
        WALK_SPEED_METERS_PER_SECOND * deltaSeconds * player.roadPosition.direction
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

    if (changed || arrived) {
      this.broadcast("positions", this.getPositions())
    }
    if (arrived) {
      this.broadcast("roomState", this.getRoomState())
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
    }
    const finishedAt = new Date()
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

  private getPositions() {
    const positions: Record<
      string,
      {
        roadPosition: RoadPosition | null
        coordinate: { lat: number; lng: number } | null
        moving: boolean
        loadout: AvatarLoadout
      }
    > = {}
    for (const [sessionId, player] of Object.entries(this.players)) {
      positions[sessionId] = {
        roadPosition: player.roadPosition,
        coordinate: player.coordinate,
        moving: player.moving,
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
      players: this.players
    }
  }

  private beginCountdown() {
    this.phase = "countdown"
    this.broadcast("roomState", this.getRoomState())
    this.syncMetadata()

    let remaining = COUNTDOWN_SECONDS
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
    const options = [...KAMPALA_ZONE.bountyLocations].sort(() => Math.random() - 0.5)
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
