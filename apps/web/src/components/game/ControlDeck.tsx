"use client"

import type { ReactNode } from "react"
import { useLayoutEffect, useRef, useState } from "react"
import type { RoadDirection, RoadGraph, RoadPosition } from "@tiral/road-graph"
import type { JunctionOption } from "@/lib/useRoadMovement"
import { ControlBar, type SprintControl } from "./ControlBar"

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
  onCancelTurn(): void
  /** A turn tapped before its junction was close (shown lit like a picked one). */
  queuedTurn: RoadDirection | null
  /** The next junction's choices once it's close (from useRoadMovement). */
  junction: JunctionOption[] | null
  turnLandedAt: number
  /** Hold-to-sprint in the bar (null where sprinting isn't possible yet). */
  sprint: SprintControl | null
  // start picking (lobby / countdown only): explicit arm-then-tap placement
  showStarts: boolean
  hasStartPin: boolean
  /** Shown at the top of the deck before the race (e.g. a prize race's pot). */
  banner?: ReactNode
  /** Rivals in the lobby: whether each has picked a start (where stays secret). */
  rivals: Array<{ id: string; name: string; ready: boolean }>
  placementArmed: boolean
  onTogglePlacement(): void
  // solo start
  showSolo: boolean
  onStartNow(): void
  // transient tap feedback (e.g. rejected pin placement)
  notice: string | null
}

// Single bottom control deck: start chips before the race, then a slim status
// line, with sprint and the arrow pad in the bottom corners underneath.
// Mobile-first, safe-area aware.
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
  onCancelTurn,
  queuedTurn,
  junction,
  turnLandedAt,
  sprint,
  showStarts,
  hasStartPin,
  banner,
  rivals,
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
  // Before the race the start actions stay open. Once the gun goes, the status
  // card folds so the street stays visible. A tap opens it again.
  const showBar = !showStarts
  const [pinned, setPinned] = useState<boolean | null>(null)
  const barRef = useRef(showBar)
  if (barRef.current !== showBar) {
    barRef.current = showBar
    setPinned(null)
  }
  const deckOpen = pinned ?? !showBar
  const deckRef = useRef<HTMLDivElement>(null)
  // Lift the map credits above this deck. Measured before the camera flies.
  useLayoutEffect(() => {
    const node = deckRef.current
    const game = node?.closest(".tiral-game")
    if (!node || !(game instanceof HTMLElement)) return
    const write = () => game.style.setProperty("--tiral-controls", `${node.offsetHeight}px`)
    write()
    const observer = new ResizeObserver(write)
    observer.observe(node)
    return () => {
      observer.disconnect()
      game.style.setProperty("--tiral-controls", "0px")
    }
  }, [])

  const pickedTurn = turnIntent ?? queuedTurn
  const turnStreet = turnIntent ? (junction?.find((option) => option.direction === turnIntent)?.name ?? null) : null

  return (
    <div ref={deckRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
      {deckOpen ? (
        <div className="pointer-events-auto w-full rounded-2xl border border-sheet-line bg-sheet-card/95 shadow-2xl md:backdrop-blur-md">
          <button
            type="button"
            onClick={() => setPinned(false)}
            aria-label="Collapse controls"
            className="relative flex min-h-[44px] w-full items-center justify-center text-[11px] font-bold tracking-[0.25em] text-sheet-mute"
          >
            ▾
          </button>
          {showStarts && banner}
          {showStarts && !hasStartPin && (
            <div className="px-2.5">
              <button
                type="button"
                onClick={onTogglePlacement}
                className={`min-h-[44px] w-full rounded-xl px-3 py-2 text-sm font-black transition ${
                  placementArmed
                    ? "bg-flame text-white hover:bg-flame-dark"
                    : "border border-flame/50 text-flame-deep hover:bg-flame-soft"
                }`}
              >
                {placementArmed ? "Done ✓" : "📍 Set my start"}
              </button>
              <div className="mt-1.5 rounded-xl border border-sheet-line bg-sheet-card px-3 py-2 text-center text-xs font-bold text-sheet-mute">
                {placementArmed
                  ? "Tap anywhere on the map to drop your pin"
                  : "No start yet — tap Set my start"}
              </div>
            </div>
          )}
          {showStarts && rivals.length > 0 && (
            <p className="truncate px-3 pt-1.5 text-center text-[11px] text-sheet-mute" title="Rivals' starts stay secret until the race begins">
              <span className="text-sheet-mute">Rivals · starts revealed at the gun: </span>
              {rivals.map((rival, index) => (
                <span key={rival.id}>
                  {index > 0 && " · "}
                  <span className="font-bold text-sheet-ink">{rival.name}</span>{" "}
                  {rival.ready ? <span className="text-leaf">✓</span> : <span className="text-sheet-mute">choosing…</span>}
                </span>
              ))}
            </p>
          )}
          {showStarts && showSolo && (
            <div className="px-2.5">
              <button
                type="button"
                onClick={onStartNow}
                className="mt-1 min-h-[44px] w-full rounded-xl bg-sheet-blue px-3 py-2 text-sm font-black text-white transition hover:bg-sheet-ink"
              >
                Start now (solo)
              </button>
            </div>
          )}
          {notice && (
            <div className="mx-3 mb-2 rounded-xl border border-flame/40 bg-flame-soft px-3 py-2 text-center text-xs font-bold text-flame-deep">
              {notice}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-1.5">
            <div className="min-w-0 flex-1 truncate text-[11px] text-sheet-mute">
              {pickedTurn ? (
                <span className="font-bold text-flame-deep">
                  {pickedTurn === "straight" ? "↑ Straight on" : pickedTurn === "left" ? "← Left" : "→ Right"}
                  {turnStreet ? ` onto ${turnStreet}` : turnIntent ? "" : " at the next junction"}
                </span>
              ) : (
                statusText
              )}
              {feedback ? <span className="text-sheet-mute"> · {feedback}</span> : null}
            </div>
            {nearJunction && distanceToJunction !== null && (
              <div className="shrink-0 rounded-lg bg-flame-soft px-2 py-1 text-[11px] font-bold text-sheet-blue">
                ⑂ {Math.ceil(distanceToJunction)}m
              </div>
            )}
            {locked && !showStarts && (
              <div className="shrink-0 text-[11px] font-bold text-sheet-mute">🔒</div>
            )}
          </div>
          {/* Keyboard players can use the keys as well as the pad. */}
          <div className="tiral-keyboard-hint border-t border-sheet-line px-2.5 py-1.5 text-[11px] text-sheet-mute">
            <kbd className="font-bold text-sheet-ink">Hold W</kbd>/↑ walk · <kbd className="font-bold text-sheet-ink">A</kbd>/← left ·{" "}
            <kbd className="font-bold text-sheet-ink">D</kbd>/→ right · <kbd className="font-bold text-sheet-ink">S</kbd>/↓ turn around ·{" "}
            <kbd className="font-bold text-sheet-ink">Shift</kbd> sprint · <kbd className="font-bold text-sheet-ink">Space</kbd> stop
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setPinned(true)}
            aria-label={`Show status. ${statusText}`}
            className="pointer-events-auto inline-flex min-h-[44px] max-w-full items-center rounded-full border border-sheet-line bg-sheet-card/95 px-4 text-[11px] font-bold text-sheet-mute shadow-xl md:backdrop-blur-md"
          >
            <span className="truncate">{statusText}</span>
          </button>
        </div>
      )}
      {showBar && (
        <ControlBar
          disabled={!position || locked}
          moving={moving}
          pickedTurn={pickedTurn}
          turnLandedAt={turnLandedAt}
          onToggleRun={() => onMovingChange(!moving)}
          onTurn={onRequestTurn}
          onCancelTurn={onCancelTurn}
          onTurnAround={onTurnAround}
          sprint={sprint}
        />
      )}
      </div>
    </div>
  )
}
