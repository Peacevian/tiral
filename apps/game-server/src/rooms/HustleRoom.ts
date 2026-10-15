import { Room, Client, ServerError } from "@colyseus/core"
import {
  BODA_BIKE_RENT,
  BODA_DAILY_TRIPS,
  BODA_OFFER_COUNT,
  BODA_PICKUP_SECONDS,
  BODA_SPRINT_DRAIN,
  BODA_STAGES,
  HUSTLE_ARRIVAL_METERS,
  HUSTLE_STRESS,
  KIKUUBO_SPOTS,
  PORTER_LOADS,
  PORTER_DAILY_JOBS,
  PORTER_OFFER_COUNT,
  PORTER_PICKUP_SECONDS,
  PORTER_SPRINT_DRAIN,
  RENTAL_BIKE_LOOK,
  RENTAL_WEAR,
  bikeFuelPerMeter,
  bikePatienceFactor,
  bikeSpeedFactor,
  bikeTipFactor,
  bikeWearPerKm,
  bodaFuelCost,
  breakdownChancePerKm,
  findBikeModel,
  bodaFullFareSeconds,
  bodaGiveUpSeconds,
  bodaPayout,
  findPlace,
  haversineDistanceMeters,
  isRushHour,
  makeBodaOffer,
  makePorterOffer,
  type BikeLook,
  type BikeStats,
  type HustleOffer
} from "@tiral/game-core"
import type { RoadDirection, RoadGraph } from "@tiral/road-graph"
import { sanitizeLoadout, type AvatarLoadout } from "@tiral/avatars"
import { addBikeWear, chargeBreakdown, chargeFuel, getRideBike, payHustle, rentBikeToday, type BikeView } from "@tiral/db"
import { loadRoadGraph } from "../roads.js"
import { withRetry } from "../retry.js"
import { testOverride } from "../testOverrides.js"
import { verifyJoinToken, type JoinIdentity } from "../auth.js"
import {
  BodySync,
  MAX_MESSAGES_PER_SECOND,
  MessageThrottle,
  NEEDS_FLUSH_MS,
  guarded,
  REFRESH_NEEDS_MS,
  freshBody,
  requestTurn,
  snapToRoad,
  tiredReason,
  spendEnergy,
  stepRunner,
  turnAround,
  type Runner
} from "./runner.js"

const TICK_MS = 100
const RECONNECT_SECONDS = 30
/** Tests widen this (like RACE_ARRIVAL_RADIUS) to complete jobs without walking. */
const ARRIVAL_METERS = testOverride("HUSTLE_ARRIVAL_RADIUS") ?? HUSTLE_ARRIVAL_METERS

type Gig = "porter" | "boda"

type Worker = Runner & { name: string; loadout: AvatarLoadout; startAt: { lat: number; lng: number } | null }

type ActiveJob = {
  offer: HustleOffer
  stage: "to_pickup" | "carrying"
  /** Server clock time this stage must be done by (boda: when the passenger gives up). */
  deadline: number
  /** Boda: when the passenger got on. */
  pickedUpAt: number | null
}

type Shift = { jobs: number; earned: number; failed: number }

export type ReceiptLine = { label: string; amount: number }

export type HustleReceipt =
  | { jobId: string; paid: true; title: string; lines: ReceiptLine[]; net: number; meters: number; balance: number }
  | { jobId: string; paid: false; title: string; reason: "duplicate" | "daily_limit" | "error"; meters: number }

/**
 * A solo hustle shift: the server keeps a board of simulated jobs; the player
 * takes one, goes to the pickup, delivers before the timer and is paid through
 * the ledger. Porters walk with loads; boda riders carry dummy passengers on a
 * rented bike. No other players needed.
 */
export class HustleRoom extends Room {
  maxClients = 1
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND.hustle
  private readonly throttle = new MessageThrottle()

  private gig: Gig = "porter"
  private worker: Worker | null = null
  private graph: RoadGraph | null = null
  private offers: HustleOffer[] = []
  private job: ActiveJob | null = null
  private shift: Shift = { jobs: 0, earned: 0, failed: 0 }
  private offerSeq = 0
  /** Boda: today's bike rent is paid (checked on the first ride), or you ride your own. */
  private bikeReady = false
  /** Boda: your own bike (null = the stage rental). */
  private ownBike: BikeView | null = null
  private bikeLoaded = false
  /** Boda: km ridden on your own bike not yet written as wear. */
  private wearKm = 0
  private breakdowns = 0
  private accepting = false
  /** Boda: metres ridden since fuel was last paid for. */
  private fuelMeters = 0
  private fuelCharges = 0
  private lastCoordinate: { lat: number; lng: number } | null = null
  private positionSentAt = 0
  private lastTickAt: number | null = null
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
    this.gig = options?.hustle === "boda" ? "boda" : "porter"
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
      if (worker && this.throttle.allow(client.sessionId, "refreshNeeds", REFRESH_NEEDS_MS)) void this.body.flush([worker], true)
    })
    this.onMessage("accept", (client, offerId: string) => void this.accept(client, offerId))
    this.onMessage("abandon", (client) => {
      if (this.own(client) && this.job) this.failJob("abandoned")
    })

    loadRoadGraph()
      .then((graph) => {
        this.graph = graph
        if (this.worker) this.place(this.worker)
        this.fillOffers(Date.now())
        this.sendState()
      })
      .catch((error) => console.error("Failed to load road graph:", error))

    this.tickInterval = setInterval(guarded("hustle tick", () => this.tick()), TICK_MS)
    this.flushInterval = setInterval(
      guarded("hustle needs flush", () => (this.worker ? this.body.flush([this.worker]) : undefined)),
      NEEDS_FLUSH_MS
    )
  }

  /** An error in a message handler or room method: log it, keep the server alive. */
  onUncaughtException(error: unknown, methodName: string) {
    console.error(`[hustle ${this.roomId}] ${methodName} failed:`, error)
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
      name: verified?.displayName ?? "Worker",
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
    if (this.gig === "boda" && worker.userId) void this.loadBike(worker.userId)
    this.sendState()
  }

  /** Your own bike if you have one active; otherwise the stage rental. */
  private async loadBike(userId: string) {
    try {
      this.ownBike = await getRideBike(userId)
      if (this.ownBike) this.bikeReady = true
    } catch (error) {
      console.error("Failed to load bike:", error)
    } finally {
      this.bikeLoaded = true
      this.sendState()
    }
  }

  private get bikeStats(): BikeStats {
    return findBikeModel(this.ownBike?.model ?? "rental").stats
  }

  private get bikeLook(): BikeLook {
    return this.ownBike?.look ?? RENTAL_BIKE_LOOK
  }

  private get bikeWear() {
    return this.ownBike ? this.ownBike.wear : RENTAL_WEAR
  }

  async onDrop(client: Client) {
    if (this.worker) this.worker.moving = false
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS)
      this.sendState()
    } catch {
      void this.endShift()
    }
  }

  onLeave() {
    void this.endShift()
  }

  onDispose() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.flushInterval) clearInterval(this.flushInterval)
    if (this.worker) void this.body.flush([this.worker])
  }

  private own(client: Client) {
    return this.worker && this.worker.id === client.sessionId ? this.worker : null
  }

  /** Start at a random Kikuubo shop (porter) or boda stage. */
  private place(worker: Worker) {
    if (!this.graph) return
    const spots = this.gig === "boda" ? BODA_STAGES : KIKUUBO_SPOTS
    const spot = spots[Math.floor(Math.random() * spots.length)]!
    const snapped = snapToRoad(this.graph, spot.position)
    if (!snapped) return
    worker.roadPosition = snapped.roadPosition
    worker.coordinate = snapped.coordinate
    worker.startAt = snapped.coordinate ? { ...snapped.coordinate } : null
    this.lastCoordinate = snapped.coordinate ? { ...snapped.coordinate } : null
  }

  private fillOffers(now: number) {
    this.offers = this.offers.filter((offer) => offer.expiresAt > now)
    const count = this.gig === "boda" ? BODA_OFFER_COUNT : PORTER_OFFER_COUNT
    while (this.offers.length < count) {
      const id = `${this.roomId}:${++this.offerSeq}`
      if (this.gig === "boda") {
        const taken = this.offers.map((offer) => `${offer.pickupId}>${offer.dropoffId}`)
        this.offers.push(makeBodaOffer(id, now, Math.random, taken))
      } else {
        const taken = this.offers.map((offer) => offer.pickupId)
        this.offers.push(makePorterOffer(id, now, Math.random, taken))
      }
    }
  }

  private async accept(client: Client, offerId: string) {
    const worker = this.own(client)
    if (!worker || this.job || this.accepting) return
    const offer = this.offers.find((candidate) => candidate.id === offerId)
    if (!offer) return client.send("notice", "That job was taken. Pick another one.")
    const tired = tiredReason(worker, offer.energy)
    if (tired) return client.send("notice", tired)
    if (this.gig === "boda" && !this.bikeLoaded) {
      return client.send("notice", "Getting your bike ready…")
    }
    if (this.gig === "boda" && !this.bikeReady) {
      // Today's bike rent comes due with the first passenger of the day.
      if (!worker.userId) return
      this.accepting = true
      try {
        const rent = await rentBikeToday({ userId: worker.userId, amount: BODA_BIKE_RENT })
        if (!rent.ok) {
          return client.send("notice", `You need ${BODA_BIKE_RENT.toLocaleString("en-US")} BNG to rent a bike for today.`)
        }
        this.bikeReady = true
        if (rent.charged) client.send("bikeRented", { amount: BODA_BIKE_RENT, balance: rent.balance })
      } catch (error) {
        console.error("Bike rent failed:", error)
        return client.send("notice", "Couldn't rent the bike right now. Try again.")
      } finally {
        this.accepting = false
      }
      // The offer may have expired while we waited.
      if (!this.offers.some((candidate) => candidate.id === offerId) || this.job) return
    }
    const now = Date.now()
    this.offers = this.offers.filter((candidate) => candidate.id !== offerId)
    const pickupSeconds = offer.kind === "boda" ? BODA_PICKUP_SECONDS : PORTER_PICKUP_SECONDS
    this.job = { offer, stage: "to_pickup", deadline: now + pickupSeconds * 1000, pickedUpAt: null }
    this.fillOffers(now)
    this.sendState()
  }

  private tick() {
    const worker = this.worker
    const now = Date.now()
    if (!worker || !this.graph) return
    // Real elapsed time, not the nominal tick: timers fire late, and a fixed
    // step would leave the server's runner behind the player's screen.
    const deltaSeconds = Math.min(0.25, (now - (this.lastTickAt ?? now - TICK_MS)) / 1000)
    this.lastTickAt = now
    const carrying = this.job?.stage === "carrying"
    const offer = this.job?.offer
    const sprintDrainFactor =
      this.gig === "boda"
        ? BODA_SPRINT_DRAIN
        : carrying && offer?.kind === "porter"
          ? PORTER_SPRINT_DRAIN[offer.heavy ? "heavy" : "light"]
          : 1
    const step = stepRunner(this.graph, worker, now, deltaSeconds, {
      sprintDrainFactor,
      speedFactor: this.gig === "boda" ? bikeSpeedFactor(this.bikeStats) : 1
    })
    if (step.collapsedNow) this.body.send(worker, now)
    // Fuel and wear: every metre the bike actually moves. With a passenger on,
    // a worn bike can break down.
    if (this.gig === "boda" && worker.coordinate) {
      const moved = this.lastCoordinate ? haversineDistanceMeters(this.lastCoordinate, worker.coordinate) : 0
      this.lastCoordinate = { ...worker.coordinate }
      this.fuelMeters += moved
      if (this.ownBike) this.wearKm += moved / 1000
      if (moved > 0 && carrying && Math.random() < breakdownChancePerKm(this.bikeStats, this.bikeWear) * (moved / 1000)) {
        void this.breakDown()
        return
      }
    }
    // Moving: every change. Standing still: a heartbeat so the client can settle.
    if (step.changed || now - this.positionSentAt >= 1000) this.sendPosition(worker)
    this.body.sendDue([worker], now)

    if (this.job && worker.coordinate) {
      const { offer, stage } = this.job
      const target = findPlace(stage === "to_pickup" ? offer.pickupId : offer.dropoffId)
      const there = target && haversineDistanceMeters(worker.coordinate, target.position) <= ARRIVAL_METERS
      if (there && stage === "to_pickup") {
        const deadline =
          offer.kind === "boda"
            ? now + bodaGiveUpSeconds(offer.meters, bikePatienceFactor(this.bikeStats)) * 1000
            : now + offer.timeLimitSeconds * 1000
        this.job = { offer, stage: "carrying", deadline, pickedUpAt: now }
        this.sendState()
      } else if (there && stage === "carrying") {
        void this.deliver(this.job, now)
      } else if (now > this.job.deadline) {
        this.failJob(stage === "to_pickup" ? "no_show" : offer.kind === "boda" ? "gave_up" : "late")
      }
    }

    if (this.offers.some((candidate) => candidate.expiresAt <= now)) {
      this.fillOffers(now)
      this.sendState()
    }
  }

  private async deliver(job: ActiveJob, now: number) {
    const worker = this.worker
    if (!worker) return
    const { offer } = job
    this.job = null
    spendEnergy(worker, offer.energy)
    worker.pendingStress += HUSTLE_STRESS.paid

    let title: string
    let lines: ReceiptLine[]
    let net: number
    let meta: Record<string, unknown>
    let dailyLimit: number | undefined
    if (offer.kind === "boda") {
      const seconds = (now - (job.pickedUpAt ?? now)) / 1000
      const stats = this.bikeStats
      const payout = bodaPayout({
        fare: offer.fare,
        meters: offer.meters,
        seconds,
        fuelMeters: this.fuelMeters,
        fuelPerMeter: bikeFuelPerMeter(stats),
        patience: bikePatienceFactor(stats),
        tipFactor: bikeTipFactor(stats)
      })
      this.fuelMeters = 0
      void this.saveWear()
      title = `Dropped ${offer.passenger} at ${findPlace(offer.dropoffId)?.name ?? "their stop"}`
      lines = [
        { label: payout.late ? "Fare (late: half)" : offer.rush ? "Fare (rush hour)" : "Fare", amount: payout.fare },
        ...(payout.tip > 0 ? [{ label: "Tip", amount: payout.tip }] : []),
        { label: findBikeModel(this.ownBike?.model ?? "rental").build.electric ? "Battery" : "Fuel", amount: -payout.fuel }
      ]
      net = payout.net
      meta = { passenger: offer.passenger, from: offer.pickupId, to: offer.dropoffId, meters: offer.meters, ...payout, seconds: Math.round(seconds) }
      dailyLimit = BODA_DAILY_TRIPS
    } else {
      const load = PORTER_LOADS.find((candidate) => candidate.id === offer.loadId)?.name ?? "a load"
      title = `Delivered ${load}`
      lines = [{ label: "Pay", amount: offer.pay }]
      net = offer.pay
      meta = { load: offer.loadId, from: offer.pickupId, to: offer.dropoffId, meters: offer.meters, gross: offer.pay }
      dailyLimit = PORTER_DAILY_JOBS
    }
    this.sendState()

    let receipt: HustleReceipt
    if (!worker.userId) {
      receipt = { jobId: offer.id, paid: false, title, reason: "error", meters: offer.meters }
    } else {
      try {
        const userId = worker.userId
        const result = await withRetry("Hustle pay", () => payHustle({ userId, hustle: this.gig, jobId: offer.id, net, meta, dailyLimit }))
        receipt = result.ok
          ? { jobId: offer.id, paid: true, title, lines, net, meters: offer.meters, balance: result.balance }
          : { jobId: offer.id, paid: false, title, reason: result.reason, meters: offer.meters }
      } catch (error) {
        console.error("Failed to pay hustle:", error)
        receipt = { jobId: offer.id, paid: false, title, reason: "error", meters: offer.meters }
      }
    }
    if (receipt.paid) {
      this.shift.jobs++
      this.shift.earned += receipt.net
    }
    this.clients.find((candidate) => candidate.sessionId === worker.id)?.send("receipt", receipt)
    this.sendState()
    void this.body.flush([worker])
  }

  /** Your bike gave out mid-ride: the passenger gets off, and the roadside repair costs you. */
  private async breakDown() {
    const worker = this.worker
    if (!worker || !this.job) return
    this.failJob("broke_down")
    if (this.ownBike) {
      // Patched up enough to keep riding, but well worn.
      this.ownBike = { ...this.ownBike, wear: Math.max(this.ownBike.wear, 60) }
    }
    if (!worker.userId) return
    try {
      const input = { userId: worker.userId, refId: `${this.roomId}:breakdown:${++this.breakdowns}`, model: this.ownBike?.model ?? "rental" }
      const charged = await withRetry("Breakdown charge", () => chargeBreakdown(input))
      this.clients.find((candidate) => candidate.sessionId === worker.id)?.send("breakdown", { charged })
    } catch (error) {
      console.error("Failed to charge breakdown:", error)
    }
    this.sendState()
  }

  private async saveWear() {
    const bike = this.ownBike
    const km = this.wearKm
    if (!bike || km <= 0) return
    this.wearKm = 0
    try {
      const wear = await addBikeWear({ bikeId: bike.id, km })
      if (this.ownBike?.id === bike.id) this.ownBike = { ...this.ownBike, wear: Math.max(this.ownBike.wear, wear) }
    } catch (error) {
      this.wearKm += km
      console.error("Failed to save bike wear:", error)
    }
  }

  private failJob(reason: "abandoned" | "late" | "no_show" | "gave_up" | "broke_down") {
    const worker = this.worker
    const job = this.job
    if (!worker || !job) return
    this.job = null
    this.shift.failed++
    worker.pendingStress += HUSTLE_STRESS.failed
    // Hauling half the way still tired you out.
    if (job.stage === "carrying" && job.offer.kind === "porter") spendEnergy(worker, job.offer.energy / 2)
    this.clients.find((candidate) => candidate.sessionId === worker.id)?.send("jobFailed", { reason })
    this.sendState()
  }

  /** onDrop (reconnection failed) and onLeave can both end the shift: only the first counts. */
  private shiftEnded = false

  private async endShift() {
    if (this.shiftEnded) return
    this.shiftEnded = true
    if (this.job && this.job.stage === "carrying") this.failJob("abandoned")
    const worker = this.worker
    if (!worker) return
    void this.body.flush([worker])
    void this.saveWear()
    // Fuel burned after the last paid ride still has to be paid for.
    const fuel = bodaFuelCost(this.fuelMeters, bikeFuelPerMeter(this.bikeStats))
    this.fuelMeters = 0
    if (fuel > 0 && worker.userId) {
      try {
        const input = { userId: worker.userId, amount: fuel, refId: `${this.roomId}:fuel:${++this.fuelCharges}` }
        await withRetry("Fuel charge", () => chargeFuel(input))
      } catch (error) {
        console.error("Failed to charge fuel:", error)
      }
    }
  }

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
    const job = this.job
    this.clients.find((candidate) => candidate.sessionId === worker.id)?.send("hustle", {
      hustle: this.gig,
      startAt: worker.startAt,
      offers: this.offers.map((offer) => ({ ...offer, expiresInMs: Math.max(0, offer.expiresAt - now) })),
      // Remaining times rather than timestamps, so client clocks don't matter.
      job: job
        ? {
            offer: job.offer,
            stage: job.stage,
            remainingMs: Math.max(0, job.deadline - now),
            // Boda: time left for the full fare (after that, half).
            fullFareMs:
              job.offer.kind === "boda" && job.pickedUpAt !== null
                ? Math.max(0, job.pickedUpAt + bodaFullFareSeconds(job.offer.meters, bikePatienceFactor(this.bikeStats)) * 1000 - now)
                : null
          }
        : null,
      shift: this.shift,
      boda:
        this.gig === "boda"
          ? {
              bikeReady: this.bikeReady,
              rent: BODA_BIKE_RENT,
              rush: isRushHour(new Date(now)),
              fuel: bodaFuelCost(this.fuelMeters, bikeFuelPerMeter(this.bikeStats)),
              // Which bike you're on (the client mirrors its speed).
              bike: {
                own: this.ownBike !== null,
                name: findBikeModel(this.ownBike?.model ?? "rental").name,
                look: this.bikeLook,
                wear: Math.min(100, Math.round(this.bikeWear + (this.ownBike ? this.wearKm * bikeWearPerKm(this.bikeStats) : 0))),
                speedFactor: bikeSpeedFactor(this.bikeStats),
                patience: bikePatienceFactor(this.bikeStats)
              }
            }
          : null
    })
  }
}
