"use client"

import { useState } from "react"
import type { RoadDirection, RoadGraph, RoadPosition } from "@tiral/road-graph"
import { ThumbStick } from "../ThumbStick"

type ControlDeckProps = {
  // movement status
  graph: RoadGraph | null
  position: RoadPosition | null
  moving: boolean
  loadingRoads: boolean
  roadError: string | null
  turnIntent: RoadDirection | null
  feedback: string | null
  distanceToJunction: number | null
  locked: boolean
  onMovingChange(moving: boolean): void
  onTurnAround(): void
  onRequestTurn(direction: RoadDirection): void
  // start picking (lobby / countdown only): explicit arm-then-tap placement
  showStarts: boolean
  hasStartPin: boolean
  placementArmed: boolean
  onTogglePlacement(): void
  // solo start
  showSolo: boolean
  onStartNow(): void
  // transient tap feedback (e.g. rejected pin placement)
  notice: string | null
}

// Single bottom control deck: start chips pre-race, slim status while racing,
// thumb sticks overlaid for touch devices. Mobile-first, safe-area aware.
export function ControlDeck({
  graph,
  position,
  moving,
  loadingRoads,
  roadError,
  turnIntent,
  feedback,
  distanceToJunction,
  locked,
  onMovingChange,
  onTurnAround,
  onRequestTurn,
  showStarts,
  hasStartPin,
  placementArmed,
  onTogglePlacement,
  showSolo,
  onStartNow,
  notice
}: ControlDeckProps) {
  const edge = position && graph ? graph.edges[position.edgeId] : null
  const nearJunction = distanceToJunction !== null && distanceToJunction <= 28
  const statusText = loadingRoads
    ? "Loading walkable roads…"
    : (roadError ?? edge?.name ?? edge?.highway ?? "Snapped to road")
  // Collapsible deck: folded away leaves only the joysticks (plus a reopen tab).
  const [deckOpen, setDeckOpen] = useState(true)
  const sticksHigh = showStarts && deckOpen && !hasStartPin

  return (
    <>
      {deckOpen ? (
      <div className="absolute inset-x-0 bottom-0 z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setDeckOpen(false)}
            aria-label="Collapse controls"
            className="flex min-h-[28px] w-full items-center justify-center text-[10px] font-bold tracking-[0.25em] text-slate-500"
          >
            ▾
          </button>
          {showStarts && !hasStartPin && (
            <div className="px-2.5">
              <button
                type="button"
                onClick={onTogglePlacement}
                className={`min-h-[44px] w-full rounded-xl px-3 py-2 text-sm font-black transition ${
                  placementArmed
                    ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                    : "border border-amber-300/50 text-amber-200 hover:bg-amber-400/10"
                }`}
              >
                {placementArmed ? "Done ✓" : "📍 Set my start"}
              </button>
              <div className="mt-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs font-bold text-slate-300">
                {placementArmed
                  ? "Tap anywhere on the map to drop your pin"
                  : "No start yet — tap Set my start"}
              </div>
            </div>
          )}
          {showStarts && showSolo && (
            <div className="px-2.5">
              <button
                type="button"
                onClick={onStartNow}
                className="mt-1 min-h-[44px] w-full rounded-xl bg-cyan-500 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-400"
              >
                Start now (solo)
              </button>
            </div>
          )}
          {notice && (
            <div className="mx-3 mb-2 rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-center text-xs font-bold text-amber-100">
              {notice}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-1.5">
            <div className="min-w-0 flex-1 truncate text-[11px] text-slate-300">
              {turnIntent ? (
                <span className="font-bold text-amber-200">
                  {turnIntent === "straight" ? "→ Straight" : turnIntent === "left" ? "← Left" : "Right →"}
                </span>
              ) : (
                statusText
              )}
              {feedback ? <span className="text-slate-400"> · {feedback}</span> : null}
            </div>
            {nearJunction && distanceToJunction !== null && (
              <div className="shrink-0 rounded-lg bg-amber-400/15 px-2 py-1 text-[11px] font-bold text-amber-200">
                ⑂ {Math.ceil(distanceToJunction)}m
              </div>
            )}
            {locked && !showStarts && (
              <div className="shrink-0 text-[11px] font-bold text-slate-400">🔒</div>
            )}
          </div>
        </div>
      </div>
      ) : (
      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setDeckOpen(true)}
          aria-label="Show controls"
          className="rounded-full border border-white/15 bg-slate-950/80 px-5 py-2 text-[11px] font-bold tracking-[0.2em] text-slate-300 shadow-xl backdrop-blur-md"
        >
          ▴ CONTROLS
        </button>
      </div>
      )}
      <div className="tiral-sticks">
        <div
          className={`absolute left-[max(0.5rem,env(safe-area-inset-left))] z-30 touch-none ${
            sticksHigh
              ? "bottom-[max(13rem,calc(env(safe-area-inset-bottom)+12rem))]"
              : "bottom-[max(3.5rem,calc(env(safe-area-inset-bottom)+3rem))]"
          }`}
        >
          <ThumbStick
            axis="vertical"
            size={100}
            disabled={!position || locked}
            active={moving}
            onWalkChange={onMovingChange}
            onTurnAround={onTurnAround}
          />
        </div>
        <div
          className={`absolute right-[max(0.5rem,env(safe-area-inset-right))] z-30 touch-none ${
            sticksHigh
              ? "bottom-[max(13rem,calc(env(safe-area-inset-bottom)+12rem))]"
              : "bottom-[max(3.5rem,calc(env(safe-area-inset-bottom)+3rem))]"
          }`}
        >
          <ThumbStick
            axis="horizontal"
            size={100}
            disabled={!position || locked}
            active={false}
            onTurn={onRequestTurn}
          />
        </div>
      </div>
    </>
  )
}
