import { Room, Client, ServerError } from "@colyseus/core"
import {
  HUSTLE_ARRIVAL_METERS,
  HUSTLE_STRESS,
  PORTER_LOADS,
  PORTER_OFFER_COUNT,
  PORTER_PICKUP_SECONDS,
  PORTER_SPRINT_DRAIN,
  findSpot,
  haversineDistanceMeters,
  makePorterOffer,
  KIKUUBO_SPOTS,
  type PorterOffer
} from "@tiral/game-core"
import type { RoadDirection, RoadGraph } from "@tiral/road-graph"
import { sanitizeLoadout, type AvatarLoadout } from "@tiral/avatars"
import { payHustle } from "@tiral/db"
import { loadRoadGraph } from "../roads.js"
import { verifyJoinToken, type JoinIdentity } from "../auth.js"
import {
  BodySync,
  NEEDS_FLUSH_MS,
  freshBody,
  requestTurn,
  snapToRoad,
  spendEnergy,
  stepRunner,
  turnAround,
  type Runner
} from "./runner.js"

const TICK_MS = 100
const RECONNECT_SECONDS = 30
/** Tests widen this (like RACE_ARRIVAL_RADIUS) to complete jobs without walking. */
const ARRIVAL_METERS = Number(process.env.HUSTLE_ARRIVAL_RADIUS ?? HUSTLE_ARRIVAL_METERS)

type Worker = Runner & { name: string; loadout: AvatarLoadout; startAt: { lat: number; lng: number } | null }

type ActiveJob = {
  offer: PorterOffer
  stage: "to_pickup" | "carrying"
  /** Server clock time this stage must be done by. */
  deadline: number
}

type Shift = { jobs: number; earned: number; failed: number }

export type HustleReceipt =
  | { jobId: string; paid: true; pay: number; load: string; meters: number; balance: number }
  | { jobId: string; paid: false; reason: "duplicate" | "daily_limit" | "error"; load: string; meters: number }

/**
 * A solo hustle shift: the server keeps a board of simulated jobs; the player
 * accepts one, walks to the pickup, carries the load to the drop-off before
 * the timer and is paid through the ledger. No other players needed.
 */
export class HustleRoom extends Room {
  maxClients = 1

  private hustle = "porter"
  private worker: Worker | null = null
  private graph: RoadGraph | null = null
  private offers: PorterOffer[] = []
  private job: ActiveJob | null = null
  private shift: Shift = { jobs: 0, earned: 0, failed: 0 }
  private offerSeq = 0
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly body = new BodySync((runner, message, payload) => {
    this.clients.find((candidate) => candidate.sessionId === runner.id)?.send(message, payload)
  })

  static async onAuth(token: unknown) {
    const identity = await verifyJoinToken(token)
    if (identity.guest) throw new ServerError(401, "Sign in to hustle")
    return identity
  }

  onCreate(options: any) {
    // Only the porter exists so far; anything else falls back to it.
    this.hustle = options?.hustle === "porter" ? "porter" : "porter"
    this.setPrivate(true)

    this.onMessage("walk", (client, on: boolean) => {
      const worker = this.own(client)
      if (worker) worker.moving = on === true
    })
    this.onMessage("sprint", (client, on: boolean) => {
      const worker = this.own(client)
      if (worker) worker.sprinting = on === true
    })
    this.onMessage("turn", (client, direction: RoadDirection) => {
      const worker = this.own(client)
      if (worker && this.graph) requestTurn(this.graph, worker, direction, Date.now())
    })
    this.onMessage("turnAround", (client) => {
      const worker = this.own(client)
      if (worker) turnAround(worker)
    })
    this.onMessage("refreshNeeds", (client) => {
      const worker = this.own(client)
      if (worker) void this.body.flush([worker], true)
    })
    this.onMessage("accept", (client, offerId: string) => this.accept(client, offerId))
    this.onMessage("abandon", (client) => {
      if (this.own(client) && this.job) this.failJob("abandoned")
    })

    void loadRoadGraph().then((graph) => {
      this.graph = graph
      if (this.worker) this.place(this.worker)
      this.fillOffers(Date.now())
      this.sendState()
    })

    this.tickInterval = setInterval(() => this.tick(), TICK_MS)
    this.flushInterval = setInterval(() => {
      if (this.worker) void this.body.flush([this.worker])
    }, NEEDS_FLUSH_MS)
  }

  onJoin(client: Client, options: any, auth?: JoinIdentity) {
    const verified = auth && !auth.guest ? auth : null
    if (this.worker && this.worker.id === client.sessionId) {
      this.sendState()
      return
    }
    const worker: Worker = {
      id: client.sessionId,
      userId: verified?.userId ?? null,
      name: verified?.displayName ?? "Porter",
      loadout: sanitizeLoadout(options?.loadout),
      startAt: null,
      roadPosition: null,
      coordinate: null,
      moving: false,
      turnIntent: null,
      ...freshBody()
    }
    this.worker = worker
    if (this.graph) this.place(worker)
    void this.body.load(worker, () => this.worker === worker)
    this.sendState()
  }

  async onDrop(client: Client) {
    if (this.worker) this.worker.moving = false
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS)
      this.sendState()
    } catch {
      this.endShift()
    }
  }

  onLeave() {
    this.endShift()
  }

  onDispose() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.flushInterval) clearInterval(this.flushInterval)
    if (this.worker) void this.body.flush([this.worker])
  }

  private own(client: Client) {
    return this.worker && this.worker.id === client.sessionId ? this.worker : null
  }

  /** Start the shift at a random Kikuubo shop. */
  private place(worker: Worker) {
    if (!this.graph) return
    const spot = KIKUUBO_SPOTS[Math.floor(Math.random() * KIKUUBO_SPOTS.length)]!
    const snapped = snapToRoad(this.graph, spot.position)
    if (!snapped) return
    worker.roadPosition = snapped.roadPosition
    worker.coordinate = snapped.coordinate
    worker.startAt = snapped.coordinate ? { ...snapped.coordinate } : null
  }

  private fillOffers(now: number) {
    this.offers = this.offers.filter((offer) => offer.expiresAt > now)
    while (this.offers.length < PORTER_OFFER_COUNT) {
      const taken = this.offers.map((offer) => offer.pickupId)
      this.offers.push(makePorterOffer(`${this.roomId}:${++this.offerSeq}`, now, Math.random, taken))
    }
  }

  private accept(client: Client, offerId: string) {
    const worker = this.own(client)
    if (!worker || this.job) return
    const offer = this.offers.find((candidate) => candidate.id === offerId)
    if (!offer) return client.send("notice", "That job was taken. Pick another one.")
    if (worker.energy < offer.energy) {
      return client.send("notice", "You're too tired for this load. Eat something or rest first.")
    }
    this.offers = this.offers.filter((candidate) => candidate.id !== offerId)
    this.job = { offer, stage: "to_pickup", deadline: Date.now() + PORTER_PICKUP_SECONDS * 1000 }
    this.fillOffers(Date.now())
    this.sendState()
  }

  private tick() {
    const worker = this.worker
    const now = Date.now()
    if (!worker || !this.graph) return
    const carrying = this.job?.stage === "carrying"
    const load = carrying ? PORTER_LOADS.find((candidate) => candidate.id === this.job!.offer.loadId) : null
    // Real elapsed time, not the nominal tick: timers fire late, and a fixed
    // step would leave the server's runner behind the player's screen.
    const deltaSeconds = Math.min(0.25, (now - (this.lastTickAt ?? now - TICK_MS)) / 1000)
    this.lastTickAt = now
    const step = stepRunner(this.graph, worker, now, deltaSeconds, {
      sprintDrainFactor: load ? PORTER_SPRINT_DRAIN[load.heavy ? "heavy" : "light"] : 1
    })
    if (step.collapsedNow) this.body.send(worker, now)
    // Moving: every change. Standing still: a heartbeat so the client can settle.
    if (step.changed || now - this.positionSentAt >= 1000) this.sendPosition(worker)
    this.body.sendDue([worker], now)

    if (this.job && worker.coordinate) {
      const { offer, stage } = this.job
      const target = findSpot(stage === "to_pickup" ? offer.pickupId : offer.dropoffId)
      const there = target && haversineDistanceMeters(worker.coordinate, target.position) <= ARRIVAL_METERS
      if (there && stage === "to_pickup") {
        this.job = { offer, stage: "carrying", deadline: now + offer.timeLimitSeconds * 1000 }
        this.sendState()
      } else if (there && stage === "carrying") {
        void this.deliver(offer)
      } else if (now > this.job.deadline) {
        this.failJob(stage === "to_pickup" ? "no_show" : "late")
      }
    }

    if (this.offers.some((offer) => offer.expiresAt <= now)) {
      this.fillOffers(now)
      this.sendState()
    }
  }

  private async deliver(offer: PorterOffer) {
    const worker = this.worker
    if (!worker) return
    this.job = null
    spendEnergy(worker, offer.energy)
    worker.pendingStress += HUSTLE_STRESS.paid
    const load = PORTER_LOADS.find((candidate) => candidate.id === offer.loadId)?.name ?? "a load"
    this.sendState()
    let receipt: HustleReceipt
    if (!worker.userId) {
      receipt = { jobId: offer.id, paid: false, reason: "error", load, meters: offer.meters }
    } else {
      try {
        const result = await payHustle({
          userId: worker.userId,
          hustle: this.hustle,
          jobId: offer.id,
          net: offer.pay,
          meta: {
            load: offer.loadId,
            from: offer.pickupId,
            to: offer.dropoffId,
            meters: offer.meters,
            gross: offer.pay
          }
        })
        receipt = result.ok
          ? { jobId: offer.id, paid: true, pay: offer.pay, load, meters: offer.meters, balance: result.balance }
          : { jobId: offer.id, paid: false, reason: result.reason, load, meters: offer.meters }
      } catch (error) {
        console.error("Failed to pay hustle:", error)
        receipt = { jobId: offer.id, paid: false, reason: "error", load, meters: offer.meters }
      }
    }
    if (receipt.paid) {
      this.shift.jobs++
      this.shift.earned += receipt.pay
    }
    this.clients.find((candidate) => candidate.sessionId === worker.id)?.send("receipt", receipt)
    this.sendState()
    void this.body.flush([worker])
  }

  private failJob(reason: "abandoned" | "late" | "no_show") {
    const worker = this.worker
    const job = this.job
    if (!worker || !job) return
    this.job = null
    this.shift.failed++
    worker.pendingStress += HUSTLE_STRESS.failed
    // Hauling half the way still tired you out.
    if (job.stage === "carrying") spendEnergy(worker, job.offer.energy / 2)
    this.clients.find((candidate) => candidate.sessionId === worker.id)?.send("jobFailed", { reason })
    this.sendState()
  }

  private endShift() {
    if (this.job && this.job.stage === "carrying") this.failJob("abandoned")
    if (this.worker) void this.body.flush([this.worker])
  }

  private positionSentAt = 0
  private lastTickAt: number | null = null

  private sendPosition(worker: Worker) {
    this.positionSentAt = Date.now()
    this.clients.find((candidate) => candidate.sessionId === worker.id)?.send("position", {
      coordinate: worker.coordinate,
      roadPosition: worker.roadPosition,
      moving: worker.moving && worker.collapsedUntil === null,
      collapsed: worker.collapsedUntil !== null
    })
  }

  private sendState() {
    const worker = this.worker
    if (!worker) return
    const now = Date.now()
    this.clients.find((candidate) => candidate.sessionId === worker.id)?.send("hustle", {
      hustle: this.hustle,
      startAt: worker.startAt,
      offers: this.offers.map((offer) => ({ ...offer, expiresInMs: Math.max(0, offer.expiresAt - now) })),
      // Remaining time rather than timestamps, so client clocks don't matter.
      job: this.job
        ? { offer: this.job.offer, stage: this.job.stage, remainingMs: Math.max(0, this.job.deadline - now) }
        : null,
      shift: this.shift
    })
  }
}
