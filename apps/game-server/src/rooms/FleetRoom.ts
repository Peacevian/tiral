import { Room, Client, ServerError } from "@colyseus/core"
import {
  ADVANCE_REPAY_CHANCE,
  ADVANCE_THANKS,
  EVENT_CHOICE_SECONDS,
  EVENT_GAP_SECONDS,
  FLEET_ENERGY,
  FLEET_EVENTS,
  FLEET_PLACES,
  FLEET_SHIFT_SECONDS,
  FUEL_SPIKE_SECONDS,
  GARAGE_SECONDS,
  HIRE_BONUS,
  HIRE_SECONDS,
  RUN_SECONDS,
  SULK_FACTOR,
  SULK_SECONDS,
  breakdownChance,
  findFleetModel,
  hireRider,
  pickFleetEvent,
  recoveryChance,
  runDues,
  type FleetEventKind
} from "@tiral/game-core"
import { buyFleetBike, fitFleetTracker, getFleet, getTier, payFleetCost, serviceFleetBike, settleFleetShift, type FleetBike } from "@tiral/db"
import { verifyJoinToken, type JoinIdentity } from "../auth.js"
import { withRetry } from "../retry.js"
import { testOverride } from "../testOverrides.js"
import { BodySync, MessageThrottle, NEEDS_FLUSH_MS, REFRESH_NEEDS_MS, freshBody, guarded, spendEnergy, tiredReason, type Runner } from "./runner.js"

const TICK_MS = 250
const RECONNECT_SECONDS = 30
/** Extra wear when a bike crashes. */
const CRASH_WEAR = 10
/** Info-only events (fuel prices) clear themselves after this long. */
const INFO_SECONDS = 5
// Test benches: a shorter shift and more frequent events.
const SHIFT_SECONDS = testOverride("FLEET_SHIFT_SECONDS") ?? FLEET_SHIFT_SECONDS
const EVENT_GAP_OVERRIDE = testOverride("FLEET_EVENT_GAP_SECONDS")
const EVENT_GAP: readonly [number, number] = EVENT_GAP_OVERRIDE !== null ? [EVENT_GAP_OVERRIDE, EVENT_GAP_OVERRIDE + 2] : EVENT_GAP_SECONDS

type BikeState = "idle" | "road" | "garage" | "impounded" | "hire" | "stolen"
type Bike = FleetBike & {
  state: BikeState
  /** When the run, repair or hire ends. */
  until: number | null
  runStartedAt: number | null
  sulkUntil: number
  /** Dues this bike brought in this shift. */
  earned: number
  runs: number
}
type Option = { id: "pay" | "free"; label: string; cost: number }
type FleetEvent = { id: number; kind: FleetEventKind; bikeId: string | null; text: string; options: Option[]; expiresAt: number; resolving: boolean }
type Summary = { runs: number; dues: number; bonuses: number; repaid: number; costs: number; net: number; stolen: number; breakdowns: number }

const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!
const between = ([low, high]: readonly [number, number]) => low + Math.random() * (high - low)

/**
 * Boda fleet (tier 3): the office (your bikes, the garage, buying more), then
 * a FLEET_SHIFT_SECONDS shift where you send riders out, they bring dues
 * back, and events ask for quick choices. Costs are paid as they happen; the
 * dues are paid once at the end through the ledger. Clients only send taps.
 */
export class FleetRoom extends Room {
  maxClients = 1
  private readonly throttle = new MessageThrottle()
  private worker: (Runner & { name: string }) | null = null
  private phase: "office" | "shift" | "closed" = "office"
  private bikes: Bike[] = []
  private busy = false
  private purchases = 0
  private shifts = 0

  private endsAt = 0
  private nextEventAt = 0
  private event: FleetEvent | null = null
  private eventSeq = 0
  private fuelSpikeUntil = 0
  private dues = 0
  private bonuses = 0
  private costs = 0
  private breakdowns = 0
  private advances: Array<{ rider: string; amount: number }> = []
  private log: Array<{ id: number; text: string; tone: "good" | "bad" | "info" }> = []
  private logSeq = 0
  private summary: Summary | null = null
  private settling = false

  private tickInterval: ReturnType<typeof setInterval> | null = null
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly body = new BodySync((runner, message, payload) => {
    this.clients.find((candidate) => candidate.sessionId === runner.id)?.send(message, payload)
  })

  static async onAuth(token: unknown) {
    const identity = await verifyJoinToken(token)
    if (identity.guest) throw new ServerError(401, "Sign in to run a boda fleet")
    const tier = await withRetry("Tier check", () => getTier(identity.userId))
    if (tier === "street" || tier === "small") throw new ServerError(403, "Move up to Town business to run a boda fleet.")
    return identity
  }

  onCreate() {
    this.setPrivate(true)
    this.onMessage("buyBike", (client, model: string) => void this.buyBike(client, String(model ?? "")))
    this.onMessage("service", (client, bikeId: string) => void this.service(client, String(bikeId ?? "")))
    this.onMessage("tracker", (client, bikeId: string) => void this.tracker(client, String(bikeId ?? "")))
    this.onMessage("startShift", (client) => this.startShift(client))
    this.onMessage("send", (client, bikeId: string) => this.sendBike(client, String(bikeId ?? "")))
    this.onMessage("sendAll", (client) => {
      if (!this.own(client) || this.phase !== "shift") return
      for (const bike of this.bikes) if (bike.state === "idle") this.sendOut(bike, Date.now())
      this.sendState()
    })
    this.onMessage("choose", (client, option: string) => void this.choose(client, option === "pay" ? "pay" : "free"))
    this.onMessage("end", (client) => {
      if (this.own(client) && this.phase === "shift") void this.endShift()
    })
    this.onMessage("again", (client) => {
      if (this.own(client) && this.phase === "closed" && !this.settling) {
        this.phase = "office"
        this.summary = null
        void this.reload()
      }
    })
    this.onMessage("refreshNeeds", (client) => {
      if (this.own(client) && this.worker && this.throttle.allow(client.sessionId, "refreshNeeds", REFRESH_NEEDS_MS)) {
        void this.body.flush([this.worker], true)
      }
    })
    this.tickInterval = setInterval(guarded("fleet tick", () => this.tick()), TICK_MS)
    this.flushInterval = setInterval(guarded("fleet needs flush", () => (this.worker ? this.body.flush([this.worker]) : undefined)), NEEDS_FLUSH_MS)
  }

  async onJoin(client: Client, _options: unknown, auth?: JoinIdentity) {
    if (this.worker?.id === client.sessionId) return this.sendState()
    const verified = auth && !auth.guest ? auth : null
    const worker = { id: client.sessionId, userId: verified?.userId ?? null, name: verified?.displayName ?? "Boss", roadPosition: null, coordinate: null, moving: false, turnIntent: null, ...freshBody() }
    this.worker = worker
    void this.body.load(worker, () => this.worker === worker)
    await this.reload()
  }

  async onDrop(client: Client) {
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS)
      this.sendState()
    } catch {
      if (this.phase === "shift") await this.endShift()
    }
  }

  async onLeave() {
    if (this.phase === "shift") await this.endShift()
  }

  onDispose() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.flushInterval) clearInterval(this.flushInterval)
    if (this.worker) void this.body.flush([this.worker])
  }

  onUncaughtException(error: unknown, methodName: string) {
    console.error(`[fleet ${this.roomId}] ${methodName} failed:`, error)
  }

  private own(client: Client) {
    return this.worker && this.worker.id === client.sessionId ? this.worker : null
  }

  private tell(type: string, payload: unknown) {
    const worker = this.worker
    if (worker) this.clients.find((candidate) => candidate.sessionId === worker.id)?.send(type, payload)
  }

  private note(text: string, tone: "good" | "bad" | "info" = "info") {
    this.log.push({ id: ++this.logSeq, text, tone })
    if (this.log.length > 8) this.log.splice(0, this.log.length - 8)
  }

  private async reload() {
    const userId = this.worker?.userId
    if (userId) {
      const fleet = await withRetry("Fleet", () => getFleet(userId))
      this.bikes = fleet.map((bike) => ({ ...bike, state: "idle", until: null, runStartedAt: null, sulkUntil: 0, earned: 0, runs: 0 }))
    }
    this.sendState()
  }

  // ---------------------------------------------------------------------------
  // The office

  private async officeAction(client: Client, action: (userId: string) => Promise<{ ok: boolean; reason?: string }>, failure: (reason: string) => string) {
    const worker = this.own(client)
    if (!worker?.userId || this.phase !== "office" || this.busy) return
    this.busy = true
    try {
      const result = await action(worker.userId)
      if (!result.ok) client.send("notice", failure(result.reason ?? ""))
      await this.reload()
    } catch (error) {
      console.error("Fleet office action failed:", error)
      client.send("notice", "That didn't go through. Try again.")
    } finally {
      this.busy = false
      this.sendState()
    }
  }

  private buyBike(client: Client, modelId: string) {
    const model = findFleetModel(modelId)
    if (!model) return
    const { rider, skill } = hireRider(Math.random, this.bikes.map((bike) => bike.rider))
    return this.officeAction(
      client,
      (userId) => withRetry("Fleet bike", () => buyFleetBike({ userId, model: model.id, refId: `${this.roomId}:bike:${++this.purchases}`, rider, skill })),
      (reason) => (reason === "full" ? "Your fleet is full (20 bikes)." : reason === "insufficient" ? "Not enough BNG for that bike." : "Couldn't buy the bike.")
    )
  }

  private service(client: Client, bikeId: string) {
    return this.officeAction(
      client,
      (userId) => withRetry("Fleet service", () => serviceFleetBike({ userId, bikeId, refId: `${this.roomId}:service:${++this.purchases}` })),
      (reason) => (reason === "insufficient" ? "Not enough BNG for the service." : "Couldn't service that bike.")
    )
  }

  private tracker(client: Client, bikeId: string) {
    return this.officeAction(
      client,
      (userId) => withRetry("Fleet tracker", () => fitFleetTracker({ userId, bikeId, refId: `${this.roomId}:tracker:${++this.purchases}` })),
      (reason) => (reason === "insufficient" ? "Not enough BNG for a tracker." : "Couldn't fit the tracker.")
    )
  }

  // ---------------------------------------------------------------------------
  // The shift

  private startShift(client: Client) {
    const worker = this.own(client)
    if (!worker || this.phase !== "office" || this.busy) return
    const tired = tiredReason(worker, FLEET_ENERGY)
    if (tired) return client.send("notice", tired)
    if (this.bikes.length === 0) return client.send("notice", "No bikes in your fleet. Buy one first.")
    spendEnergy(worker, FLEET_ENERGY)
    void this.body.flush([worker])
    const now = Date.now()
    this.phase = "shift"
    this.shifts++
    this.endsAt = now + SHIFT_SECONDS * 1000
    this.nextEventAt = now + between(EVENT_GAP) * 1000
    this.event = null
    this.fuelSpikeUntil = 0
    this.dues = 0
    this.bonuses = 0
    this.costs = 0
    this.breakdowns = 0
    this.advances = []
    this.log = []
    for (const bike of this.bikes) Object.assign(bike, { state: "idle", until: null, runStartedAt: null, sulkUntil: 0, earned: 0, runs: 0 })
    this.note("Shift started. Send your riders out!", "info")
    this.sendState()
  }

  private sendBike(client: Client, bikeId: string) {
    if (!this.own(client) || this.phase !== "shift") return
    const bike = this.bikes.find((candidate) => candidate.id === bikeId)
    if (bike?.state === "idle") this.sendOut(bike, Date.now())
    this.sendState()
  }

  private sendOut(bike: Bike, now: number) {
    bike.state = "road"
    bike.runStartedAt = now
    bike.until = now + between(RUN_SECONDS) * 1000
  }

  /** The dues for a run so far (it ends now, early or on time). */
  private collect(bike: Bike, now: number): number {
    if (bike.runStartedAt === null) return 0
    const seconds = Math.max(0, (now - bike.runStartedAt) / 1000)
    const sulking = now < bike.sulkUntil ? SULK_FACTOR : 1
    const dues = runDues({ model: bike.model, seconds, skill: bike.skill * sulking, wear: bike.wear, fuelSpike: now < this.fuelSpikeUntil })
    bike.earned += dues
    bike.runs++
    bike.runStartedAt = null
    bike.wear = Math.min(100, bike.wear + (findFleetModel(bike.model)?.wearPerRun ?? 5) * Math.min(1, seconds / RUN_SECONDS[0]))
    this.dues += dues
    return dues
  }

  private tick() {
    const now = Date.now()
    if (this.worker) this.body.sendDue([this.worker], now)
    if (this.phase !== "shift") return
    if (now >= this.endsAt) {
      void this.endShift()
      return
    }
    for (const bike of this.bikes) {
      if (bike.until === null || now < bike.until) continue
      if (bike.state === "road") {
        const dues = this.collect(bike, now)
        if (Math.random() < breakdownChance(bike.wear)) {
          this.breakdowns++
          bike.state = "garage"
          bike.until = now + GARAGE_SECONDS * 1000
          this.note(`${bike.rider}'s bike broke down after a ${dues.toLocaleString("en-US")} run. In the garage for a minute.`, "bad")
        } else {
          bike.state = "idle"
          bike.until = null
          this.note(`${bike.rider} is back: +${dues.toLocaleString("en-US")}`, "good")
        }
      } else if (bike.state === "hire") {
        this.bonuses += HIRE_BONUS
        bike.state = "idle"
        bike.until = null
        this.note(`${bike.rider} is back from the special hire: +${HIRE_BONUS.toLocaleString("en-US")}`, "good")
      } else if (bike.state === "garage") {
        bike.state = "idle"
        bike.until = null
        this.note(`${bike.rider}'s bike is fixed and ready.`, "info")
      }
    }
    const event = this.event
    if (event && !event.resolving && now >= event.expiresAt) void this.resolve(event, "free")
    if (!this.event && now >= this.nextEventAt) this.raiseEvent(now)
    this.sendState()
  }

  private raiseEvent(now: number) {
    this.nextEventAt = now + between(EVENT_GAP) * 1000
    const onRoad = this.bikes.filter((bike) => bike.state === "road")
    const idle = this.bikes.filter((bike) => bike.state === "idle")
    const allowed: FleetEventKind[] = []
    if (onRoad.length > 0) allowed.push("crash", "police", "theft")
    if (this.bikes.some((bike) => bike.state !== "stolen")) allowed.push("advance")
    if (now >= this.fuelSpikeUntil) allowed.push("fuel")
    if (idle.length > 0) allowed.push("hire")
    const kind = pickFleetEvent(Math.random, allowed)
    if (!kind) return
    const place = pick(FLEET_PLACES)
    const cost = FLEET_EVENTS[kind].cost
    const amount = cost.toLocaleString("en-US")
    const choose = (bikes: Bike[]) => pick(bikes)
    let bike: Bike | null = null
    let text = ""
    let options: Option[] = []
    switch (kind) {
      case "crash":
        bike = choose(onRoad)
        text = `${bike.rider} crashed at ${place}! He's fine, the bike isn't.`
        options = [{ id: "pay", label: `Repair now (${amount})`, cost }, { id: "free", label: "Park it for a minute", cost: 0 }]
        break
      case "police":
        bike = choose(onRoad)
        text = `Police checkpoint at ${place}: ${bike.rider}'s papers are missing.`
        options = [{ id: "pay", label: `Pay the fine (${amount})`, cost }, { id: "free", label: "Refuse: bike held all shift", cost: 0 }]
        break
      case "theft":
        bike = choose(onRoad)
        text = `${bike.rider}'s bike was stolen at ${place}!${bike.tracker ? " It has a tracker." : ""}`
        options = [{ id: "pay", label: `Report it (${amount})`, cost }, { id: "free", label: "Leave it", cost: 0 }]
        break
      case "advance":
        bike = choose(this.bikes.filter((candidate) => candidate.state !== "stolen"))
        text = `${bike.rider} asks for an advance of ${amount}: his child's school fees.`
        options = [{ id: "pay", label: `Lend ${amount}`, cost }, { id: "free", label: "Refuse", cost: 0 }]
        break
      case "fuel":
        text = "Fuel prices went up! Petrol bikes bring in 20% less for a while."
        options = [{ id: "free", label: "OK", cost: 0 }]
        this.fuelSpikeUntil = now + FUEL_SPIKE_SECONDS * 1000
        break
      case "hire":
        bike = choose(idle)
        text = `A wedding convoy at ${place} wants a boda. Send ${bike.rider}?`
        options = [{ id: "pay", label: `Send him (+${HIRE_BONUS.toLocaleString("en-US")})`, cost: 0 }, { id: "free", label: "Not now", cost: 0 }]
        break
    }
    const seconds = kind === "fuel" ? INFO_SECONDS : EVENT_CHOICE_SECONDS
    this.event = { id: ++this.eventSeq, kind, bikeId: bike?.id ?? null, text, options, expiresAt: now + seconds * 1000, resolving: false }
  }

  private async choose(client: Client, option: "pay" | "free") {
    const event = this.event
    if (!this.own(client) || this.phase !== "shift" || !event || event.resolving) return
    if (!event.options.some((candidate) => candidate.id === option)) return
    await this.resolve(event, option)
  }

  private async resolve(event: FleetEvent, option: "pay" | "free") {
    event.resolving = true
    const now = Date.now()
    const bike = this.bikes.find((candidate) => candidate.id === event.bikeId) ?? null
    const cost = event.options.find((candidate) => candidate.id === option)?.cost ?? 0
    let paid = false
    if (option === "pay" && cost > 0) {
      paid = await this.charge(event, cost)
      // Couldn't pay: the free option happens instead.
      if (!paid) option = "free"
    }
    if (this.event !== event || this.phase !== "shift") return
    switch (event.kind) {
      case "crash":
        if (bike && bike.state === "road") {
          this.collect(bike, now)
          bike.wear = Math.min(100, bike.wear + CRASH_WEAR)
          if (option === "pay") {
            bike.state = "idle"
            bike.until = null
            this.note(`${bike.rider}'s bike is repaired. Send him out again.`, "info")
          } else {
            bike.state = "garage"
            bike.until = now + GARAGE_SECONDS * 1000
            this.note(`${bike.rider}'s bike is parked for a minute.`, "bad")
          }
        }
        break
      case "police":
        if (bike && bike.state === "road") {
          if (option === "pay") {
            this.note(`Fine paid. ${bike.rider} rides on.`, "info")
          } else {
            this.collect(bike, now)
            bike.state = "impounded"
            bike.until = null
            this.note(`${bike.rider}'s bike is held at the station for the rest of the shift.`, "bad")
          }
        }
        break
      case "theft":
        if (bike && bike.state === "road") {
          this.collect(bike, now)
          const chance = option === "pay" ? recoveryChance(bike.tracker) : bike.tracker ? 0.5 : 0
          if (Math.random() < chance) {
            bike.state = "garage"
            bike.until = now + GARAGE_SECONDS * 1000
            this.note(`Recovered ${bike.rider}'s bike${bike.tracker ? " (the tracker found it)" : ""}! Checked over in the garage.`, "good")
          } else {
            bike.state = "stolen"
            bike.until = null
            this.note(`${bike.rider}'s bike is gone for good.`, "bad")
          }
        }
        break
      case "advance":
        if (bike) {
          if (option === "pay") {
            this.advances.push({ rider: bike.rider, amount: cost })
            this.note(`Lent ${bike.rider} ${cost.toLocaleString("en-US")}.`, "info")
          } else {
            bike.sulkUntil = now + SULK_SECONDS * 1000
            this.note(`${bike.rider} is sulking: he'll bring in less for a while.`, "bad")
          }
        }
        break
      case "hire":
        if (bike && bike.state === "idle" && option === "pay") {
          bike.state = "hire"
          bike.until = now + HIRE_SECONDS * 1000
          this.note(`${bike.rider} is off to the wedding convoy.`, "info")
        }
        break
      case "fuel":
        break
    }
    this.event = null
    this.sendState()
  }

  /** Pay an event's cost now; false if you can't afford it (or it failed). */
  private async charge(event: FleetEvent, cost: number): Promise<boolean> {
    const userId = this.worker?.userId
    if (!userId) return false
    try {
      const result = await withRetry("Fleet cost", () =>
        payFleetCost({ userId, refId: `${this.roomId}:${this.shifts}:event:${event.id}`, amount: cost, meta: { kind: event.kind } })
      )
      if (!result.ok) {
        this.tell("notice", "Not enough BNG for that.")
        return false
      }
      this.costs += cost
      this.tell("fleetEvent", { kind: "charged", amount: cost, balance: result.balance })
      return true
    } catch (error) {
      console.error("Fleet cost failed:", error)
      return false
    }
  }

  /** The shift ends: riders still out bring in what they've made, and the dues are paid once. */
  private async endShift() {
    if (this.phase !== "shift" || this.settling) return
    this.settling = true
    this.phase = "closed"
    const now = Date.now()
    for (const bike of this.bikes) if (bike.state === "road") this.collect(bike, now)
    this.event = null
    let repaid = 0
    for (const advance of this.advances) {
      if (Math.random() < ADVANCE_REPAY_CHANCE) {
        repaid += advance.amount + ADVANCE_THANKS
        this.note(`${advance.rider} paid back his advance, with thanks.`, "good")
      } else {
        this.note(`${advance.rider} hasn't paid back his advance.`, "bad")
      }
    }
    const net = this.dues + this.bonuses + repaid
    const stolen = this.bikes.filter((bike) => bike.state === "stolen")
    const summary: Summary = {
      runs: this.bikes.reduce((sum, bike) => sum + bike.runs, 0),
      dues: this.dues,
      bonuses: this.bonuses,
      repaid,
      costs: this.costs,
      net,
      stolen: stolen.length,
      breakdowns: this.breakdowns
    }
    const worker = this.worker
    if (worker?.userId) {
      const userId = worker.userId
      try {
        const result = await withRetry("Fleet settle", () =>
          settleFleetShift({
            userId,
            shiftId: `${this.roomId}:${this.shifts}`,
            net,
            wear: Object.fromEntries(this.bikes.filter((bike) => bike.state !== "stolen").map((bike) => [bike.id, Math.round(bike.wear * 10) / 10])),
            stolen: stolen.map((bike) => bike.id),
            meta: { runs: summary.runs, dues: summary.dues, bonuses: summary.bonuses, repaid, costs: summary.costs, bikes: this.bikes.length }
          })
        )
        if (net - this.costs > 0) worker.pendingStress -= 2
        void this.body.flush([worker])
        this.tell("fleetEvent", { kind: "settled", net, balance: result.balance })
      } catch (error) {
        console.error("Failed to settle fleet shift:", error)
        this.tell("notice", "The shift ended but the dues didn't go through. Tell us if they're missing.")
      }
    }
    this.summary = summary
    this.settling = false
    this.sendState()
  }

  private pending(bike: Bike, now: number): number {
    if (bike.state !== "road" || bike.runStartedAt === null) return 0
    const sulking = now < bike.sulkUntil ? SULK_FACTOR : 1
    return runDues({ model: bike.model, seconds: (now - bike.runStartedAt) / 1000, skill: bike.skill * sulking, wear: bike.wear, fuelSpike: now < this.fuelSpikeUntil })
  }

  private sendState() {
    const now = Date.now()
    const event = this.event
    this.tell("fleet", {
      phase: this.phase,
      bikes: this.bikes.map((bike) => ({
        id: bike.id,
        model: bike.model,
        rider: bike.rider,
        skill: bike.skill,
        wear: Math.round(bike.wear),
        tracker: bike.tracker,
        state: bike.state,
        leftMs: bike.until === null ? null : Math.max(0, bike.until - now),
        earned: bike.earned,
        // What the run out now has made so far (paid when the rider is back).
        pending: this.pending(bike, now),
        sulking: now < bike.sulkUntil
      })),
      leftMs: this.phase === "shift" ? Math.max(0, this.endsAt - now) : null,
      dues: this.dues + this.bonuses,
      pending: this.bikes.reduce((sum, bike) => sum + this.pending(bike, now), 0),
      costs: this.costs,
      fuelSpikeMs: now < this.fuelSpikeUntil ? this.fuelSpikeUntil - now : null,
      event: event
        ? { id: event.id, kind: event.kind, title: FLEET_EVENTS[event.kind].title, text: event.text, options: event.options, leftMs: Math.max(0, event.expiresAt - now), resolving: event.resolving }
        : null,
      log: this.log,
      busy: this.busy,
      summary: this.summary
    })
  }
}
