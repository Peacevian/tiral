import { Room, Client, ServerError } from "@colyseus/core"
import {
  COUNTER_REACH_METERS,
  JOG_SPEED,
  KYADONDO,
  NEED_MAX,
  ROUND_ITEM,
  TABLE_REACH_METERS,
  clampToVenue,
  distance,
  findMenuItem,
  findVenue,
  roundPrice,
  standable,
  treatFollowers,
  walkStep,
  type Counter,
  type VenueId
} from "@tiral/game-core"
import { DEFAULT_LOADOUT, sanitizeLoadout, type AvatarLoadout } from "@tiral/avatars"
import { addFollowers, findUserById, payVenue } from "@tiral/db"
import { verifyJoinToken, type JoinIdentity } from "../auth.js"
import { withRetry } from "../retry.js"
import { BodySync, MessageThrottle, NEEDS_FLUSH_MS, REFRESH_NEEDS_MS, freshBody, guarded, type Runner } from "./runner.js"

const TICK_MS = 200
const RECONNECT_SECONDS = 30
/** Orders a person can place a minute (no double-tap spending sprees). */
const ORDER_GAP_MS = 1_500

type Person = Runner & {
  name: string
  loadout: AvatarLoadout
  x: number
  z: number
  /** Facing (radians, 0 = +z) and whether they're walking. */
  heading: number
  walking: boolean
  movedAt: number
  orders: number
}

/**
 * A hangout (Kyadondo first, docs/kyadondo.md): everyone who's there walks
 * around the grounds and sees each other. Arriving pays the boda; the pork
 * joint and the bar sell food and drinks, paid through the ledger, and what
 * you eat and drink goes into your body (energy, stress). Shared plates and
 * rounds reach everyone at your table and earn TikTok-connected treaters
 * followers. Open any time; one room per venue fills up to its capacity.
 */
export class VenueRoom extends Room {
  private venue: VenueId = "kyadondo"
  private readonly people = new Map<string, Person>()
  private readonly throttle = new MessageThrottle()
  private dirty = true
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly body = new BodySync((runner, message, payload) => {
    this.clients.find((candidate) => candidate.sessionId === runner.id)?.send(message, payload)
  })

  static async onAuth(token: unknown) {
    const identity = await verifyJoinToken(token)
    if (identity.guest) throw new ServerError(401, "Sign in to go out")
    return identity
  }

  onCreate(options: { venue?: string }) {
    const venue = findVenue(String(options?.venue ?? "kyadondo"))
    this.venue = venue?.id ?? "kyadondo"
    this.maxClients = venue?.capacity ?? 40
    void this.setMetadata({ venue: this.venue })
    // Players move themselves (joystick) and tell us where they are; we keep
    // them to walking speed and out of anything solid.
    this.onMessage("move", (client, input: { x?: number; z?: number; h?: number; m?: boolean }) => {
      const person = this.people.get(client.sessionId)
      if (!person) return
      const now = Date.now()
      const wanted = clampToVenue({ x: Number(input?.x), z: Number(input?.z) })
      const seconds = Math.min(2, Math.max(0.05, (now - person.movedAt) / 1000))
      const reach = JOG_SPEED * seconds * 1.6 + 0.5
      const gap = Math.hypot(wanted.x - person.x, wanted.z - person.z)
      const step = gap > reach ? { x: person.x + ((wanted.x - person.x) / gap) * reach, z: person.z + ((wanted.z - person.z) / gap) * reach } : wanted
      const next = standable(step) ? step : walkStep(person, step)
      person.x = next.x
      person.z = next.z
      person.heading = Number.isFinite(Number(input?.h)) ? Number(input?.h) : person.heading
      person.walking = input?.m === true
      person.movedAt = now
      this.dirty = true
      // Pulled back (too fast, or into a wall): tell them where they really are.
      if (Math.hypot(wanted.x - next.x, wanted.z - next.z) > 1.5) client.send("venueYou", { x: next.x, z: next.z })
    })
    this.onMessage("order", (client, item: string) => void this.order(client, String(item ?? "")))
    this.onMessage("round", (client) => void this.round(client))
    this.onMessage("refreshNeeds", (client) => {
      const person = this.people.get(client.sessionId)
      if (person && this.throttle.allow(client.sessionId, "refreshNeeds", REFRESH_NEEDS_MS)) void this.body.flush([person], true)
    })
    this.tickInterval = setInterval(guarded("venue tick", () => this.tick()), TICK_MS)
    this.flushInterval = setInterval(guarded("venue needs flush", () => this.body.flush([...this.people.values()])), NEEDS_FLUSH_MS)
  }

  async onJoin(client: Client, _options: unknown, auth?: JoinIdentity) {
    if (this.people.has(client.sessionId)) return this.sendState()
    if (!auth || auth.guest) throw new ServerError(401, "Sign in to go out")
    const venue = findVenue(this.venue)!
    // The boda there (once per visit: a reconnect keeps the same session).
    const ride = await withRetry("Venue ride", () =>
      payVenue({ userId: auth.userId, reason: "venue_ride", refId: `${this.roomId}:${client.sessionId}`, amount: venue.rideFare, meta: { venue: this.venue } })
    )
    if (!ride.ok) throw new ServerError(402, `The boda to ${venue.name} is ${venue.rideFare.toLocaleString("en-US")} BNG.`)
    const user = await withRetry("Venue user", () => findUserById(auth.userId))
    const person: Person = {
      id: client.sessionId,
      userId: auth.userId,
      name: user?.displayName ?? auth.displayName ?? "Guest",
      loadout: sanitizeLoadout(user?.avatarLoadout ?? DEFAULT_LOADOUT),
      roadPosition: null,
      coordinate: null,
      moving: false,
      turnIntent: null,
      ...freshBody(),
      // Arrive at the gate, a step apart from whoever arrived just before.
      x: KYADONDO.arrival.x + (Math.random() - 0.5) * 4,
      z: KYADONDO.arrival.z + Math.random() * 3,
      heading: Math.PI,
      walking: false,
      movedAt: Date.now(),
      orders: 0
    }
    this.people.set(client.sessionId, person)
    void this.body.load(person, () => this.people.get(client.sessionId) === person)
    client.send("venueEvent", { kind: "arrived", fare: venue.rideFare, balance: ride.balance })
    this.dirty = true
  }

  async onDrop(client: Client) {
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS)
      this.sendState()
    } catch {
      this.leave(client.sessionId)
    }
  }

  onLeave(client: Client) {
    this.leave(client.sessionId)
  }

  private leave(sessionId: string) {
    const person = this.people.get(sessionId)
    if (!person) return
    void this.body.flush([person])
    this.people.delete(sessionId)
    this.throttle.forget(sessionId)
    this.dirty = true
  }

  onDispose() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.flushInterval) clearInterval(this.flushInterval)
    void this.body.flush([...this.people.values()])
  }

  onUncaughtException(error: unknown, methodName: string) {
    console.error(`[venue ${this.roomId}] ${methodName} failed:`, error)
  }

  private tick() {
    const now = Date.now()
    for (const person of this.people.values()) {
      // Stopped sending: they've stopped walking.
      if (person.walking && now - person.movedAt > 1_000) {
        person.walking = false
        this.dirty = true
      }
    }
    this.body.sendDue([...this.people.values()], now)
    if (this.dirty) {
      this.dirty = false
      this.sendState()
    }
  }

  private sendState() {
    const people = [...this.people.values()].map((person) => ({
      id: person.id,
      name: person.name,
      loadout: person.loadout,
      x: Math.round(person.x * 100) / 100,
      z: Math.round(person.z * 100) / 100,
      h: Math.round(person.heading * 100) / 100,
      m: person.walking
    }))
    this.broadcast("venue", { venue: this.venue, people })
  }

  /** People near you (not you), for shared plates and rounds. */
  private tableMates(person: Person): Person[] {
    return [...this.people.values()].filter((other) => other !== person && distance(other, person) <= TABLE_REACH_METERS)
  }

  private atCounter(person: Person, counter: Counter) {
    return distance(person, KYADONDO.counters[counter]) <= COUNTER_REACH_METERS
  }

  /** Food and drink go into the body (energy up, stress down). */
  private feed(person: Person, energy: number, stress: number) {
    if (energy) {
      person.energy = Math.min(NEED_MAX, person.energy + energy)
      person.pendingEnergy += energy
    }
    if (stress) person.pendingStress += stress
  }

  private async charge(client: Client, person: Person, amount: number, meta: Record<string, unknown>) {
    if (!person.userId) return null
    const userId = person.userId
    const result = await withRetry("Venue order", () =>
      payVenue({ userId, reason: "venue_order", refId: `${this.roomId}:${client.sessionId}:${++person.orders}`, amount, meta: { venue: this.venue, ...meta } })
    )
    if (!result.ok) {
      client.send("notice", "Not enough BNG for that.")
      return null
    }
    return result.balance
  }

  private async order(client: Client, itemId: string) {
    const person = this.people.get(client.sessionId)
    const item = findMenuItem(itemId)
    if (!person || !item) return
    if (!this.throttle.allow(client.sessionId, "order", ORDER_GAP_MS)) return
    if (!this.atCounter(person, item.counter)) {
      client.send("notice", `Walk to the ${KYADONDO.counters[item.counter].name.toLowerCase()} to order.`)
      return
    }
    try {
      const balance = await this.charge(client, person, item.price, { item: item.id })
      if (balance === null) return
      const mates = item.shared ? this.tableMates(person) : []
      this.feed(person, item.energy, item.stress)
      for (const mate of mates) {
        this.feed(mate, item.energy, item.stress)
        this.clients.find((candidate) => candidate.sessionId === mate.id)?.send("venueEvent", { kind: "treated", by: person.name, item: item.name })
      }
      if (mates.length > 0 && person.userId) await withRetry("Followers", () => addFollowers(person.userId!, treatFollowers(mates.length)))
      void this.body.flush([person, ...mates])
      client.send("venueEvent", { kind: "served", item: item.name, price: item.price, shared: mates.length, balance })
    } catch (error) {
      console.error("Venue order failed:", error)
      client.send("notice", "That order didn't go through. Try again.")
    }
  }

  /** A round of beers for everyone at your table, and you. */
  private async round(client: Client) {
    const person = this.people.get(client.sessionId)
    const beer = findMenuItem(ROUND_ITEM)
    if (!person || !beer) return
    if (!this.throttle.allow(client.sessionId, "order", ORDER_GAP_MS)) return
    if (!this.atCounter(person, "bar")) {
      client.send("notice", "Walk to the bar to buy a round.")
      return
    }
    const mates = this.tableMates(person)
    if (mates.length === 0) {
      client.send("notice", "Nobody near you to buy a round for. Order a beer for yourself.")
      return
    }
    try {
      const price = roundPrice(mates.length + 1)
      const balance = await this.charge(client, person, price, { item: "round", people: mates.length + 1 })
      if (balance === null) return
      for (const drinker of [person, ...mates]) this.feed(drinker, beer.energy, beer.stress)
      for (const mate of mates) this.clients.find((candidate) => candidate.sessionId === mate.id)?.send("venueEvent", { kind: "treated", by: person.name, item: "a round" })
      if (person.userId) await withRetry("Followers", () => addFollowers(person.userId!, treatFollowers(mates.length)))
      void this.body.flush([person, ...mates])
      client.send("venueEvent", { kind: "served", item: `A round for ${mates.length + 1}`, price, shared: mates.length, balance })
    } catch (error) {
      console.error("Venue round failed:", error)
      client.send("notice", "That round didn't go through. Try again.")
    }
  }
}
