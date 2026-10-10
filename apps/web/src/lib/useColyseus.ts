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

type UseColyseusOptions = {
  serverUrl?: string
}

const RECONNECT_ATTEMPTS = 4
const RECONNECT_DELAY_MS = 2000

export function useColyseus({ serverUrl = "ws://localhost:2567" }: UseColyseusOptions = {}) {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [positions, setPositions] = useState<RemotePositions>({})
  const [results, setResults] = useState<RaceResult[] | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const roomRef = useRef<Room | null>(null)
  const clientRef = useRef<Client | null>(null)
  const manualLeaveRef = useRef(false)

  const attachRoom = useCallback((room: Room) => {
    roomRef.current = room
    setSessionId(room.sessionId)
    setConnected(true)
    setReconnecting(false)

    room.onMessage("roomState", (state: RoomState) => {
      setRoomState(state)
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
    setRoomState(null)
    setPositions({})
    setResults(null)
    setCountdown(null)
  }, [attachRoom])

  const connect = useCallback(async () => {
    if (roomRef.current) return
    manualLeaveRef.current = false
    try {
      const client = new Client(serverUrl)
      clientRef.current = client
      const room = await client.joinOrCreate("race")
      attachRoom(room)
    } catch (err) {
      console.error("Failed to connect to Colyseus server:", err)
    }
  }, [serverUrl, attachRoom])

  const disconnect = useCallback(() => {
    manualLeaveRef.current = true
    setReconnecting(false)
    roomRef.current?.leave()
    roomRef.current = null
    clientRef.current = null
    setConnected(false)
    setSessionId(null)
    setRoomState(null)
    setPositions({})
    setResults(null)
    setCountdown(null)
  }, [])

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
    roomState,
    positions,
    results,
    countdown,
    connect,
    disconnect,
    sendWalk,
    sendTurn,
    sendTurnAround,
    sendSelectStart,
    sendPlayAgain,
    sendStartNow
  }
}
