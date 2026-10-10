"use client"

import { useRef, useState } from "react"
import type { RoadDirection } from "@tiral/road-graph"

const RADIUS = 52
const DEADZONE = 12

type Zone = "up" | "down" | "left" | "right" | null

function zoneFor(dx: number, dy: number): Zone {
  if (Math.hypot(dx, dy) < DEADZONE) return null
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? "up" : "down"
  return dx > 0 ? "right" : "left"
}

export function MovementJoystick({
  disabled,
  walking,
  onWalkChange,
  onTurn,
  onTurnAround
}: {
  disabled: boolean
  walking: boolean
  onWalkChange(walking: boolean): void
  onTurn(direction: RoadDirection): void
  onTurnAround(): void
}) {
  const baseRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)
  const walkingRef = useRef(false)
  const firedZoneRef = useRef<Zone>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [activeZone, setActiveZone] = useState<Zone>(null)

  const stop = () => {
    activeRef.current = false
    firedZoneRef.current = null
    setKnob({ x: 0, y: 0 })
    setActiveZone(null)
    if (walkingRef.current) {
      walkingRef.current = false
      onWalkChange(false)
    }
  }

  const handleMove = (clientX: number, clientY: number) => {
    const base = baseRef.current
    if (!base || !activeRef.current || disabled) return
    const rect = base.getBoundingClientRect()
    let dx = clientX - (rect.left + rect.width / 2)
    let dy = clientY - (rect.top + rect.height / 2)
    const magnitude = Math.hypot(dx, dy)
    if (magnitude > RADIUS) {
      dx = (dx / magnitude) * RADIUS
      dy = (dy / magnitude) * RADIUS
    }
    setKnob({ x: dx, y: dy })

    const zone = zoneFor(dx, dy)
    setActiveZone(zone)

    if (zone === "up") {
      if (!walkingRef.current) {
        walkingRef.current = true
        onWalkChange(true)
      }
    } else if (walkingRef.current) {
      walkingRef.current = false
      onWalkChange(false)
    }

    if (zone === null) {
      firedZoneRef.current = null
      return
    }
    if (zone === "up" || zone === firedZoneRef.current) return
    firedZoneRef.current = zone
    if (zone === "down") {
      onTurnAround()
    } else {
      onTurn(zone)
    }
  }

  return (
    <div
      ref={baseRef}
      onPointerDown={(event) => {
        if (disabled) return
        activeRef.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        handleMove(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        if (activeRef.current) handleMove(event.clientX, event.clientY)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      className={`relative mx-auto h-32 w-32 touch-none select-none rounded-full border-2 bg-slate-950/60 backdrop-blur-sm sm:bg-slate-950/80 ${
        disabled ? "border-white/10 opacity-40" : "border-cyan-300/40"
      }`}
    >
      <span className={`absolute left-1/2 top-1 -translate-x-1/2 text-sm font-black ${activeZone === "up" ? "text-cyan-300" : "text-slate-500"}`}>
        ▲
      </span>
      <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-sm font-black ${activeZone === "down" ? "text-cyan-300" : "text-slate-500"}`}>
        ▼
      </span>
      <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 text-sm font-black ${activeZone === "left" ? "text-cyan-300" : "text-slate-500"}`}>
        ◀
      </span>
      <span className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-sm font-black ${activeZone === "right" ? "text-cyan-300" : "text-slate-500"}`}>
        ▶
      </span>
      <div
        className={`absolute left-1/2 top-1/2 h-14 w-14 rounded-full shadow-lg ${
          walking ? "bg-cyan-300" : "bg-slate-200/90"
        }`}
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`
        }}
      />
    </div>
  )
}
