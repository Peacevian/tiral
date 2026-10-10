"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Client } from "@colyseus/sdk"
import type { Room } from "@colyseus/sdk"
import type { RoadDirection } from "@tiral/road-graph"

type RoomPlayer = {
  id: string
  name: string
  startPointId: string | null
  roadPosition: { edgeId: string; distanceAlongEdge: number; direction: 1 | -1 } | null
  coordinate: { lat: number; lng: number } | null
  moving?: boolean
  finishPosition?: number | null
  connected?: boolean
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

export type RemotePositions = Record<
  string,
  {
    roadPosition: RoomPlayer["roadPosition"]
    coordinate: RoomPlayer["coordinate"]
    moving: boolean
  }
>

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

export function useColyseus({ serverUrl = "ws://localhost:2567" }: UseColyseusOptions = {}) {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [positions, setPositions] = useState<RemotePositions>({})
  const [results, setResults] = useState<RaceResult[] | null>(null)
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

    room.onLeave((code) => {
      const token = (room as unknown as { reconnectionToken?: string }).reconnectionToken
      roomRef.current = null
      if (manualLeaveRef.current) {
        setConnected(false)
        setSessionId(null)
        setRoomId(null)
        setRoomCode(null)
        setRoomState(null)
        setPositions({})
        setResults(null)
        setCountdown(null)
        return
      }
      void attemptReconnect(code, token)
    })
  }, [])

  const attemptReconnect = useCallback(async (_code: number, token?: string) => {
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
    setConnected(false)
    setReconnecting(false)
    setSessionId(null)
    setRoomId(null)
    setRoomCode(null)
    setRoomState(null)
    setPositions({})
    setResults(null)
    setCountdown(null)
  }, [attachRoom])

  const leaveRoom = useCallback(() => {
    manualLeaveRef.current = true
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
  }, [])

  const connect = useCallback(async () => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      const room = await getClient().joinOrCreate("race")
      attachRoom(room)
    } catch (err) {
      console.error("Failed to connect to Colyseus server:", err)
    }
  }, [getClient, attachRoom])

  const quickPlay = useCallback(async () => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      const room = await getClient().joinOrCreate("race")
      attachRoom(room)
    } catch (err) {
      console.error("Quick play failed:", err)
      throw err
    }
  }, [getClient, attachRoom])

  const createRace = useCallback(async () => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      const room = await getClient().create("race")
      attachRoom(room)
    } catch (err) {
      console.error("Create race failed:", err)
      throw err
    }
  }, [getClient, attachRoom])

  const joinRace = useCallback(async (id: string) => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      const room = await getClient().joinById(id)
      attachRoom(room)
    } catch (err) {
      console.error("Join race failed:", err)
      throw err
    }
  }, [getClient, attachRoom])

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

  const joinByCode = useCallback(async (code: string) => {
    const races = await listRaces()
    const match = races.find(
      (race) => race.roomCode.toUpperCase() === code.trim().toUpperCase()
    )
    if (!match) {
      throw new Error("No open race with that code")
    }
    await joinRace(match.roomId)
  }, [listRaces, joinRace])

  const disconnect = useCallback(() => {
    leaveRoom()
    clientRef.current = null
  }, [leaveRoom])

  const sendWalk = useCallback((on: boolean) => {
    roomRef.current?.send("walk", on)
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

  const sendPlayAgain = useCallback(() => {
    roomRef.current?.send("playAgain")
  }, [])

  const sendStartNow = useCallback(() => {
    roomRef.current?.send("startNow")
  }, [])

  useEffect(() => {
    return () => {
      manualLeaveRef.current = true
      roomRef.current?.leave()
    }
  }, [])

  return {
    connected,
    reconnecting,
    sessionId,
    roomId,
    roomCode,
    roomState,
    positions,
    results,
    countdown,
    connect,
    disconnect,
    leaveRoom,
    quickPlay,
    createRace,
    joinRace,
    joinByCode,
    listRaces,
    sendWalk,
    sendTurn,
    sendTurnAround,
    sendSelectStart,
    sendPlayAgain,
    sendStartNow
  }
}
