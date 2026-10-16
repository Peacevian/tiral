import { Room, Client, ServerError } from "@colyseus/core"
import {
  FRESH_ZONE,
  WASH_MIN_ACTION_MS,
  WASH_TOOLS,
  applyWash,
  CAR_WASH_DAILY_LIMIT,
  CAR_WASH_ENERGY,
  ROLEX_ENERGY_PER_ROLEX,
  ROLEX_FLIP_WINDOW,
  ROLEX_PATIENCE_SECONDS,
  ROLEX_RAID_RUN_SECONDS,
  STALL_STRESS,
  carPayout,
  findCarType,
  findRolexPack,
  findRolexSpot,
  pickCar,
  rolexSale,
  scoreFlip,
  type FlipResult,
  type WashTool,
  type WashZone
} from "@tiral/game-core"
import { buyRolexStock, chargeKccaFine, payHustle } from "@tiral/db"
import { verifyJoinToken, type JoinIdentity } from "../auth.js"
import { withRetry } from "../retry.js"
import { announceUnlocks, refuseLockedGig } from "../ladder.js"
import { testOverride } from "../testOverrides.js"
import {
  BodySync,
  MAX_MESSAGES_PER_SECOND,
  MessageThrottle,
  NEEDS_FLUSH_MS,
  REFRESH_NEEDS_MS,
  guarded,
  freshBody,
  spendEnergy,
  tiredReason,
  type Runner
} from "./runner.js"

const TICK_MS = 100
const RECONNECT_SECONDS = 30
const MAX_QUEUE = 4
/** Seconds after cooking starts that an unflipped egg burns on its own. */
const AUTO_BURN_SECONDS = ROLEX_FLIP_WINDOW.end + 1.5
/** Test overrides (like RACE_ARRIVAL_RADIUS): force raids / busier stalls. */
const RAID_CHANCE = testOverride("STALL_RAID_CHANCE")
const CUSTOMER_RATE = testOverride("STALL_CUSTOMER_RATE")
const RAID_DELAY_SECONDS = testOverride("STALL_RAID_DELAY")

type Stall = "rolex" | "carwash"

type Customer = { id: string; wants: number; served: number; earned: number; leavesAt: number }
type Cooking = { customerId: string; startedAt: number }
type Zone = WashZone & { id: number; lastAction: Partial<Record<WashTool, number>> }
type Car = { id: string; typeId: string; zones: Zone[]; arrivedAt: number; deadline: number }

type Summary = { spent: number; earned: number; served: number; spoiled: number; fined: number; outcome: string }

/**
 * Mini-game hustles at a stall (no map): the rolex stand and the car wash.
 * The server spawns customers/cars, timestamps cooking and scrubbing, and
 * pays through the ledger. Clients only send taps.
 */
export class StallRoom extends Room {
  maxClients = 1
  // The car wash sends a stream of wash strokes, so this room allows more.
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND.stall
  private readonly throttle = new MessageThrottle()

  private stall: Stall = "rolex"
  private worker: (Runner & { name: string }) | null = null
  private phase: "setup" | "open" | "raid" | "closed" = "setup"
  private seq = 0
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly body = new BodySync((runner, message, payload) => {
    this.clients.find((candidate) => candidate.sessionId === runner.id)?.send(message, payload)
  })
  private summary: Summary = { spent: 0, earned: 0, served: 0, spoiled: 0, fined: 0, outcome: "" }

  // Rolex stand
  private spotId = "kikuubo"
  private stock = 0
  private customers: Customer[] = []
  private cooking: Cooking | null = null
  private lastFlip: { result: FlipResult; at: number } | null = null
  private raidAt: number | null = null
  private raidDeadline: number | null = null
  private buying = false

  // Car wash
  private car: Car | null = null
  private nextCarAt: number | null = null
  private carsDone = 0

  static async onAuth(token: unknown, options: any) {
    const identity = await verifyJoinToken(token)
    if (identity.guest) throw new ServerError(401, "Sign in to hustle")
    // The hustle ladder: the car wash and the rolex stand are earned.
    await refuseLockedGig(identity.userId, options?.stall === "carwash" ? "carwash" : "rolex")
    return identity
  }

  onCreate(options: any) {
    this.stall = options?.stall === "carwash" ? "carwash" : "rolex"
    this.setPrivate(true)
    if (this.stall === "carwash") {
      this.phase = "open"
      this.nextCarAt = Date.now() + 2_000
    }

    this.onMessage("buyStock", (client, input: { pack?: string; spot?: string }) => void this.buyStock(client, input))
    this.onMessage("cook", (client, customerId: string) => this.cook(client, customerId))
    this.onMessage("flip", (client) => this.flip(client))
    this.onMessage("run", (client) => this.run(client))
    this.onMessage("wash", (client, input: { zone?: number; tool?: string }) => this.wash(client, input))
    this.onMessage("finishCar", (client) => void this.finishCar(client))
    this.onMessage("close", (client) => {
      if (this.own(client)) void this.close("closed")
    })
    this.onMessage("refreshNeeds", (client) => {
      if (this.own(client) && this.worker && this.throttle.allow(client.sessionId, "refreshNeeds", REFRESH_NEEDS_MS)) {
        void this.body.flush([this.worker], true)
      }
    })

    this.tickInterval = setInterval(guarded("stall tick", () => this.tick()), TICK_MS)
    this.flushInterval = setInterval(
      guarded("stall needs flush", () => (this.worker ? this.body.flush([this.worker]) : undefined)),
      NEEDS_FLUSH_MS
    )
  }

  /** An error in a message handler or room method: log it, keep the server alive. */
  onUncaughtException(error: unknown, methodName: string) {
    console.error(`[stall ${this.roomId}] ${methodName} failed:`, error)
  }

  onJoin(client: Client, _options: any, auth?: JoinIdentity) {
    const verified = auth && !auth.guest ? auth : null
    if (this.worker?.id === client.sessionId) return this.sendState()
    const worker = {
      id: client.sessionId,
      userId: verified?.userId ?? null,
      name: verified?.displayName ?? "Worker",
      roadPosition: null,
      coordinate: null,
      moving: false,
      turnIntent: null,
      ...freshBody()
    }
    this.worker = worker
    void this.body.load(worker, () => this.worker === worker)
    this.sendState()
  }

  async onDrop(client: Client) {
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS)
      this.sendState()
    } catch {
      void this.close("left")
    }
  }

  onLeave() {
    void this.close("left")
  }

  onDispose() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.flushInterval) clearInterval(this.flushInterval)
    if (this.worker) void this.body.flush([this.worker])
  }

  private own(client: Client) {
    return this.worker && this.worker.id === client.sessionId ? this.worker : null
  }

  private lastTiredNotice = 0

  /** Refuse work the worker has no energy for (or before their energy is known); tells them at most every 3 s. */
  private refuseIfTired(client: Client, amount: number): boolean {
    const reason = this.worker ? tiredReason(this.worker, amount) : null
    if (!reason) return false
    const now = Date.now()
    if (now - this.lastTiredNotice > 3000) {
      this.lastTiredNotice = now
      client.send("notice", reason)
    }
    return true
  }

  private tell(type: string, payload: unknown) {
    const worker = this.worker
    if (worker) this.clients.find((candidate) => candidate.sessionId === worker.id)?.send(type, payload)
  }

  // ---------------------------------------------------------------------------
  // Rolex stand

  private async buyStock(client: Client, input: { pack?: string; spot?: string }) {
    const worker = this.own(client)
    if (!worker?.userId || this.stall !== "rolex" || this.phase !== "setup" || this.buying) return
    const pack = findRolexPack(String(input?.pack ?? ""))
    const spot = findRolexSpot(String(input?.spot ?? ""))
    if (!pack || !spot) return
    this.buying = true
    try {
      const result = await buyRolexStock({ userId: worker.userId, packId: pack.id, shiftId: this.roomId, spot: spot.id })
      if (!result.ok) {
        const text =
          result.reason === "insufficient"
            ? `You need ${pack.price.toLocaleString("en-US")} BNG for that stock.`
            : result.reason === "daily_limit"
              ? "That's two rolex shifts today. Come back tomorrow."
              : "Pick a stock pack."
        return client.send("notice", text)
      }
      this.spotId = spot.id
      this.stock = result.rolexes
      this.summary.spent = pack.price
      this.phase = "open"
      const now = Date.now()
      // Some shifts get raided, some minutes in.
      if (Math.random() < (RAID_CHANCE ?? spot.raidChance)) {
        this.raidAt = now + (RAID_DELAY_SECONDS ?? 30 + Math.random() * 90) * 1000
      }
      client.send("stockBought", { amount: pack.price, balance: result.balance })
      // Rolex shifts count towards selling on live.
      announceUnlocks(worker.userId, (text) => this.tell("notice", text))
      this.sendState()
    } catch (error) {
      console.error("Stock purchase failed:", error)
      client.send("notice", "Couldn't buy stock right now. Try again.")
    } finally {
      this.buying = false
    }
  }

  private cook(client: Client, customerId: string) {
    if (!this.own(client) || this.phase !== "open" || this.cooking || this.stock <= 0) return
    if (this.refuseIfTired(client, ROLEX_ENERGY_PER_ROLEX)) return
    const customer = this.customers.find((candidate) => candidate.id === customerId)
    if (!customer || customer.served >= customer.wants) return
    this.stock--
    this.cooking = { customerId, startedAt: Date.now() }
    this.sendState()
  }

  private flip(client: Client) {
    if (!this.own(client) || !this.cooking) return
    this.finishCooking(scoreFlip((Date.now() - this.cooking.startedAt) / 1000))
  }

  private finishCooking(result: FlipResult) {
    const cooking = this.cooking
    const worker = this.worker
    if (!cooking || !worker) return
    this.cooking = null
    this.lastFlip = { result, at: Date.now() }
    spendEnergy(worker, ROLEX_ENERGY_PER_ROLEX)
    const customer = this.customers.find((candidate) => candidate.id === cooking.customerId)
    if (customer && result !== "burnt") {
      customer.served++
      customer.earned += rolexSale(result)
      if (customer.served >= customer.wants) void this.payCustomer(customer, "happy")
    }
    this.sendState()
  }

  /** A customer pays for what they got, then leaves. */
  private async payCustomer(customer: Customer, mood: "happy" | "gave_up") {
    this.customers = this.customers.filter((candidate) => candidate.id !== customer.id)
    const worker = this.worker
    if (customer.earned <= 0 || !worker?.userId) {
      this.tell("stallEvent", { kind: "customer_left", mood })
      return
    }
    // Count and announce the sale only once the ledger has it, so the summary
    // never shows unpaid money.
    let paid = false
    const userId = worker.userId
    try {
      const result = await withRetry("Rolex sale", () =>
        payHustle({
          userId,
          hustle: "rolex",
          jobId: `${this.roomId}:${customer.id}`,
          net: customer.earned,
          meta: { rolexes: customer.served, spot: this.spotId }
        })
      )
      paid = result.ok
    } catch (error) {
      console.error("Failed to pay rolex sale:", error)
    }
    if (paid) {
      this.summary.earned += customer.earned
      this.summary.served += customer.served
      this.tell("stallEvent", { kind: "sale", amount: customer.earned, rolexes: customer.served, mood })
    } else {
      this.tell("notice", "That sale didn't go through (payment error). Keep cooking, the next one should.")
    }
    this.sendState()
  }

  private run(client: Client) {
    if (!this.own(client) || this.phase !== "raid") return
    void this.close("escaped")
  }

  private tickRolex(now: number) {
    if (this.phase === "open") {
      const spot = findRolexSpot(this.spotId)!
      // Customers turn up at the spot's rate.
      if (this.customers.length < MAX_QUEUE && this.stock > 0 && Math.random() < ((CUSTOMER_RATE ?? spot.customersPerMinute) / 60) * (TICK_MS / 1000)) {
        this.customers.push({
          id: String(++this.seq),
          wants: Math.random() < 0.3 ? 2 : 1,
          served: 0,
          earned: 0,
          leavesAt: now + ROLEX_PATIENCE_SECONDS * 1000
        })
        this.sendState()
      }
      // Waiting too long: they leave (paying for anything already served).
      for (const customer of [...this.customers]) {
        const beingServed = this.cooking?.customerId === customer.id
        if (now >= customer.leavesAt && !beingServed) void this.payCustomer(customer, "gave_up")
      }
      if (this.cooking && now - this.cooking.startedAt >= AUTO_BURN_SECONDS * 1000) this.finishCooking("burnt")
      if (this.raidAt !== null && now >= this.raidAt) {
        this.raidAt = null
        this.phase = "raid"
        this.raidDeadline = now + ROLEX_RAID_RUN_SECONDS * 1000
        this.cooking = null
        this.sendState()
      }
      // Sold out and nobody waiting on food: the shift is done.
      if (this.stock <= 0 && !this.cooking && this.customers.every((customer) => customer.served >= customer.wants)) {
        void this.close("sold_out")
      }
    } else if (this.phase === "raid" && this.raidDeadline !== null && now >= this.raidDeadline) {
      void this.close("raided")
    }
  }

  // ---------------------------------------------------------------------------
  // Car wash

  /** One soap / scrub / rinse action on a zone of the car. */
  private wash(client: Client, input: { zone?: number; tool?: string }) {
    if (!this.own(client) || this.stall !== "carwash" || !this.car) return
    const tool = WASH_TOOLS.find((candidate) => candidate === input?.tool)
    const zone = this.car.zones.find((candidate) => candidate.id === input?.zone)
    const now = Date.now()
    if (!tool || !zone || zone.clean) return
    // The car's energy is spent when it's done; don't start work you can't finish.
    if (this.refuseIfTired(client, CAR_WASH_ENERGY)) return
    // A real hand can't act on one spot faster than this.
    if (now - (zone.lastAction[tool] ?? 0) < WASH_MIN_ACTION_MS) return
    zone.lastAction[tool] = now
    Object.assign(zone, applyWash(zone, tool))
    this.sendState()
  }

  private async finishCar(client?: Client) {
    if (client && !this.own(client)) return
    const car = this.car
    const worker = this.worker
    if (!car || !worker) return
    this.car = null
    this.nextCarAt = Date.now() + (5 + Math.random() * 8) * 1000
    const clean = car.zones.filter((zone) => zone.clean).length
    const payout = carPayout({ carId: car.typeId, cleanZones: clean, secondsUsed: (Date.now() - car.arrivedAt) / 1000 })
    spendEnergy(worker, CAR_WASH_ENERGY)
    let paid = false
    let limit = false
    // Why a clean enough car still wasn't paid: no account, or the payment failed.
    let unpaid: "guest" | "error" | null = null
    if (payout.net > 0 && !worker.userId) unpaid = "guest"
    if (payout.net > 0 && worker.userId) {
      try {
        const userId = worker.userId
        const result = await withRetry("Car wash pay", () =>
          payHustle({
            userId,
            hustle: "carwash",
            jobId: `${this.roomId}:${car.id}`,
            net: payout.net,
            meta: { car: car.typeId, ...payout },
            dailyLimit: CAR_WASH_DAILY_LIMIT
          })
        )
        paid = result.ok
        limit = !result.ok && result.reason === "daily_limit"
      } catch (error) {
        console.error("Failed to pay car wash:", error)
      }
      if (!paid && !limit) unpaid = "error"
    }
    if (paid) {
      this.summary.earned += payout.net
      this.summary.served++
      this.carsDone++
      announceUnlocks(worker.userId!, (text) => this.tell("notice", text))
    }
    this.tell("stallEvent", { kind: "car_done", car: car.typeId, ...payout, paid, limit, unpaid })
    this.sendState()
  }

  private tickCarwash(now: number) {
    if (this.phase !== "open") return
    if (!this.car && this.nextCarAt !== null && now >= this.nextCarAt) {
      const type = pickCar(Math.random())
      this.car = {
        id: String(++this.seq),
        typeId: type.id,
        zones: Array.from({ length: type.zones }, (_, index) => ({ id: index, ...FRESH_ZONE, lastAction: {} })),
        arrivedAt: now,
        deadline: now + type.seconds * 1000
      }
      this.nextCarAt = null
      this.sendState()
    }
    if (this.car && now >= this.car.deadline) void this.finishCar()
  }

  // ---------------------------------------------------------------------------

  private tick() {
    const now = Date.now()
    if (this.stall === "rolex") this.tickRolex(now)
    else this.tickCarwash(now)
    if (this.worker) this.body.sendDue([this.worker], now)
  }

  private async close(outcome: "closed" | "left" | "sold_out" | "escaped" | "raided") {
    if (this.phase === "closed") return
    const worker = this.worker
    const raided = outcome === "raided"
    this.phase = "closed"
    this.cooking = null
    // Anyone part-served still pays for what they got.
    for (const customer of [...this.customers]) if (customer.earned > 0) await this.payCustomer(customer, "happy")
    this.customers = []
    this.car = null
    // Unsold stock spoils.
    this.summary.spoiled = this.stock
    this.stock = 0
    if (raided && worker?.userId) {
      try {
        const userId = worker.userId
        this.summary.fined = await withRetry("KCCA fine", () => chargeKccaFine({ userId, refId: `${this.roomId}:kcca`, spot: this.spotId }))
      } catch (error) {
        console.error("Failed to charge KCCA fine:", error)
      }
    }
    if (worker) {
      if (raided) worker.pendingStress += STALL_STRESS.raided
      else if (this.summary.earned - this.summary.spent > 0) worker.pendingStress += STALL_STRESS.goodShift
      void this.body.flush([worker])
    }
    this.summary.outcome = outcome
    this.sendState()
  }

  private sendState() {
    const now = Date.now()
    const remaining = (at: number | null) => (at === null ? null : Math.max(0, at - now))
    this.tell("stall", {
      stall: this.stall,
      phase: this.phase,
      spot: this.spotId,
      stock: this.stock,
      customers: this.customers.map((customer) => ({ ...customer, leavesInMs: remaining(customer.leavesAt) })),
      cooking: this.cooking ? { customerId: this.cooking.customerId, elapsedMs: now - this.cooking.startedAt } : null,
      lastFlip: this.lastFlip ? { result: this.lastFlip.result, agoMs: now - this.lastFlip.at } : null,
      raidInMs: this.phase === "raid" ? remaining(this.raidDeadline) : null,
      car: this.car
        ? {
            id: this.car.id,
            type: this.car.typeId,
            name: findCarType(this.car.typeId)?.name,
            zones: this.car.zones.map((zone) => ({
              id: zone.id,
              soap: Math.round(zone.soap * 100) / 100,
              dirt: Math.round(zone.dirt * 100) / 100,
              clean: zone.clean
            })),
            leftMs: remaining(this.car.deadline)
          }
        : null,
      carsDone: this.carsDone,
      summary: this.summary
    })
  }
}
