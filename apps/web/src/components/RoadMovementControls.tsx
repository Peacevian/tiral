"use client"

import type { RoadDirection, RoadGraph, RoadPosition } from "@tiral/road-graph"
import { ThumbStick } from "./ThumbStick"

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
    <>
      <div className="absolute bottom-[max(11rem,calc(env(safe-area-inset-bottom)+10rem))] left-1/2 z-30 w-[min(92vw,430px)] -translate-x-1/2 rounded-2xl border border-transparent bg-transparent p-2 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] sm:bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:border-white/15 sm:bg-slate-950/88 sm:p-3 sm:shadow-2xl sm:backdrop-blur-md sm:drop-shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Road movement</div>
            <div className="mt-1 text-sm text-slate-200">{loading && "Loading walkable roads..."}{error && <span className="text-rose-300">{error}</span>}{!loading && !error && (edge?.name || edge?.highway || "Snapped to road")}</div>
          </div>
          {nearJunction && distanceToJunction !== null && <div className="text-right text-xs text-amber-200">Junction in {Math.ceil(distanceToJunction)}m</div>}
        </div>
        {turnIntent && !locked && (
          <div className="mt-1 text-center text-xs font-bold text-amber-200">
            {turnIntent === "straight" ? "→ Going straight" : turnIntent === "left" ? "← Turning left" : "Turning right →"}
          </div>
        )}
        <div className="mt-1 min-h-4 text-center text-[11px] text-slate-400">{locked ? "Positions locked — race starts at zero" : (feedback ?? (<><span className="tiral-keyboard-hint">W / ↑ walk · A / ← left · D / → right · S / ↓ turn around · Space stop</span><span className="tiral-touch-hint">Left stick walks · right stick turns</span></>))}</div>
      </div>
      <div className="tiral-sticks">
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-30 touch-none">
          <ThumbStick
            axis="vertical"
            disabled={!position || locked}
            active={moving}
            onWalkChange={onMovingChange}
            onTurnAround={onTurnAround}
          />
        </div>
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-30 touch-none">
          <ThumbStick
            axis="horizontal"
            disabled={!position || locked}
            active={false}
            onTurn={onRequestTurn}
          />
        </div>
      </div>
    </>
  )
}
