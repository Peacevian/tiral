"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Client } from "@colyseus/sdk"
import type { Room } from "@colyseus/sdk"
import type { RoadDirection } from "@tiral/road-graph"
import type { AvatarLoadout } from "@tiral/avatars"
import type { BikeLook } from "@tiral/game-core"
import { notifyCoinsChanged } from "./useCoins"

type RoomPlayer = {
  id: string
  name: string
  userId?: string | null
  loadout?: AvatarLoadout
  startPointId: string | null
  startAt?: { lat: number; lng: number } | null
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

type RoomState = {
  phase: string
  countdownSeconds: number
  destinationId: string | null
  startedAt: number | null
  roomCode: string | null
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
  | { kind: "car_done"; car: string; pay: number; tip: number; soap: number; net: number; cleanShare: number; paid: boolean; limit: boolean; unpaid?: "guest" | "error" | null; at: number }
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
  serverUrl = process.env.NEXT_PUBLIC_GAME_URL ?? "ws://localhost:2567",
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
  const [countdown, setCountdown] = useState<number | null>(null)
  const roomRef = useRef<Room | null>(null)
  const clientRef = useRef<Client | null>(null)
  const manualLeaveRef = useRef(false)

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new Client(serverUrl)
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
      // A room we already moved on from (left it, then joined another): its
      // late "left" event must not reconnect to it or wipe the new room's state.
      if (roomRef.current && roomRef.current !== room) return
      const token =
        (room as unknown as { reconnectionToken?: string }).reconnectionToken ??
        loadReconnectToken()
      saveReconnectToken(token)
      roomRef.current = null
      if (manualLeaveRef.current) {
        clearReconnectToken()
        setConnected(false)
        setSessionId(null)
        setRoomId(null)
        setRoomCode(null)
        setRoomState(null)
        setPositions({})
        setResults(null)
        setCountdown(null)
        setHustle(null)
        setHustleEvent(null)
        setStall(null)
        setStallEvent(null)
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
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt++) {
      if (manualLeaveRef.current) return
      try {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS))
        if (manualLeaveRef.current) return
        const nextRoom = await client.reconnect(token)
        if (manualLeaveRef.current) {
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
    setConnected(false)
    setReconnecting(false)
    setSessionId(null)
    setRoomId(null)
    setRoomCode(null)
    setRoomState(null)
    setPositions({})
    setResults(null)
    setCountdown(null)
    setHustle(null)
    setHustleEvent(null)
    setStall(null)
    setStallEvent(null)
  }, [attachRoom])

  const leaveRoom = useCallback(() => {
    manualLeaveRef.current = true
    clearReconnectToken()
    setReconnecting(false)
    roomRef.current?.leave()
    roomRef.current = null
    setConnected(false)
    setSessionId(null)
    setRoomId(null)
    setRoomCode(null)
    setRoomState(null)
    setPositions({})
    setResults(null)
    setCountdown(null)
    setHustle(null)
    setHustleEvent(null)
    setStall(null)
    setStallEvent(null)
  }, [])

  const authorize = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/token")
      if (!response.ok) return
      const body = (await response.json()) as { token: string | null }
      if (body.token) {
        getClient().auth.token = body.token
      }
    } catch {
      // unsigned requests join as guests
    }
  }, [getClient])

  const connect = useCallback(async (loadout?: AvatarLoadout) => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      await authorize()
      const room = await getClient().joinOrCreate("race", loadout ? { loadout } : undefined)
      attachRoom(room)
    } catch (err) {
      console.error("Failed to connect to Colyseus server:", err)
    }
  }, [getClient, attachRoom, authorize])

  const quickPlay = useCallback(async (loadout?: AvatarLoadout) => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      await authorize()
      const room = await getClient().joinOrCreate("race", loadout ? { loadout } : undefined)
      attachRoom(room)
    } catch (err) {
      console.error("Quick play failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [getClient, attachRoom, authorize])

  const createRace = useCallback(async (loadout?: AvatarLoadout) => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      await authorize()
      const room = await getClient().create("race", loadout ? { loadout } : undefined)
      attachRoom(room)
    } catch (err) {
      console.error("Create race failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [getClient, attachRoom, authorize])

  /** Start a solo hustle shift (simulated jobs; no other players needed). */
  const startHustle = useCallback(async (hustleId: string, loadout?: AvatarLoadout) => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      await authorize()
      const room = await getClient().create("hustle", { hustle: hustleId, ...(loadout ? { loadout } : {}) })
      attachRoom(room)
    } catch (err) {
      console.error("Start hustle failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [getClient, attachRoom, authorize])

  /** Start a stall shift (rolex stand or car wash). */
  const startStall = useCallback(async (kind: "rolex" | "carwash") => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      await authorize()
      const room = await getClient().create("stall", { stall: kind })
      attachRoom(room)
    } catch (err) {
      console.error("Start stall failed:", err)
      throw toFriendlyJoinError(err)
    }
  }, [getClient, attachRoom, authorize])

  /** Any stall action: buyStock, cook, flip, run, scrub, rinse, close. */
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
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      await authorize()
      const room = await getClient().joinById(id, loadout ? { loadout } : undefined)
      attachRoom(room)
    } catch (err) {
      throw toFriendlyJoinError(err)
    }
  }, [getClient, attachRoom, authorize])

  const listRaces = useCallback(async (): Promise<RaceListing[]> => {
    const baseUrl =
      process.env.NEXT_PUBLIC_RACES_API_URL ?? "http://localhost:2568"
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
      locked?: boolean
    }>
    return data.map((listed) => ({
      roomId: listed.roomId,
      roomCode: listed.roomCode,
      phase: listed.phase,
      playerCount: listed.playerCount,
      maxClients: listed.maxClients,
      countdownSeconds: listed.countdownSeconds,
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
    getClient()
      .reconnect(token)
      .then((room) => {
        if (manualLeaveRef.current) {
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
    needs,
    hustle,
    hustleEvent,
    stall,
    stallEvent,
    selfPosition,
    countdown,
    connect,
    disconnect,
    leaveRoom,
    quickPlay,
    createRace,
    startHustle,
    startStall,
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
