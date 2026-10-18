"use client"

import { useEffect, useState } from "react"
import type { RoadDirection } from "@tiral/road-graph"

// The running controls, fixed in the corners: sprint (hold) bottom-left, and
// the arrow pad bottom-right. Every action is one tap on its own button: ↑
// starts running and tapped again stops, ← / → pick the next turn (it stays
// lit until the junction; tap it again to undo), ↓ turns around. The runner
// keeps going between taps, so the thumb can rest. The pad flashes, and the
// phone buzzes, when a picked turn is taken.

export type SprintControl = { active: boolean; disabled: boolean; empty: boolean; onChange(on: boolean): void }

const KEY = "flex h-14 w-14 touch-manipulation select-none items-center justify-center rounded-2xl text-2xl font-black shadow-xl transition active:scale-90 disabled:opacity-40"
const IDLE = "border-2 border-flame/60 bg-sheet-card text-flame-deep"
const LIT = "bg-flame text-white"

export function ControlBar({
  disabled,
  moving,
  pickedTurn,
  turnLandedAt,
  onToggleRun,
  onTurn,
  onCancelTurn,
  onTurnAround,
  sprint
}: {
  disabled: boolean
  moving: boolean
  /** The turn picked (or queued) for the next junction. */
  pickedTurn: RoadDirection | null
  turnLandedAt: number
  onToggleRun(): void
  onTurn(direction: RoadDirection): void
  onCancelTurn(): void
  onTurnAround(): void
  sprint: SprintControl | null
}) {
  // Flash (and buzz, where phones allow it: not iPhones) when a picked turn is taken.
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!turnLandedAt) return
    setFlash(true)
    navigator.vibrate?.(30)
    const id = setTimeout(() => setFlash(false), 450)
    return () => clearTimeout(id)
  }, [turnLandedAt])

  const turnKey = (direction: "left" | "right") => {
    const lit = pickedTurn === direction
    return (
      <button
        type="button"
        disabled={disabled}
        aria-pressed={lit}
        aria-label={lit ? `Cancel ${direction} turn` : `Turn ${direction} at the next junction`}
        onClick={() => (lit ? onCancelTurn() : onTurn(direction))}
        className={`${KEY} ${lit ? LIT : IDLE}`}
      >
        {direction === "left" ? "←" : "→"}
      </button>
    )
  }

  return (
    // The row lets touches through to the map; only the buttons catch them.
    <div className="pointer-events-none flex items-end justify-between gap-2">
      {sprint ? (
        <button
          type="button"
          disabled={sprint.disabled}
          aria-pressed={sprint.active}
          aria-label="Sprint (hold)"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            sprint.onChange(true)
          }}
          onPointerUp={() => sprint.onChange(false)}
          onPointerCancel={() => sprint.onChange(false)}
          onLostPointerCapture={() => sprint.onChange(false)}
          onContextMenu={(event) => event.preventDefault()}
          className={`pointer-events-auto mb-1 flex h-[76px] w-[76px] touch-none select-none flex-col items-center justify-center rounded-full text-2xl font-black shadow-xl transition disabled:opacity-40 ${
            sprint.active ? (sprint.empty ? "scale-95 bg-red-600 text-white" : "scale-95 bg-flame text-white") : "border-[3px] border-flame bg-sheet-card text-flame-deep"
          }`}
        >
          ⚡<span className="text-[11px] font-black uppercase">Sprint</span>
        </button>
      ) : (
        <span />
      )}

      <div
        role="group"
        aria-label="Running controls"
        className={`pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1 rounded-[28px] p-1 transition ${flash ? "bg-leaf/40 ring-4 ring-leaf/40" : ""}`}
      >
        <span />
        <button
          type="button"
          disabled={disabled}
          aria-pressed={moving}
          aria-label={moving ? "Stop" : "Run"}
          onClick={onToggleRun}
          className={`${KEY} flex-col ${moving ? LIT : IDLE}`}
        >
          {moving ? "■" : "↑"}
          <span className="text-[10px] font-black uppercase leading-none">{moving ? "Stop" : "Run"}</span>
        </button>
        <span />
        {turnKey("left")}
        <span />
        {turnKey("right")}
        <span />
        <button type="button" disabled={disabled} aria-label="Turn around" onClick={onTurnAround} className={`${KEY} ${IDLE}`}>
          ↓
        </button>
        <span />
      </div>
    </div>
  )
}
