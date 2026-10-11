"use client"

import { useRef, useState } from "react"
import type { RoadDirection } from "@tiral/road-graph"

const RADIUS = 52
const DEADZONE = 12

type Zone = "up" | "down" | "left" | "right" | null

export function ThumbStick({
  axis,
  disabled,
  active,
  onWalkChange,
  onTurn,
  onTurnAround
}: {
  axis: "vertical" | "horizontal"
  disabled: boolean
  active: boolean
  onWalkChange?(walking: boolean): void
  onTurn?(direction: Extract<RoadDirection, "left" | "right">): void
  onTurnAround?(): void
}) {
  const baseRef = useRef<HTMLDivElement>(null)
  const engagedRef = useRef(false)
  const walkingRef = useRef(false)
  const firedZoneRef = useRef<Zone>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [activeZone, setActiveZone] = useState<Zone>(null)

  const stop = () => {
    engagedRef.current = false
    firedZoneRef.current = null
    setKnob({ x: 0, y: 0 })
    setActiveZone(null)
    if (walkingRef.current) {
      walkingRef.current = false
      onWalkChange?.(false)
    }
  }

  const handleMove = (clientX: number, clientY: number) => {
    const base = baseRef.current
    if (!base || !engagedRef.current || disabled) return
    const rect = base.getBoundingClientRect()
    let dx = clientX - (rect.left + rect.width / 2)
    let dy = clientY - (rect.top + rect.height / 2)
    if (axis === "vertical") {
      dx = 0
      dy = Math.max(-RADIUS, Math.min(RADIUS, dy))
    } else {
      dy = 0
      dx = Math.max(-RADIUS, Math.min(RADIUS, dx))
    }
    setKnob({ x: dx, y: dy })

    let zone: Zone = null
    if (Math.hypot(dx, dy) >= DEADZONE) {
      if (axis === "vertical") zone = dy < 0 ? "up" : "down"
      else zone = dx > 0 ? "right" : "left"
    }
    setActiveZone(zone)

    if (axis === "vertical") {
      if (zone === "up") {
        if (!walkingRef.current) {
          walkingRef.current = true
          onWalkChange?.(true)
        }
      } else if (walkingRef.current) {
        walkingRef.current = false
        onWalkChange?.(false)
      }
      if (zone === null || zone === "up") {
        if (zone === null) firedZoneRef.current = null
        return
      }
      if (zone === firedZoneRef.current) return
      firedZoneRef.current = zone
      onTurnAround?.()
    } else {
      if (zone !== "left" && zone !== "right") {
        firedZoneRef.current = null
        return
      }
      if (zone === firedZoneRef.current) return
      firedZoneRef.current = zone
      onTurn?.(zone)
    }
  }

  return (
    <div
      ref={baseRef}
      onPointerDown={(event) => {
        if (disabled) return
        engagedRef.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        handleMove(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        if (engagedRef.current) handleMove(event.clientX, event.clientY)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      className={`relative h-32 w-32 touch-none select-none rounded-full border-2 bg-slate-950/60 backdrop-blur-sm sm:bg-slate-950/80 ${
        disabled ? "border-white/10 opacity-40" : "border-cyan-300/40"
      }`}
    >
      {axis === "vertical" ? (
        <>
          <span className={`absolute left-1/2 top-1 -translate-x-1/2 text-sm font-black ${activeZone === "up" ? "text-cyan-300" : "text-slate-500"}`}>
            ▲
          </span>
          <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-sm font-black ${activeZone === "down" ? "text-cyan-300" : "text-slate-500"}`}>
            ▼
          </span>
        </>
      ) : (
        <>
          <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 text-sm font-black ${activeZone === "left" ? "text-cyan-300" : "text-slate-500"}`}>
            ◀
          </span>
          <span className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-sm font-black ${activeZone === "right" ? "text-cyan-300" : "text-slate-500"}`}>
            ▶
          </span>
        </>
      )}
      <div
        className={`absolute left-1/2 top-1/2 h-14 w-14 rounded-full shadow-lg ${
          active ? "bg-cyan-300" : "bg-slate-200/90"
        }`}
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`
        }}
      />
    </div>
  )
}
