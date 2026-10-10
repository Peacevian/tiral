"use client"

import type { RoadDirection, RoadGraph, RoadPosition } from "@tiral/road-graph"

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

function DirectionButton({ label, enabled, selected, onClick }: {
  label: string
  direction: RoadDirection
  enabled: boolean
  selected: boolean
  onClick(): void
}) {
  return (
    <button type="button" onClick={onClick} disabled={!enabled} className={`rounded-xl border px-3 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-30 ${selected ? "border-cyan-200 bg-cyan-300 text-slate-950" : "border-white/10 bg-white/10 text-white hover:bg-white/20"}`}>
      {label}
    </button>
  )
}

export function RoadMovementControls({ graph, position, moving, loading, error, turnIntent, feedback, distanceToJunction, availableDirections, locked, onMovingChange, onRequestTurn, onTurnAround }: Props) {
  const edge = position && graph ? graph.edges[position.edgeId] : null
  const nearJunction = distanceToJunction !== null && distanceToJunction <= 28

  return (
    <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 w-[min(92vw,430px)] -translate-x-1/2 touch-none rounded-2xl border border-white/15 bg-slate-950/88 p-3 text-white shadow-2xl backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Road movement</div>
          <div className="mt-1 text-sm text-slate-200">{loading && "Loading walkable roads..."}{error && <span className="text-rose-300">{error}</span>}{!loading && !error && (edge?.name || edge?.highway || "Snapped to road")}</div>
        </div>
        {nearJunction && distanceToJunction !== null && <div className="text-right text-xs text-amber-200">Junction in {Math.ceil(distanceToJunction)}m</div>}
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2">
        <div />
        <DirectionButton label="Straight" direction="straight" enabled={!locked && availableDirections.includes("straight")} selected={turnIntent === "straight"} onClick={() => onRequestTurn("straight")} />
        <div />
        <DirectionButton label="Left" direction="left" enabled={!locked && availableDirections.includes("left")} selected={turnIntent === "left"} onClick={() => onRequestTurn("left")} />
        <button type="button" onPointerDown={() => onMovingChange(true)} onPointerUp={() => onMovingChange(false)} onPointerCancel={() => onMovingChange(false)} onPointerLeave={() => onMovingChange(false)} disabled={!position || locked} className="rounded-xl bg-cyan-500 px-3 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-40">Walk</button>
        <DirectionButton label="Right" direction="right" enabled={!locked && availableDirections.includes("right")} selected={turnIntent === "right"} onClick={() => onRequestTurn("right")} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onTurnAround} disabled={!position || locked} className="rounded-xl bg-slate-700 px-3 py-3 text-sm font-bold disabled:opacity-40">Turn around</button>
        <button type="button" onClick={() => onMovingChange(!moving)} disabled={!position || locked} className="rounded-xl bg-amber-400 px-3 py-3 text-sm font-black text-slate-950 disabled:opacity-40">{moving ? "Stop" : "Auto walk"}</button>
      </div>
      <div className="mt-2 min-h-4 text-center text-[11px] text-slate-400">{locked ? "Positions locked — race starts at zero" : (feedback ?? (<><span className="tiral-keyboard-hint">W / ↑ walk · A / ← left · D / → right · S / ↓ turn around</span><span className="tiral-touch-hint">Hold Walk to move · tap a direction before junctions</span></>))}</div>
    </div>
  )
}
