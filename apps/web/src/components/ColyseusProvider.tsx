"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useColyseus } from "@/lib/useColyseus"

type ColyseusContextValue = ReturnType<typeof useColyseus>

const ColyseusContext = createContext<ColyseusContextValue | null>(null)

export function ColyseusProvider({ children }: { children: ReactNode }) {
  const value = useColyseus()
  return <ColyseusContext.Provider value={value}>{children}</ColyseusContext.Provider>
}

export function useColyseusContext(): ColyseusContextValue {
  const value = useContext(ColyseusContext)
  if (!value) {
    throw new Error("useColyseusContext must be used inside ColyseusProvider")
  }
  return value
}
