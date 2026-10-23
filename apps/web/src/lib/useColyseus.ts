"use client"

import { useState, useEffect, useCallback, useRef } from "react"
// Types only: the SDK itself (~66 KB gz) is imported on first use, so pages
// that never open a room (landing, legal, leaderboard) don't download it.
import type { Client, Room } from "@colyseus/sdk"
import type { RoadDirection } from "@tiral/road-graph"
import type { AvatarLoadout } from "@tiral/avatars"
import type { BikeLook } from "@tiral/game-core"
import { notifyCoinsChanged } from "./useCoins"
import { onThisHost } from "@/lib/serverAddress"

type RoomPlayer = {
  id: string
  name: string
  userId?: string | null
  loadout?: AvatarLoadout
  startPointId: string | null
  /** Before the race, rivals' starts are hidden; this says whether they've picked one. */
  startAt?: { lat: number; lng: number } | null
  hasStart?: boolean
  roadPosition: { edgeId: string; distanceAlongEdge: number; direction: 1 | -1 } | null
  coordinate: { lat: number; lng: number } | null
  moving?: boolean
  finishPosition?: number | null
  connected?: boolean
}

export type RaceEarnings = {
  position: number
  earnings: Array<{ reason: string; amount: number }>
}

export type RaceResult = {
  sessionId: string
  name: string
  position: number
}

/** A prize race's pot, as the room, the race list and invites show it. */
export type PrizeSummary = {
  pot: number
  shares: number[]
  winners: number
  host: string
  message: string | null
  startsAt: string
  countdownSeconds: number
}

/** How a prize race ended, sent to everyone in the room after the results. */
export type PrizeResult =
  | { kind: "paid"; host: string; code: string; cut: number; payouts: Array<{ place: number; amount: number; name: string; sessionId: string | null }> }
  | { kind: "refunded"; host: string; why: string }

type RoomState = {
  phase: string
  countdownSeconds: number
  destinationId: string | null
  startedAt: number | null
  roomCode: string | null
  /** Set while the room runs a prize race (until it's paid or refunded). */
  prize?: PrizeSummary | null
  players: Record<string, RoomPlayer>
}

type OfferBase = {
  id: string
  pickupId: string
  dropoffId: string
  meters: number
  energy: number
  /** Local Date.now() time the offer disappears from the board. */
  expiresAt: number
}

export type HustleOffer =
  | (OfferBase & { kind: "porter"; loadId: string; heavy: boolean; pay: number; timeLimitSeconds: number })
  | (OfferBase & { kind: "boda"; passenger: string; fare: number; rush: boolean })

export type HustleState = {
  hustle: "porter" | "boda"
  startAt: { lat: number; lng: number } | null
  offers: HustleOffer[]
  job: {
    offer: HustleOffer
    stage: "to_pickup" | "carrying"
    /** Local Date.now() time this stage must be done by (boda: the passenger gives up). */
    deadline: number
    /** Boda: local time the full fare runs out (half fare after). */
    fullFareDeadline: number | null
  } | null
  shift: { jobs: number; earned: number; failed: number }
  boda: {
    bikeReady: boolean
    rent: number
    rush: boolean
    fuel: number
    bike: { own: boolean; name: string; look: BikeLook; wear: number; speedFactor: number; patience: number }
  } | null
}

export type HustleReceipt =
  | {
      jobId: string
      paid: true
      title: string
      lines: Array<{ label: string; amount: number }>
      net: number
      meters: number
      balance: number
    }
  | { jobId: string; paid: false; title: string; reason: string; meters: number }

/** A stall shift (rolex stand / car wash) as the server last described it. */
export type StallState = {
  stall: "rolex" | "carwash"
  phase: "setup" | "open" | "raid" | "closed"
  spot: string
  stock: number
  customers: Array<{ id: string; wants: number; served: number; earned: number; leavesInMs: number }>
  cooking: { customerId: string; elapsedMs: number } | null
  lastFlip: { result: "perfect" | "good" | "raw" | "burnt"; agoMs: number } | null
  raidInMs: number | null
  car: { id: string; type: string; name: string; zones: Array<{ id: number; soap: number; dirt: number; clean: boolean }>; leftMs: number } | null
  carsDone: number
  summary: { spent: number; earned: number; served: number; spoiled: number; fined: number; outcome: string }
  /** Local Date.now() when this state arrived (turn the *Ms fields into local times). */
  receivedAt: number
}

export type StallEvent =
  | { kind: "sale"; amount: number; rolexes: number; mood: string; at: number }
  | { kind: "customer_left"; mood: string; at: number }
  | { kind: "car_done"; car: string; pay: number; tip: number; soap: number; net: number; cleanShare: number; paid: boolean; unpaid?: "guest" | "error" | null; at: number }
  | { kind: "notice"; text: string; at: number }

/** A LivTok session (selling clothes on live) as the server last described it. */
export type LiveGradeCounts = { first: number; second: number; third: number }
export type LiveState = {
  phase: "setup" | "live" | "closed"
  /** Pieces available to sell, by bale and grade. */
  stock: Record<string, LiveGradeCounts>
  followers: number
  viewers: number
  hearts: number
  leftMs: number | null
  showing: {
    bale: string
    grade: "first" | "second" | "third"
    level: "low" | "fair" | "high"
    price: number
    question: { text: string; replies: string[] } | null
    answerLeftMs: number | null
    answer: "good" | "wrong" | "ignored" | null
    outcome: "sold" | "no_takers" | null
    buyer: string | null
  } | null
  orders: number
  ordersValue: number
  comments: Array<{ id: number; from: string; text: string; kind: "chat" | "question" | "claim" | "you" }>
  summary: { sold: number; paid: number; ghosts: number; gross: number; delivery: number; net: number; cost: number; followers: number; followerDelta: number } | null
  receivedAt: number
}

export type LiveEvent =
  | { kind: "baleOpened"; bale: string; counts: LiveGradeCounts; balance: number; at: number }
  | { kind: "settled"; net: number; balance: number; at: number }
  | { kind: "notice"; text: string; at: number }

/** The boda fleet office or shift as the server last described it. */
export type FleetBikeState = "idle" | "road" | "garage" | "impounded" | "hire" | "stolen"
export type FleetState = {
  phase: "office" | "shift" | "closed"
  bikes: Array<{
    id: string
    model: "boxa100" | "star125" | "zemboE"
    rider: string
    skill: number
    wear: number
    tracker: boolean
    state: FleetBikeState
    leftMs: number | null
    earned: number
    /** The run out now, so far. */
    pending: number
    sulking: boolean
  }>
  leftMs: number | null
  dues: number
  /** Runs out now, so far. */
  pending: number
  costs: number
  fuelSpikeMs: number | null
  event: {
    id: number
    kind: "crash" | "police" | "advance" | "theft" | "fuel" | "hire"
    title: string
    text: string
    options: Array<{ id: "pay" | "free"; label: string; cost: number }>
    leftMs: number
    resolving: boolean
  } | null
  log: Array<{ id: number; text: string; tone: "good" | "bad" | "info" }>
  busy: boolean
  summary: { runs: number; dues: number; bonuses: number; repaid: number; costs: number; net: number; stolen: number; breakdowns: number } | null
  receivedAt: number
}

export type FleetEvent =
  | { kind: "charged"; amount: number; balance: number; at: number }
  | { kind: "settled"; net: number; balance: number; at: number }
  | { kind: "notice"; text: string; at: number }

/** A hangout (Kyadondo): everyone there, as the server last described them. */
/** Someone at the venue: where they are, which way they face (h), whether they're walking (m). */
export type VenuePerson = { id: string; name: string; loadout: AvatarLoadout; x: number; z: number; h: number; m: boolean }
export type VenueState = { venue: string; people: VenuePerson[]; receivedAt: number }
export type VenueEvent =
  | { kind: "arrived"; fare: number; balance: number; at: number }
  | { kind: "served"; item: string; price: number; shared: number; balance: number; at: number }
  | { kind: "treated"; by: string; item: string; at: number }
  | { kind: "notice"; text: string; at: number }

/** Latest thing to tell the player during a shift (receipt, failure, notice). */
export type HustleEvent =
  | { kind: "receipt"; receipt: HustleReceipt; at: number }
  | { kind: "failed"; reason: "abandoned" | "late" | "no_show" | "gave_up" | "broke_down"; at: number }
  | { kind: "rented"; amount: number; at: number }
  | { kind: "breakdown"; charged: number; at: number }
  | { kind: "notice"; text: string; at: number }

export type RemotePositions = Record<
  string,
  {
    roadPosition: RoomPlayer["roadPosition"]
    coordinate: RoomPlayer["coordinate"]
    moving: boolean
    sprinting?: boolean
    collapsed?: boolean
    loadout?: AvatarLoadout
  }
>

/** Your own body, as the server sees it. collapsedUntil is a local Date.now() time. */
export type RaceNeeds = { energy: number; health: number; collapsedUntil: number | null }

export type RaceListing = {
  roomId: string
  roomCode: string
  phase: string
  playerCount: number
  maxClients: number
  countdownSeconds: number | null
  prize?: PrizeSummary | null
  locked?: boolean
}

type UseColyseusOptions = {
  serverUrl?: string
}

const RECONNECT_ATTEMPTS = 4
const RECONNECT_DELAY_MS = 2000
const RECONNECT_STORAGE_KEY = "tiral:reconnect-token"

export function toFriendlyJoinError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (/sign in/i.test(message)) {
    return new Error("Sign in to race")
  }
  if (/locked/i.test(message)) {
    return new Error("That race already started — pick another one")
  }
  if (/not found|does not exist|expired|seat reservation/i.test(message)) {
    return new Error("That race no longer exists — the list was refreshed")
  }
  if (err instanceof Error) return err
  return new Error("Could not join race")
}

function saveReconnectToken(token: string | null | undefined) {
  try {
    if (token) {
      sessionStorage.setItem(RECONNECT_STORAGE_KEY, token)
    }
  } catch {
    // storage unavailable — in-memory retry still applies
  }
}

function loadReconnectToken(): string | null {
  try {
    return sessionStorage.getItem(RECONNECT_STORAGE_KEY)
  } catch {
    return null
  }
}

function clearReconnectToken() {
  try {
    sessionStorage.removeItem(RECONNECT_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function useColyseus({
  serverUrl = onThisHost(process.env.NEXT_PUBLIC_GAME_URL ?? "ws://localhost:2567"),
}: UseColyseusOptions = {}) {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [positions, setPositions] = useState<RemotePositions>({})
  const [results, setResults] = useState<RaceResult[] | null>(null)
  const [earnings, setEarnings] = useState<RaceEarnings | null>(null)
  const [prizeResult, setPrizeResult] = useState<PrizeResult | null>(null)
  const [needs, setNeeds] = useState<RaceNeeds | null>(null)
  const [hustle, setHustle] = useState<HustleState | null>(null)
  /** Server-side position of your own runner in a hustle (races use `positions`). */
  const [selfPosition, setSelfPosition] = useState<{
    roadPosition: NonNullable<RemotePositions[string]["roadPosition"]>
    moving: boolean
  } | null>(null)
  const [hustleEvent, setHustleEvent] = useState<HustleEvent | null>(null)
  const [stall, setStall] = useState<StallState | null>(null)
  const [stallEvent, setStallEvent] = useState<StallEvent | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const [liveEvent, setLiveEvent] = useState<LiveEvent | null>(null)
  const [fleet, setFleet] = useState<FleetState | null>(null)
  const [fleetEvent, setFleetEvent] = useState<FleetEvent | null>(null)
  const [venue, setVenue] = useState<VenueState | null>(null)
  const [venueEvent, setVenueEvent] = useState<VenueEvent | null>(null)
  // The room put you back (walked too fast or into a wall).
  const [venueYou, setVenueYou] = useState<{ x: number; z: number; at: number } | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const roomRef = useRef<Room | null>(null)
  const clientRef = useRef<Client | null>(null)
  const manualLeaveRef = useRef(false)
  // Rooms we left on purpose: their late onLeave must be ignored.
  const leftRoomsRef = useRef(new WeakSet<Room>())
  // Everything that belongs to the room just left. Clearing all of it means the
  // next shift or race can't start from the old position, energy or earnings.
  const resetRoomState = useCallback(() => {
    setConnected(false)
    setSessionId(null)
    setRoomId(null)
    setRoomCode(null)
    setRoomState(null)
    setPositions({})
    setResults(null)
    setEarnings(null)
    setPrizeResult(null)
    setNeeds(null)
    setSelfPosition(null)
    setCountdown(null)
    setHustle(null)
    setHustleEvent(null)
    setStall(null)
    setStallEvent(null)
    setLive(null)
    setLiveEvent(null)
    setFleet(null)
    setFleetEvent(null)
    setVenue(null)
    setVenueEvent(null)
    setVenueYou(null)
  }, [])

  // Bumped by every join and leave: a join or reconnect that resolves after a
  // newer one started is stale, and its room is closed instead of attached
  // (otherwise it could overwrite the current room and linger, orphaned).
  const opRef = useRef(0)

  const getClient = useCallback(async () => {
    if (!clientRef.current) {
      const { Client } = await import("@colyseus/sdk")
      clientRef.current ??= new Client(serverUrl)
    }
    return clientRef.current
  }, [serverUrl])

  const attachRoom = useCallback((room: Room) => {
    roomRef.current = room
    saveReconnectToken(
      (room as unknown as { reconnectionToken?: string }).reconnectionToken
    )
    setSessionId(room.sessionId)
    setRoomId(room.roomId)
    setConnected(true)
    setReconnecting(false)

    room.onMessage("roomState", (state: RoomState) => {
      setRoomState(state)
      if (state.roomCode) {
        setRoomCode(state.roomCode)
      }
      if (state.phase === "countdown") {
        setCountdown(state.countdownSeconds)
      }
      if (state.phase !== "finished") {
        setResults(null)
        setEarnings(null)
        setPrizeResult(null)
      }
    })

    room.onMessage("countdownTick", (remaining: number) => {
      setCountdown(remaining)
    })

    room.onMessage("positions", (next: RemotePositions) => {
      setPositions(next)
    })

    room.onMessage("raceFinished", (order: RaceResult[]) => {
      setResults(order)
    })
    room.onMessage("prizeResult", (result: PrizeResult) => {
      setPrizeResult(result)
      notifyCoinsChanged()
    })

    room.onMessage("needs", (next: { energy: number; health: number; collapsedForMs: number }) => {
      setNeeds({
        energy: next.energy,
        health: next.health,
        collapsedUntil: next.collapsedForMs > 0 ? Date.now() + next.collapsedForMs : null
      })
    })

    // Hustle shifts (solo simulated jobs). Times arrive as "remaining ms" and
    // are turned into local deadlines so client clocks don't matter.
    room.onMessage(
      "hustle",
      (next: Omit<HustleState, "offers" | "job"> & {
        offers: Array<HustleOffer & { expiresInMs: number }>
        job: { offer: HustleOffer; stage: "to_pickup" | "carrying"; remainingMs: number; fullFareMs: number | null } | null
      }) => {
        const now = Date.now()
        setHustle({
          hustle: next.hustle,
          startAt: next.startAt,
          offers: next.offers.map(({ expiresInMs, ...offer }) => ({ ...offer, expiresAt: now + expiresInMs }) as HustleOffer),
          job: next.job
            ? {
                offer: next.job.offer,
                stage: next.job.stage,
                deadline: now + next.job.remainingMs,
                fullFareDeadline: next.job.fullFareMs === null ? null : now + next.job.fullFareMs
              }
            : null,
          shift: next.shift,
          boda: next.boda
        })
      }
    )
    room.onMessage("receipt", (receipt: HustleReceipt) => {
      setHustleEvent({ kind: "receipt", receipt, at: Date.now() })
      if (receipt.paid) notifyCoinsChanged()
    })
    room.onMessage("bikeRented", (rent: { amount: number }) => {
      setHustleEvent({ kind: "rented", amount: rent.amount, at: Date.now() })
      notifyCoinsChanged()
    })
    room.onMessage("breakdown", (repair: { charged: number }) => {
      setHustleEvent({ kind: "breakdown", charged: repair.charged, at: Date.now() })
      notifyCoinsChanged()
    })
    room.onMessage("jobFailed", (failure: { reason: "abandoned" | "late" | "no_show" | "gave_up" | "broke_down" }) => {
      setHustleEvent({ kind: "failed", reason: failure.reason, at: Date.now() })
    })
    room.onMessage("notice", (text: string) => {
      setHustleEvent({ kind: "notice", text, at: Date.now() })
      setStallEvent({ kind: "notice", text, at: Date.now() })
      setLiveEvent({ kind: "notice", text, at: Date.now() })
      setFleetEvent({ kind: "notice", text, at: Date.now() })
      setVenueEvent({ kind: "notice", text, at: Date.now() })
    })
    // Hangouts (Kyadondo).
    room.onMessage("venue", (next: Omit<VenueState, "receivedAt">) => setVenue({ ...next, receivedAt: Date.now() }))
    room.onMessage("venueYou", (at: { x: number; z: number }) => setVenueYou({ ...at, at: Date.now() }))
    room.onMessage("venueEvent", (event: Omit<VenueEvent, "at">) => {
      setVenueEvent({ ...event, at: Date.now() } as VenueEvent)
      if (event.kind !== "treated") notifyCoinsChanged()
    })
    // Boda fleet (town business).
    room.onMessage("fleet", (next: Omit<FleetState, "receivedAt">) => setFleet({ ...next, receivedAt: Date.now() }))
    room.onMessage("fleetEvent", (event: Omit<FleetEvent, "at">) => {
      setFleetEvent({ ...event, at: Date.now() } as FleetEvent)
      notifyCoinsChanged()
    })
    // LivTok (selling clothes on live).
    room.onMessage("live", (next: Omit<LiveState, "receivedAt">) => setLive({ ...next, receivedAt: Date.now() }))
    room.onMessage("baleOpened", (opened: Omit<Extract<LiveEvent, { kind: "baleOpened" }>, "kind" | "at">) => {
      setLiveEvent({ kind: "baleOpened", ...opened, at: Date.now() })
      notifyCoinsChanged()
    })
    room.onMessage("liveEvent", (event: Omit<LiveEvent, "at">) => {
      setLiveEvent({ ...event, at: Date.now() } as LiveEvent)
      if (event.kind === "settled") notifyCoinsChanged()
    })
    // Stall shifts (rolex stand, car wash).
    room.onMessage("stall", (next: Omit<StallState, "receivedAt">) => setStall({ ...next, receivedAt: Date.now() }))
    room.onMessage("stallEvent", (event: Omit<StallEvent, "at">) => {
      setStallEvent({ ...event, at: Date.now() } as StallEvent)
      if (event.kind === "sale" || event.kind === "car_done") notifyCoinsChanged()
    })
    room.onMessage("stockBought", () => notifyCoinsChanged())

    // The server's own position for the worker; the client predicts locally
    // and reconciles against this.
    room.onMessage("position", (next: { roadPosition: RemotePositions[string]["roadPosition"]; moving: boolean }) => {
      setSelfPosition(next.roadPosition ? { roadPosition: next.roadPosition, moving: next.moving } : null)
    })

    // Coins paid for this race (sent only to signed-in finishers).
    room.onMessage("earnings", (payout: RaceEarnings) => {
      setEarnings(payout)
      notifyCoinsChanged()
    })

    room.onLeave((code) => {
      // A room we left on purpose, or already moved on from: its late "left"
      // event must not reconnect to it or wipe the new room's state.
      if (leftRoomsRef.current.has(room)) return
      if (roomRef.current && roomRef.current !== room) return
      const token =
        (room as unknown as { reconnectionToken?: string }).reconnectionToken ??
        loadReconnectToken()
      saveReconnectToken(token)
      roomRef.current = null
      if (manualLeaveRef.current) {
        clearReconnectToken()
        resetRoomState()
        return
      }
      void attemptReconnect(code, token)
    })
  }, [])

  const attemptReconnect = useCallback(async (_code: number, token?: string | null) => {
    const client = clientRef.current
    if (!client || !token) {
      setConnected(false)
      setReconnecting(false)
      return
    }
    setReconnecting(true)
    const op = opRef.current
    const stale = () => manualLeaveRef.current || roomRef.current !== null || op !== opRef.current
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt++) {
      // Stop if the player left, or has since joined (or is joining) another room.
      if (stale()) return
      try {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS))
        if (stale()) return
        const nextRoom = await client.reconnect(token)
        if (stale()) {
          leftRoomsRef.current.add(nextRoom)
          nextRoom.leave()
          return
        }
        attachRoom(nextRoom)
        return
      } catch {
        // retry until attempts run out
      }
    }
    clearReconnectToken()
    setReconnecting(false)
    resetRoomState()
  }, [attachRoom])

  const leaveRoom = useCallback(() => {
    opRef.current++
    manualLeaveRef.current = true
    clearReconnectToken()
    setReconnecting(false)
    if (roomRef.current) leftRoomsRef.current.add(roomRef.current)
    roomRef.current?.leave()
    roomRef.current = null
    resetRoomState()
  }, [])

  const authorize = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/token")
      if (!response.ok) return
      const body = (await response.json()) as { token: string | null }
      if (body.token) {
        const client = await getClient()
        client.auth.token = body.token
      }
    } catch {
      // unsigned requests join as guests
    }
  }, [getClient])

  /** Join through `open`, unless a newer join or a leave happens meanwhile. */
  const joinWith = useCallback(
    async (open: (client: Client) => Promise<Room>) => {
      if (roomRef.current) return
      manualLeaveRef.current = false
      const op = ++opRef.current
      await authorize()
      const room = await open(await getClient())
      if (op !== opRef.current || roomRef.current) {
        leftRoomsRef.current.add(room)
        room.leave()
        return
      }
      attachRoom(room)
    },
    [getClient, attachRoom, authorize]
  )

  const connect = useCallback(async (loadout?: AvatarLoadout) => {
    try {
      await joinWith((client) => client.joinOrCreate("race", loadout ? { loadout } : undefined))
    } catch (err) {
      console.error("Failed to connect to Colyseus server:", err)
    }
  }, [joinWith])

  const quickPlay = useCallback(async (loadout?: AvatarLoadout) => {
    try {
      await joinWith((client) => client.joinOrCreate("race", loadout ? { loadout } : undefined))
    } catch (err) {
      console.error("Quick play failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [joinWith])

  const createRace = useCallback(async (loadout?: AvatarLoadout) => {
    try {
      await joinWith((client) => client.create("race", loadout ? { loadout } : undefined))
    } catch (err) {
      console.error("Create race failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [joinWith])

  /** Start a solo hustle shift (simulated jobs; no other players needed). */
  const startHustle = useCallback(async (hustleId: string, loadout?: AvatarLoadout) => {
    try {
      await joinWith((client) => client.create("hustle", { hustle: hustleId, ...(loadout ? { loadout } : {}) }))
    } catch (err) {
      console.error("Start hustle failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [joinWith])

  /** Start a stall shift (rolex stand or car wash). */
  const startStall = useCallback(async (kind: "rolex" | "carwash") => {
    try {
      await joinWith((client) => client.create("stall", { stall: kind }))
    } catch (err) {
      console.error("Start stall failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [joinWith])

  /** Open your LivTok (the Owino market and your stock; go live from there). */
  const startLive = useCallback(async () => {
    try {
      await joinWith((client) => client.create("live"))
    } catch (err) {
      console.error("Start LivTok failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [joinWith])

  /** Open your boda fleet office (send riders out from there). */
  const startFleet = useCallback(async () => {
    try {
      await joinWith((client) => client.create("fleet"))
    } catch (err) {
      console.error("Start fleet failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [joinWith])

  /** Ride to a hangout (pays the boda) and join everyone there. */
  const startVenue = useCallback(
    async (place: string) => {
      try {
        await joinWith((client) => client.joinOrCreate("venue", { venue: place }))
      } catch (err) {
        console.error("Going out failed:", err)
        throw err instanceof Error ? err : new Error("Couldn't get there. Try again.")
      }
    },
    [joinWith]
  )

  /** Any stall, LivTok or fleet action: buyStock, cook, flip, run, scrub, rinse, close; buyBale, goLive, show, reply, end, again. */
  const sendStall = useCallback((type: string, payload?: unknown) => {
    roomRef.current?.send(type, payload)
  }, [])

  const sendAcceptJob = useCallback((offerId: string) => {
    roomRef.current?.send("accept", offerId)
  }, [])

  const sendAbandonJob = useCallback(() => {
    roomRef.current?.send("abandon")
  }, [])

  const joinRace = useCallback(async (id: string, loadout?: AvatarLoadout) => {
    try {
      await joinWith((client) => client.joinById(id, loadout ? { loadout } : undefined))
    } catch (err) {
      throw toFriendlyJoinError(err)
    }
  }, [joinWith])

  const listRaces = useCallback(async (): Promise<RaceListing[]> => {
    const baseUrl = onThisHost(process.env.NEXT_PUBLIC_RACES_API_URL ?? "http://localhost:2568")
    const response = await fetch(`${baseUrl}/races`)
    if (!response.ok) {
      throw new Error(`Race listing failed with ${response.status}`)
    }
    const data = (await response.json()) as Array<{
      roomId: string
      roomCode: string
      phase: string
      playerCount: number
      maxClients: number
      countdownSeconds: number | null
      prize?: PrizeSummary | null
      locked?: boolean
    }>
    return data.map((listed) => ({
      roomId: listed.roomId,
      roomCode: listed.roomCode,
      phase: listed.phase,
      playerCount: listed.playerCount,
      maxClients: listed.maxClients,
      countdownSeconds: listed.countdownSeconds,
      prize: listed.prize ?? null,
      locked: listed.locked ?? false
    }))
  }, [])

  const joinByCode = useCallback(async (code: string, loadout?: AvatarLoadout) => {
    const races = await listRaces()
    const match = races.find(
      (race) => race.roomCode.toUpperCase() === code.trim().toUpperCase()
    )
    if (!match) {
      throw new Error("No open race with that code")
    }
    if (match.locked || (match.phase !== "lobby" && match.phase !== "countdown")) {
      throw new Error("That race already started — pick another one")
    }
    if (match.playerCount >= match.maxClients) {
      throw new Error("That race is full — pick another one")
    }
    await joinRace(match.roomId, loadout)
  }, [listRaces, joinRace])

  const disconnect = useCallback(() => {
    leaveRoom()
    clientRef.current = null
  }, [leaveRoom])

  const sendWalk = useCallback((on: boolean) => {
    roomRef.current?.send("walk", on)
  }, [])

  const sendSprint = useCallback((on: boolean) => {
    roomRef.current?.send("sprint", on)
  }, [])

  /** Ask the race server to re-read energy/health (e.g. after eating on the profile). */
  const sendRefreshNeeds = useCallback(() => {
    roomRef.current?.send("refreshNeeds")
  }, [])

  const sendTurn = useCallback((direction: RoadDirection) => {
    roomRef.current?.send("turn", direction)
  }, [])

  const sendTurnAround = useCallback(() => {
    roomRef.current?.send("turnAround")
  }, [])

  const sendSelectStart = useCallback((startPointId: string) => {
    roomRef.current?.send("selectStart", startPointId)
  }, [])

  const sendPlaceStart = useCallback((lat: number, lng: number) => {
    roomRef.current?.send("placeStart", { lat, lng })
  }, [])

  const sendPlayAgain = useCallback(() => {
    roomRef.current?.send("playAgain")
  }, [])

  const sendStartNow = useCallback(() => {
    roomRef.current?.send("startNow")
  }, [])

  const reclaimAttempted = useRef(false)

  useEffect(() => {
    if (reclaimAttempted.current || roomRef.current) return
    reclaimAttempted.current = true
    const token = loadReconnectToken()
    if (!token) return
    manualLeaveRef.current = false
    setReconnecting(true)
    const op = opRef.current
    getClient()
      .then((client) => client.reconnect(token))
      .then((room) => {
        if (manualLeaveRef.current || op !== opRef.current || roomRef.current) {
          leftRoomsRef.current.add(room)
          room.leave()
          return
        }
        attachRoom(room)
      })
      .catch(() => {
        clearReconnectToken()
        setReconnecting(false)
      })
  }, [attachRoom, getClient])

  return {
    connected,
    reconnecting,
    sessionId,
    roomId,
    roomCode,
    roomState,
    positions,
    results,
    earnings,
    prizeResult,
    needs,
    hustle,
    hustleEvent,
    stall,
    stallEvent,
    live,
    liveEvent,
    fleet,
    fleetEvent,
    venue,
    venueEvent,
    venueYou,
    selfPosition,
    countdown,
    connect,
    disconnect,
    leaveRoom,
    quickPlay,
    createRace,
    startHustle,
    startStall,
    startLive,
    startFleet,
    startVenue,
    sendStall,
    sendAcceptJob,
    sendAbandonJob,
    joinRace,
    joinByCode,
    listRaces,
    sendWalk,
    sendSprint,
    sendRefreshNeeds,
    sendTurn,
    sendTurnAround,
    sendSelectStart,
    sendPlaceStart,
    sendPlayAgain,
    sendStartNow
  }
}
