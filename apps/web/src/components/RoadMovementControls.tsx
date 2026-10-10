"use client"

import type { RoadDirection, RoadGraph, RoadPosition } from "@tiral/road-graph"
import { MovementJoystick } from "./MovementJoystick"

type Props = {
  graph: RoadGraph | null
  position: RoadPosition | null
  moving: boolean
  loading: boolean
  error: string | null
  turnIntent: RoadDirection | null
  feedback: string | null
  distanceToJunction: number | null
  availableDirections: RoadDirection[]
  locked: boolean
  onMovingChange(moving: boolean): void
  onRequestTurn(direction: RoadDirection): void
  onTurnAround(): void
}

export function RoadMovementControls({ graph, position, moving, loading, error, turnIntent, feedback, distanceToJunction, availableDirections, locked, onMovingChange, onRequestTurn, onTurnAround }: Props) {
  const edge = position && graph ? graph.edges[position.edgeId] : null
  const nearJunction = distanceToJunction !== null && distanceToJunction <= 28

  return (
    <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 w-[min(92vw,430px)] -translate-x-1/2 touch-none rounded-2xl border border-transparent bg-transparent p-2 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] sm:border-white/15 sm:bg-slate-950/88 sm:p-3 sm:shadow-2xl sm:backdrop-blur-md sm:drop-shadow-none">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Road movement</div>
          <div className="mt-1 text-sm text-slate-200">{loading && "Loading walkable roads..."}{error && <span className="text-rose-300">{error}</span>}{!loading && !error && (edge?.name || edge?.highway || "Snapped to road")}</div>
        </div>
        {nearJunction && distanceToJunction !== null && <div className="text-right text-xs text-amber-200">Junction in {Math.ceil(distanceToJunction)}m</div>}
      </div>

      <div className="mb-2 flex items-center justify-center gap-3">
        <MovementJoystick
          disabled={!position || locked}
          walking={moving}
          onWalkChange={onMovingChange}
          onTurn={onRequestTurn}
          onTurnAround={onTurnAround}
        />
        <div className="flex w-24 flex-col gap-2">
          <button type="button" onClick={onTurnAround} disabled={!position || locked} className="rounded-xl bg-slate-700/90 px-2 py-2.5 text-xs font-bold disabled:opacity-40 sm:bg-slate-700">Turn</button>
          <button type="button" onClick={() => onMovingChange(!moving)} disabled={!position || locked} className="rounded-xl bg-amber-400 px-2 py-2.5 text-xs font-black text-slate-950 disabled:opacity-40">{moving ? "Stop" : "Auto"}</button>
        </div>
      </div>
      {turnIntent && !locked && (
        <div className="mb-2 text-center text-xs font-bold text-amber-200">
          {turnIntent === "straight" ? "→ Going straight" : turnIntent === "left" ? "← Turning left" : "Turning right →"}
        </div>
      )}
      <div className="mt-2 min-h-4 text-center text-[11px] text-slate-400">{locked ? "Positions locked — race starts at zero" : (feedback ?? (<><span className="tiral-keyboard-hint">Stick or W / ↑ walk · A / ← left · D / → right · S / ↓ turn around</span><span className="tiral-touch-hint">Push stick up to walk · tilt to turn · pull down to turn around</span></>))}</div>
    </div>
  )
}
