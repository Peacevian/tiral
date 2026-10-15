"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useColyseus } from "@/lib/useColyseus"

type ColyseusContextValue = ReturnType<typeof useColyseus>

/** Just whether a room is open, and how to leave it: changes rarely. */
export type ColyseusStatus = Pick<ColyseusContextValue, "connected" | "reconnecting" | "leaveRoom">

const ColyseusContext = createContext<ColyseusContextValue | null>(null)
const ColyseusStatusContext = createContext<ColyseusStatus | null>(null)

export function ColyseusProvider({ children }: { children: ReactNode }) {
  const value = useColyseus()
  // The full value changes with every position update (10 times a second in a
  // race). Components that only care about connected/reconnecting read this
  // memoised slice instead, so they (e.g. the app nav on every page) don't
  // re-render with each update.
  const status = useMemo<ColyseusStatus>(
    () => ({ connected: value.connected, reconnecting: value.reconnecting, leaveRoom: value.leaveRoom }),
    [value.connected, value.reconnecting, value.leaveRoom]
  )
  return (
    <ColyseusStatusContext.Provider value={status}>
      <ColyseusContext.Provider value={value}>{children}</ColyseusContext.Provider>
    </ColyseusStatusContext.Provider>
  )
}

export function useColyseusContext(): ColyseusContextValue {
  const value = useContext(ColyseusContext)
  if (!value) {
    throw new Error("useColyseusContext must be used inside ColyseusProvider")
  }
  return value
}

/** Connected / reconnecting / leaveRoom only: doesn't re-render on position updates. */
export function useColyseusStatus(): ColyseusStatus {
  const value = useContext(ColyseusStatusContext)
  if (!value) {
    throw new Error("useColyseusStatus must be used inside ColyseusProvider")
  }
  return value
}
