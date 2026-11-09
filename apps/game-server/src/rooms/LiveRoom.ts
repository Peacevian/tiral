import { Room, Client, ServerError } from "@colyseus/core"
import {
  ANSWER_SECONDS,
  GHOST_CHANCE,
  LIVE_BUYERS,
  LIVE_ENERGY,
  LIVE_GRADES,
  LIVE_QUESTIONS,
  LIVE_SECONDS,
  LIVTOK_DELIVERY,
  findBale,
  followerChange,
  liveNet,
  openBale,
  pieceCost,
  piecePrice,
  saleChance,
  startViewers,
  viewerCeiling,
  viewerChange,
  type AnswerQuality,
  type GradeCounts,
  type LiveGrade,
  type PriceLevel
} from "@tiral/game-core"
import { buyBale, getLivtok, getTier, hasPrivyAccount, settleLive, type LivtokStock } from "@tiral/db"
import { verifyJoinToken, type JoinIdentity } from "../auth.js"
import { withRetry } from "../retry.js"
import { BodySync, MessageThrottle, NEEDS_FLUSH_MS, REFRESH_NEEDS_MS, freshBody, guarded, spendEnergy, tiredReason, type Runner } from "./runner.js"

const TICK_MS = 250
const RECONNECT_SECONDS = 30
/**
 * Holding a piece up to the camera takes a moment before anyone asks about it,
 * and buyers think a moment after your answer: ~8–10 s a piece, so a 4-minute
 * live sells ~20 pieces (the tier 2 pace, ~900k an hour; §18).
 */
const ASK_DELAY_MS = 3_500
const DECIDE_MS = 2_000
const CHATTER = ["🔥🔥🔥", "Nice!", "Hello from Mukono 👋", "Eeh this one is smart", "😍", "Next one!", "Webale 🙏", "Show more", "❤️❤️", "Hi from Gulu"]

type Piece = { bale: string; grade: LiveGrade; level: PriceLevel; price: number }
type Showing = Piece & {
  askAt: number
  question: { text: string; replies: string[]; correct: number } | null
  answer: AnswerQuality | null
  decideAt: number | null
  outcome: "sold" | "no_takers" | null
  buyer: string | null
}
type Order = Piece & { buyer: string }
type Comment = { id: number; from: string; text: string; kind: "chat" | "question" | "claim" | "you" }
type Summary = { sold: number; paid: number; ghosts: number; gross: number; delivery: number; net: number; cost: number; followers: number; followerDelta: number }

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/**
 * LivTok: sell mitumba on live (tier 2). Setup is the Owino bale market and
 * your stock; a live lasts LIVE_SECONDS with server-simulated viewers,
 * comments and buyers; at the end buyers pay (a few vanish) and the sales are
 * paid once through the ledger. Clients only send taps.
 */
export class LiveRoom extends Room {
  maxClients = 1
  private readonly throttle = new MessageThrottle()
  private worker: (Runner & { name: string }) | null = null
  private phase: "setup" | "live" | "closed" = "setup"
  private stock: LivtokStock = {}
  private followers = 0
  private buying = false
  private bales = 0
  private lives = 0

  private endsAt = 0
  private viewers = 0
  private peakViewers = 0
  private hearts = 0
  private showing: Showing | null = null
  private orders: Order[] = []
  private comments: Comment[] = []
  private commentSeq = 0
  private lastChatter = 0
  private lastIdleCheck = 0
  private summary: Summary | null = null
  private settling = false

  private tickInterval: ReturnType<typeof setInterval> | null = null
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private readonly body = new BodySync((runner, message, payload) => {
    this.clients.find((candidate) => candidate.sessionId === runner.id)?.send(message, payload)
  })

  static async onAuth(token: unknown) {
    const identity = await verifyJoinToken(token)
    if (identity.guest) throw new ServerError(401, "Sign in to sell on LivTok")
    const [tier, linked] = await Promise.all([withRetry("Tier check", () => getTier(identity.userId)), hasPrivyAccount(identity.userId)])
    if (tier === "street") throw new ServerError(403, "Move up to Small business to sell on LivTok.")
    if (!linked) throw new ServerError(403, "Sign in to sell on LivTok.")
    return identity
  }

  onCreate() {
    this.setPrivate(true)
    this.onMessage("buyBale", (client, bale: string) => void this.buyBale(client, String(bale ?? "")))
    this.onMessage("goLive", (client) => this.goLive(client))
    this.onMessage("show", (client, input: { bale?: string; grade?: string; level?: string }) => this.show(client, input))
    this.onMessage("reply", (client, index: number) => this.reply(client, Number(index)))
    this.onMessage("end", (client) => {
      if (this.own(client) && this.phase === "live") void this.endLive()
    })
    this.onMessage("again", (client) => {
      if (this.own(client) && this.phase === "closed" && !this.settling) {
        this.phase = "setup"
        this.summary = null
        this.sendState()
      }
    })
    this.onMessage("refreshNeeds", (client) => {
      if (this.own(client) && this.worker && this.throttle.allow(client.sessionId, "refreshNeeds", REFRESH_NEEDS_MS)) {
        void this.body.flush([this.worker], true)
      }
    })
    this.tickInterval = setInterval(guarded("live tick", () => this.tick()), TICK_MS)
    this.flushInterval = setInterval(guarded("live needs flush", () => (this.worker ? this.body.flush([this.worker]) : undefined)), NEEDS_FLUSH_MS)
  }

  async onJoin(client: Client, _options: unknown, auth?: JoinIdentity) {
    if (this.worker?.id === client.sessionId) return this.sendState()
    const verified = auth && !auth.guest ? auth : null
    const worker = { id: client.sessionId, userId: verified?.userId ?? null, name: verified?.displayName ?? "Seller", roadPosition: null, coordinate: null, moving: false, turnIntent: null, ...freshBody() }
    this.worker = worker
    void this.body.load(worker, () => this.worker === worker)
    if (worker.userId) {
      const userId = worker.userId
      const state = await withRetry("LivTok stock", () => getLivtok(userId))
      this.stock = state.stock
      this.followers = state.followers
    }
    this.sendState()
  }

  async onDrop(client: Client) {
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS)
      this.sendState()
    } catch {
      if (this.phase === "live") await this.endLive()
    }
  }

  async onLeave() {
    if (this.phase === "live") await this.endLive()
  }

  onDispose() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.flushInterval) clearInterval(this.flushInterval)
    if (this.worker) void this.body.flush([this.worker])
  }

  onUncaughtException(error: unknown, methodName: string) {
    console.error(`[live ${this.roomId}] ${methodName} failed:`, error)
  }

  private own(client: Client) {
    return this.worker && this.worker.id === client.sessionId ? this.worker : null
  }

  private tell(type: string, payload: unknown) {
    const worker = this.worker
    if (worker) this.clients.find((candidate) => candidate.sessionId === worker.id)?.send(type, payload)
  }

  /** Pieces on hand that aren't already promised to a buyer in this live. */
  private available(bale: string, grade: LiveGrade): number {
    const held = this.stock[bale]?.[grade] ?? 0
    const promised = this.orders.filter((order) => order.bale === bale && order.grade === grade).length
    return held - promised
  }

  private totalAvailable(): number {
    let total = 0
    for (const bale of Object.keys(this.stock)) for (const grade of LIVE_GRADES) total += Math.max(0, this.available(bale, grade))
    return total
  }

  private say(from: string, text: string, kind: Comment["kind"]) {
    this.comments.push({ id: ++this.commentSeq, from, text, kind })
    if (this.comments.length > 12) this.comments.splice(0, this.comments.length - 12)
  }

  // ---------------------------------------------------------------------------
  // Owino market

  private async buyBale(client: Client, baleId: string) {
    const worker = this.own(client)
    const bale = findBale(baleId)
    if (!worker?.userId || !bale || this.phase === "live" || this.buying) return
    this.buying = true
    try {
      const counts = openBale(bale.id, Math.random)
      const userId = worker.userId
      const result = await withRetry("Bale purchase", () => buyBale({ userId, baleId: bale.id, refId: `${this.roomId}:bale:${++this.bales}`, counts }))
      if (!result.ok) {
        client.send("notice", result.reason === "insufficient" ? `You need ${bale.price.toLocaleString("en-US")} BNG for a ${bale.name.toLowerCase()} bale.` : "That bale isn't sold here.")
        return
      }
      const held = this.stock[bale.id] ?? { first: 0, second: 0, third: 0 }
      this.stock[bale.id] = { first: held.first + counts.first, second: held.second + counts.second, third: held.third + counts.third }
      client.send("baleOpened", { bale: bale.id, counts, balance: result.balance })
      this.sendState()
    } catch (error) {
      console.error("Failed to buy bale:", error)
      client.send("notice", "Couldn't buy the bale. Try again.")
    } finally {
      this.buying = false
    }
  }

  // ---------------------------------------------------------------------------
  // The live

  private goLive(client: Client) {
    const worker = this.own(client)
    if (!worker || this.phase !== "setup") return
    const tired = tiredReason(worker, LIVE_ENERGY)
    if (tired) return client.send("notice", tired)
    if (this.totalAvailable() === 0) return client.send("notice", "No stock to sell. Buy a bale at Owino first.")
    spendEnergy(worker, LIVE_ENERGY)
    void this.body.flush([worker])
    const now = Date.now()
    this.phase = "live"
    this.lives++
    this.endsAt = now + LIVE_SECONDS * 1000
    this.viewers = startViewers(this.followers)
    this.peakViewers = this.viewers
    this.hearts = 0
    this.orders = []
    this.showing = null
    this.comments = []
    this.lastChatter = now
    this.lastIdleCheck = now
    this.say("LivTok", `You're live! ${this.viewers} watching.`, "chat")
    this.sendState()
  }

  private show(client: Client, input: { bale?: string; grade?: string; level?: string }) {
    if (!this.own(client) || this.phase !== "live") return
    if (this.showing && this.showing.outcome === null) return
    const bale = findBale(String(input?.bale ?? ""))
    const grade = LIVE_GRADES.find((candidate) => candidate === input?.grade)
    const level = (["low", "fair", "high"] as const).find((candidate) => candidate === input?.level)
    if (!bale || !grade || !level || this.available(bale.id, grade) <= 0) return
    const now = Date.now()
    this.showing = {
      bale: bale.id,
      grade,
      level,
      price: piecePrice(bale.id, grade, level),
      askAt: now + ASK_DELAY_MS,
      question: null,
      answer: null,
      decideAt: null,
      outcome: null,
      buyer: null
    }
    this.lastIdleCheck = now
    this.sendState()
  }

  private reply(client: Client, index: number) {
    const showing = this.showing
    if (!this.own(client) || this.phase !== "live" || !showing?.question || showing.answer !== null) return
    const good = index === showing.question.correct
    showing.answer = good ? "good" : "wrong"
    showing.decideAt = Date.now() + DECIDE_MS
    this.say(this.worker?.name ?? "You", showing.question.replies[index] ?? "…", "you")
    this.sendState()
  }

  private tick() {
    const now = Date.now()
    if (this.worker) this.body.sendDue([this.worker], now)
    if (this.phase !== "live") return
    const showing = this.showing
    if (showing && showing.outcome === null) {
      if (!showing.question && now >= showing.askAt) {
        const question = LIVE_QUESTIONS[Math.floor(Math.random() * LIVE_QUESTIONS.length)]!
        const order = shuffle([0, 1, 2])
        showing.question = { text: question.text, replies: order.map((i) => question.replies[i]!), correct: order.indexOf(0) }
        this.say(LIVE_BUYERS[Math.floor(Math.random() * LIVE_BUYERS.length)]!, question.text, "question")
      }
      if (showing.question && showing.answer === null && now >= showing.askAt + ANSWER_SECONDS * 1000) {
        showing.answer = "ignored"
        showing.decideAt = now + 400
      }
      if (showing.answer !== null && showing.decideAt !== null && now >= showing.decideAt) this.decide(showing)
    }
    // A live with nothing on screen loses people.
    if ((!this.showing || this.showing.outcome !== null) && now - this.lastIdleCheck > 5_000) {
      this.lastIdleCheck = now
      this.viewers = Math.max(1, this.viewers - 1)
    }
    if (now - this.lastChatter > 1_500 + Math.random() * 1_500) {
      this.lastChatter = now
      this.say(LIVE_BUYERS[Math.floor(Math.random() * LIVE_BUYERS.length)]!, CHATTER[Math.floor(Math.random() * CHATTER.length)]!, "chat")
      this.viewers = Math.max(1, Math.min(viewerCeiling(this.followers), this.viewers + (Math.random() < 0.55 ? 1 : -1)))
    }
    this.hearts += Math.round(Math.random() * this.viewers * 0.3)
    this.peakViewers = Math.max(this.peakViewers, this.viewers)
    if (now >= this.endsAt || (this.totalAvailable() === 0 && (!this.showing || this.showing.outcome !== null))) {
      void this.endLive()
      return
    }
    this.sendState()
  }

  private decide(showing: Showing) {
    const sold = Math.random() < saleChance({ level: showing.level, answer: showing.answer ?? "ignored", viewers: this.viewers, grade: showing.grade })
    showing.outcome = sold ? "sold" : "no_takers"
    if (sold) {
      const buyer = LIVE_BUYERS[Math.floor(Math.random() * LIVE_BUYERS.length)]!
      showing.buyer = buyer
      this.orders.push({ bale: showing.bale, grade: showing.grade, level: showing.level, price: showing.price, buyer })
      this.say(buyer, "Mine! 🙋", "claim")
    } else {
      this.say("LivTok", "No takers for that one.", "chat")
    }
    this.viewers = Math.max(1, Math.min(viewerCeiling(this.followers), this.viewers + viewerChange({ sold, answer: showing.answer ?? "ignored" })))
    this.lastIdleCheck = Date.now()
  }

  /** The live ends: buyers pay (a few vanish), and the sales are paid once. */
  private async endLive() {
    if (this.phase !== "live" || this.settling) return
    this.settling = true
    this.phase = "closed"
    this.showing = null
    const paid: Order[] = []
    let ghosts = 0
    for (const order of this.orders) {
      if (Math.random() < GHOST_CHANCE) ghosts++
      else paid.push(order)
    }
    const prices = paid.map((order) => order.price)
    const net = liveNet(prices)
    const followerDelta = followerChange({ sold: paid.length, ghosts, peakViewers: this.peakViewers })
    const summary: Summary = {
      sold: this.orders.length,
      paid: paid.length,
      ghosts,
      gross: prices.reduce((sum, price) => sum + price, 0),
      delivery: prices.length * LIVTOK_DELIVERY,
      net,
      cost: paid.reduce((sum, order) => sum + pieceCost(order.bale), 0),
      followers: this.followers,
      followerDelta
    }
    const worker = this.worker
    if (worker?.userId) {
      const userId = worker.userId
      try {
        const result = await withRetry("LivTok settle", () =>
          settleLive({
            userId,
            liveId: `${this.roomId}:${this.lives}`,
            sold: paid.map((order) => ({ bale: order.bale, grade: order.grade })),
            net,
            followerDelta,
            meta: { sold: summary.sold, paid: summary.paid, ghosts, gross: summary.gross, peakViewers: this.peakViewers }
          })
        )
        summary.followers = result.followers
        this.followers = result.followers
        // Paid pieces leave stock; unpaid ones stay.
        for (const order of paid) {
          const held = this.stock[order.bale]
          if (held) held[order.grade] = Math.max(0, held[order.grade] - 1)
        }
        if (net > 0) worker.pendingStress -= 2
        void this.body.flush([worker])
        this.tell("liveEvent", { kind: "settled", net, balance: result.balance })
      } catch (error) {
        console.error("Failed to settle LivTok live:", error)
        this.tell("notice", "The live ended but the payment didn't go through. Tell us if your sales are missing.")
      }
    }
    this.orders = []
    this.summary = summary
    this.settling = false
    this.sendState()
  }

  private sendState() {
    const now = Date.now()
    const showing = this.showing
    this.tell("live", {
      phase: this.phase,
      stock: Object.fromEntries(
        Object.keys(this.stock).map((bale) => [bale, Object.fromEntries(LIVE_GRADES.map((grade) => [grade, Math.max(0, this.available(bale, grade))])) as GradeCounts])
      ),
      followers: this.followers,
      viewers: this.viewers,
      hearts: this.hearts,
      leftMs: this.phase === "live" ? Math.max(0, this.endsAt - now) : null,
      showing: showing
        ? {
            bale: showing.bale,
            grade: showing.grade,
            level: showing.level,
            price: showing.price,
            question: showing.question ? { text: showing.question.text, replies: showing.question.replies } : null,
            answerLeftMs: showing.question && showing.answer === null ? Math.max(0, showing.askAt + ANSWER_SECONDS * 1000 - now) : null,
            answer: showing.answer,
            outcome: showing.outcome,
            buyer: showing.buyer
          }
        : null,
      orders: this.orders.length,
      ordersValue: this.orders.reduce((sum, order) => sum + order.price, 0),
      comments: this.comments,
      summary: this.summary
    })
  }
}
