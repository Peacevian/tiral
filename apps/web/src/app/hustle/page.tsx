"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type maplibregl from "maplibre-gl"
import {
  BODA_SPEED_FACTOR,
  BODA_STAGES,
  KIKUUBO_SPOTS,
  RENTAL_BIKE_LOOK,
  SPRINT_MULTIPLIER,
  findHustle,
  findPlace,
  isStallGig,
  haversineDistanceMeters
} from "@tiral/game-core"
import type { RoadGraph } from "@tiral/road-graph"
import { useColyseusContext } from "@/components/ColyseusProvider"
import { useRoadMovement, type RoadInput } from "@/lib/useRoadMovement"
import { useMyLoadout } from "@/lib/useMyLoadout"
import { useRaceCamera } from "@/lib/useRaceCamera"
import { usePlayer } from "@/lib/player"
import { loadRoadGraph } from "@/lib/roadGraph"
import { formatCoins } from "@/lib/useCoins"
import { ControlDeck } from "@/components/game/ControlDeck"
import { NeedsHud } from "@/components/game/NeedsHud"
import { SprintButton } from "@/components/game/SprintButton"
import { CollapseOverlay, PreloadCollapseFont } from "@/components/game/CollapseOverlay"
import { StallScreen } from "@/components/hustle/StallScreen"
import { JobBoard, clock, offerTitle, spotName, useNow } from "@/components/hustle/JobBoard"
import type { HustlePin } from "@/components/hustle/HustlePins"
import { ActionButton, Card, ConfirmButton } from "@/components/ui"
import { LockedGig, useGigLocked } from "@/components/hub/HustleLadder"
import { LiveScreen } from "@/components/live/LiveScreen"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })
const HustlePins = dynamic(
  () => import("@/components/hustle/HustlePins").then((module) => ({ default: module.HustlePins })),
  { ssr: false }
)
const ThreeLayer = dynamic(
  () => import("@/components/ThreeLayer").then((module) => ({ default: module.ThreeLayer })),
  { ssr: false }
)
const Avatar3D = dynamic(
  () => import("@/components/Avatar3D").then((module) => ({ default: module.Avatar3D })),
  { ssr: false }
)

const KIKUUBO_CENTER = { lat: 0.3125, lng: 32.5765 }

const FAILURE_TEXT = {
  abandoned: "Job dropped. No pay, and they won't forget it.",
  late: "Too late. The customer found another porter.",
  no_show: "You never made it to the pickup. The job went to someone else.",
  gave_up: "Your passenger gave up and got off. No fare.",
  broke_down: "Banange! The bike broke down. Your passenger walked off."
} as const

const GIGS = {
  porter: {
    blurb:
      "Shops around Kikuubo need loads moved: sugar, soda, bales of clothes. Take a job, collect it, carry it across before time runs out. About 2,000–5,500 BNG a load, and it tires you out: eat to keep going.",
    spots: KIKUUBO_SPOTS
  },
  boda: {
    blurb:
      "Rent the stage bike for the day (10,000 BNG, charged with your first ride), pick passengers up at a stage and drop them across town. Fares run about 10,000–23,000, more in rush hour, minus fuel. Quick rides get tipped.",
    spots: BODA_STAGES
  }
} as const

// A hustle shift: simulated jobs on the real Kikuubo streets, no other
// players needed. Same movement, sprint and body as races.
// /hustle?gig=… — map gigs (porter, boda), stall mini-games (rolex, car wash)
// or LivTok (selling clothes on live).
export default function HustlePage() {
  const { stall, live } = useColyseusContext()
  const [gigParam, setGigParam] = useState<string | null>(null)
  useEffect(() => {
    setGigParam(new URLSearchParams(window.location.search).get("gig") ?? "porter")
  }, [])
  // A shift in progress wins; a finished one only shows on its own page.
  if (stall && stall.phase !== "closed") return <StallScreen gig={stall.stall} />
  if (live) return <LiveScreen />
  if (gigParam === null) return <main className="h-dvh w-screen bg-sheet" />
  if (gigParam === "live") return <LiveScreen />
  if (isStallGig(gigParam)) return <StallScreen gig={gigParam} />
  return <MapHustle />
}

function MapHustle() {
  const router = useRouter()
  const {
    connected,
    reconnecting,
    roomState,
    hustle,
    hustleEvent,
    selfPosition,
    needs,
    startHustle,
    sendAcceptJob,
    sendAbandonJob,
    sendWalk,
    sendSprint,
    sendTurn,
    sendTurnAround,
    leaveRoom
  } = useColyseusContext()
  const { ready, player } = usePlayer()
  const myLoadout = useMyLoadout()
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [graph, setGraph] = useState<RoadGraph | null>(null)
  const [roadError, setRoadError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [boardOpen, setBoardOpen] = useState(true)
  const now = useNow(500)
  // Which gig to start (?gig=boda); inside a shift, the room decides.
  const [requestedGig, setRequestedGig] = useState<"porter" | "boda">("porter")
  useEffect(() => {
    setRequestedGig(new URLSearchParams(window.location.search).get("gig") === "boda" ? "boda" : "porter")
  }, [])

  // In a race, not a shift: that has its own screen.
  useEffect(() => {
    if (connected && roomState) router.replace("/play")
  }, [connected, roomState, router])

  useEffect(() => {
    let cancelled = false
    loadRoadGraph()
      .then((loaded) => {
        if (!cancelled) setGraph(loaded)
      })
      .catch((error: unknown) => {
        if (!cancelled) setRoadError(error instanceof Error ? error.message : "Could not load roads")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const inShift = connected && hustle !== null
  const handleRoadInput = useCallback(
    (input: RoadInput) => {
      if (!inShift) return
      if (input.type === "walk") sendWalk(input.on)
      else if (input.type === "turn") sendTurn(input.direction)
      else sendTurnAround()
    },
    [inShift, sendWalk, sendTurn, sendTurnAround]
  )

  const [sprinting, setSprinting] = useState(false)
  const speedRef = useRef(1)
  const collapsed = needs?.collapsedUntil != null && needs.collapsedUntil > Date.now()
  const setSprint = useCallback(
    (on: boolean) => {
      const next = on && inShift
      setSprinting(next)
      sendSprint(next)
    },
    [inShift, sendSprint]
  )
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Shift" && !event.repeat) setSprint(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === "Shift") setSprint(false)
    }
    // Switching tabs while holding Shift never sends the keyup: stop sprinting.
    const release = () => setSprint(false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", release)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", release)
    }
  }, [setSprint])
  const onBike = hustle?.hustle === "boda"
  speedRef.current =
    collapsed ? 0 : (onBike ? hustle?.boda?.bike.speedFactor ?? BODA_SPEED_FACTOR : 1) * (sprinting ? SPRINT_MULTIPLIER : 1)

  const movement = useRoadMovement(graph, inShift ? hustle.startAt : null, handleRoadInput, !inShift, speedRef)
  // Keep the predicted runner honest: the server decides pickups and drop-offs.
  const { reconcile } = movement
  useEffect(() => {
    if (selfPosition) reconcile(selfPosition.roadPosition, selfPosition.moving)
  }, [selfPosition, reconcile])
  const { recenter, showOverview } = useRaceCamera(map, inShift && movement.coordinate ? "racing" : "lobby", movement.coordinate, movement.heading)

  // A new job: frame you, the package and the destination once, then follow you again.
  const jobId = hustle?.job?.offer.id ?? null
  const coordinateRef = useRef(movement.coordinate)
  coordinateRef.current = movement.coordinate
  useEffect(() => {
    if (!jobId || !hustle?.job) return
    const pickup = findPlace(hustle.job.offer.pickupId)
    const dropoff = findPlace(hustle.job.offer.dropoffId)
    const points = [coordinateRef.current, pickup?.position, dropoff?.position].filter(
      (point): point is { lat: number; lng: number } => point != null
    )
    const wide = window.innerWidth >= 768
    showOverview(points, wide ? { top: 110, bottom: 140, left: 80, right: 470 } : { top: 110, bottom: 240, left: 50, right: 50 })
    // Only when a different job starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, showOverview])

  // Close the phone sheet once a job starts (the top bar shows it); reopen when free.
  const jobActive = hustle?.job != null
  useEffect(() => {
    setBoardOpen(!jobActive)
  }, [jobActive])

  const target = hustle?.job
    ? findPlace(hustle.job.stage === "carrying" ? hustle.job.offer.dropoffId : hustle.job.offer.pickupId)
    : null
  const distanceToTarget =
    target && movement.coordinate ? Math.round(haversineDistanceMeters(movement.coordinate, target.position)) : null

  const pins = useMemo<HustlePin[]>(() => {
    if (!hustle) return []
    const job = hustle.job
    if (job) {
      const pickup = findPlace(job.offer.pickupId)
      const dropoff = findPlace(job.offer.dropoffId)
      const list: HustlePin[] = []
      if (job.stage === "to_pickup" && pickup) {
        list.push({ id: `p:${pickup.id}`, position: pickup.position, label: "📦", title: `Pickup: ${pickup.name}`, tone: "pickup" })
      }
      if (dropoff) {
        list.push({ id: `d:${dropoff.id}`, position: dropoff.position, label: "🏁", title: `Drop-off: ${dropoff.name}`, tone: "dropoff" })
      }
      return list
    }
    return hustle.offers.flatMap((offer, index) => {
      const pickup = findPlace(offer.pickupId)
      return pickup
        ? [{ id: `o:${pickup.id}`, position: pickup.position, label: String(index + 1), title: `Job ${index + 1}: ${pickup.name}`, tone: "offer" as const }]
        : []
    })
  }, [hustle])

  // Arriving at the pickup is automatic; say so clearly when it happens.
  const stage = hustle?.job?.stage ?? null
  const [pickedUpAt, setPickedUpAt] = useState<number | null>(null)
  const previousStage = useRef(stage)
  useEffect(() => {
    if (previousStage.current === "to_pickup" && stage === "carrying") setPickedUpAt(Date.now())
    previousStage.current = stage
  }, [stage])

  // Receipt / failure toast for a few seconds.
  const toast = hustleEvent && now - hustleEvent.at < 4500 ? hustleEvent : null
  const showPickedUp = pickedUpAt !== null && now - pickedUpAt < 3500 && stage === "carrying" && !toast

  const onMapReady = useCallback((readyMap: maplibregl.Map) => {
    setMap(readyMap)
    const wide = window.innerWidth >= 768
    readyMap.jumpTo({ center: [KIKUUBO_CENTER.lng, KIKUUBO_CENTER.lat], zoom: wide ? 16.4 : 16 })
  }, [])

  const begin = async () => {
    setStarting(true)
    setStartError(null)
    try {
      await startHustle(requestedGig, myLoadout)
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Couldn't start the shift")
    } finally {
      setStarting(false)
    }
  }

  const gig = inShift ? hustle.hustle : requestedGig
  const gigInfo = findHustle(gig)!
  const locked = useGigLocked(gig)

  return (
    <main className="tiral-game relative h-dvh w-screen overflow-hidden bg-sheet text-sheet-ink">
      {/* Between the app shell's bars before a shift (they hide during one). */}
      <div className="absolute inset-x-0 bottom-[var(--shell-bottom)] top-[var(--shell-top)]">
        <MapView center={KIKUUBO_CENTER} zoom={16} pitch={48} bearing={-18} onMapReady={onMapReady} />
      </div>

      {map && inShift && (
        <ThreeLayer map={map}>
          <hemisphereLight args={["#fff4d6", "#293548", 1.6]} position={[0, 0, 1]} />
          <directionalLight position={[4, 8, 10]} intensity={2.2} />
          {movement.coordinate && (
            <Avatar3D
              latLng={movement.coordinate}
              live={movement.live}
              heading={movement.heading}
              moving={movement.moving}
              color="#f59e0b"
              loadout={myLoadout}
              isSelf
              collapsed={collapsed}
              bike={
                onBike
                  ? {
                      look: hustle?.boda?.bike.look ?? RENTAL_BIKE_LOOK,
                      // A dummy passenger rides along once they're on board.
                      passenger: hustle?.job?.stage === "carrying",
                      passengerSeed: hustle?.job?.offer.id,
                      plateSeed: player?.user.id
                    }
                  : null
              }
            />
          )}
        </ThreeLayer>
      )}
      {map && <HustlePins map={map} pins={inShift ? pins : GIGS[gig].spots.map((spot) => ({ id: spot.id, position: spot.position, label: "•", title: spot.name, tone: "offer" as const }))} />}

      {!inShift ? (
        // Start screen.
        // Clear of the app shell (top bar; tab bar on phones), shown before a shift.
        <div className="absolute inset-x-0 bottom-[var(--shell-bottom)] z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-auto md:right-3 md:top-[calc(var(--shell-top)+0.75rem)] md:w-[24rem] md:p-0">
          <Card className="!bg-sheet shadow-2xl md:backdrop-blur-md">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flame-deep">Hustle</div>
            <h1 className="mt-1 text-xl font-black">
              {gigInfo.icon} {gigInfo.name}
            </h1>
            <p className="mt-1 text-sm leading-snug text-sheet-mute">{GIGS[gig].blurb}</p>
            <LockedGig gig={gig} />
            {player && (
              <p className="mt-2 text-xs text-sheet-mute">
                Your energy: <span className="font-bold text-sheet-ink">{Math.round(player.needs.energy)}/100</span> ·
                balance <span className="font-mono font-bold text-sheet-blue">{formatCoins(player.balance)} BNG</span>
              </p>
            )}
            {startError && <p className="mt-2 text-xs font-bold text-flame-deep">{startError}</p>}
            <div className="mt-4 flex gap-2">
              <Link
                href="/play"
                className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-sheet-line text-sm font-bold text-sheet-ink"
              >
                Back to base
              </Link>
              <ActionButton
                variant="primary"
                className="flex-[2]"
                disabled={starting || reconnecting || !ready || !player || locked}
                onClick={() => void begin()}
              >
                {starting || reconnecting ? "Starting…" : !player && ready ? "Sign in first" : "Start shift"}
              </ActionButton>
            </div>
          </Card>
        </div>
      ) : (
        <>
          {/* Top bar: what to do now, and End shift. */}
          <div className="absolute inset-x-0 top-0 z-30 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] md:right-[25rem]">
            <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-sheet-line bg-sheet-card/95 py-1 pl-3 pr-1 shadow-xl md:backdrop-blur-md">
              <div className="min-w-0 flex-1">
                {hustle.job ? (
                  <>
                    <div className="truncate text-xs font-black">
                      {hustle.job.stage === "carrying"
                        ? onBike
                          ? "🏁 Drop them at "
                          : "🏁 Deliver to "
                        : onBike
                          ? "🛵 Pick up at "
                          : "📦 Collect at "}
                      {spotName(hustle.job.stage === "carrying" ? hustle.job.offer.dropoffId : hustle.job.offer.pickupId)}
                    </div>
                    <div className="truncate font-mono text-[11px] text-sheet-blue">
                      {distanceToTarget ?? "…"} m · {clock(hustle.job.deadline - now)} · {offerTitle(hustle.job.offer)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="truncate text-xs font-black">🧺 Pick a job</div>
                    <div className="truncate font-mono text-[11px] text-sheet-blue">
                      {hustle.shift.jobs} done · +{formatCoins(hustle.shift.earned)} BNG this shift
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setBoardOpen((open) => !open)}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-sheet-line px-3 text-xs font-bold text-sheet-ink md:hidden"
              >
                📋 Jobs
              </button>
              <button
                type="button"
                onClick={recenter}
                aria-label="Recenter on me"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-sheet-line text-lg font-black text-sheet-ink"
              >
                ◎
              </button>
              <ConfirmButton
                onConfirm={() => {
                  leaveRoom()
                  router.push("/play")
                }}
                confirmLabel="Tap again to end"
                className="inline-flex min-h-[44px] items-center rounded-xl border border-flame-deep/30 px-3 text-xs font-bold text-flame-deep"
                armedClassName="!border-rose-400 !bg-flame-deep !text-white"
              >
                End shift
              </ConfirmButton>
            </div>
          </div>

          {needs && (
            <div className="absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[calc(max(0.5rem,env(safe-area-inset-top))+3.75rem)] z-20">
              <NeedsHud energy={needs.energy} health={needs.health} sprinting={sprinting && movement.moving} />
            </div>
          )}

          <JobBoard
            state={hustle}
            energy={needs?.energy ?? player?.needs.energy ?? 100}
            distanceToTarget={distanceToTarget}
            openOnPhone={boardOpen}
            onClosePhone={() => setBoardOpen(false)}
            onAccept={sendAcceptJob}
            onAbandon={sendAbandonJob}
          />

          {showPickedUp && hustle.job && (
            <div
              role="status"
              className="absolute left-1/2 top-[calc(max(0.5rem,env(safe-area-inset-top))+8.25rem)] z-40 w-[min(90vw,340px)] -translate-x-1/2 rounded-2xl border border-flame/40 bg-flame-soft px-4 py-3 text-center shadow-2xl md:backdrop-blur-md md:left-[calc(50%-12.5rem)]"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-flame-deep">
                {onBike ? "🛵 Passenger on" : "📦 Picked up"}
              </div>
              <div className="mt-0.5 text-sm font-bold text-sheet-ink">
                {onBike ? "Take them to " : "Now carry it to "}
                {spotName(hustle.job.offer.dropoffId)} 🏁
              </div>
            </div>
          )}
          {toast && (
            <div
              role="status"
              className={`absolute left-1/2 top-[calc(max(0.5rem,env(safe-area-inset-top))+8.25rem)] z-40 w-[min(90vw,340px)] -translate-x-1/2 rounded-2xl border px-4 py-3 text-center shadow-2xl md:backdrop-blur-md md:left-[calc(50%-12.5rem)] ${
                toast.kind === "receipt" && toast.receipt.paid
                  ? "border-leaf/40 bg-leaf-soft"
                  : toast.kind === "rented"
                    ? "border-flame/40 bg-flame-soft"
                    : "border-flame-deep/40 bg-flame-soft"
              }`}
            >
              {toast.kind === "receipt" ? (
                toast.receipt.paid ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-leaf">{toast.receipt.title}</div>
                    <div className="mt-0.5 font-mono text-2xl font-black text-flame-deep">+{formatCoins(toast.receipt.net)} BNG</div>
                    {toast.receipt.lines.length > 1 && (
                      <dl className="mx-auto mt-1 w-full max-w-[220px] font-mono text-[11px]">
                        {toast.receipt.lines.map((line) => (
                          <div key={line.label} className="flex justify-between text-sheet-mute">
                            <dt>{line.label}</dt>
                            <dd className={line.amount < 0 ? "text-flame-deep" : ""}>
                              {line.amount < 0 ? "−" : "+"}
                              {formatCoins(Math.abs(line.amount))}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <div className="mt-0.5 text-[11px] text-sheet-mute">balance {formatCoins(toast.receipt.balance)}</div>
                  </>
                ) : (
                  <div className="text-sm font-bold text-flame-deep">
                    Delivered, but the pay didn&apos;t go through. Try another job.
                  </div>
                )
              ) : toast.kind === "failed" ? (
                <div className="text-sm font-bold text-flame-deep">{FAILURE_TEXT[toast.reason]}</div>
              ) : toast.kind === "breakdown" ? (
                <div className="text-sm font-bold text-flame-deep">
                  🔧 Roadside repair: −{formatCoins(toast.charged)} BNG. Service your bike at Home → Bike.
                </div>
              ) : toast.kind === "rented" ? (
                <div className="text-sm font-bold text-flame-deep">🛵 Bike rented for today: −{formatCoins(toast.amount)} BNG</div>
              ) : (
                <div className="text-sm font-bold text-flame-deep">{toast.text}</div>
              )}
            </div>
          )}

          <div className="tiral-sprint-slot absolute right-[max(0.75rem,env(safe-area-inset-right))] z-30 md:right-[25.5rem]">
            <SprintButton active={sprinting} disabled={collapsed} empty={(needs?.energy ?? 100) <= 0} onChange={setSprint} />
          </div>
          <PreloadCollapseFont />
          {collapsed && needs?.collapsedUntil && <CollapseOverlay until={needs.collapsedUntil} />}

          <div className={boardOpen ? "max-md:hidden" : ""}>
            <ControlDeck
              graph={graph}
              position={movement.position}
              moving={movement.moving}
              loadingRoads={!graph && !roadError}
              roadError={roadError}
              turnIntent={movement.turnIntent}
              feedback={movement.feedback}
              distanceToJunction={movement.distanceToJunction}
              locked={false}
              onMovingChange={movement.setMoving}
              onTurnAround={movement.turnAround}
              onRequestTurn={movement.requestTurn}
              showStarts={false}
              hasStartPin
              rivals={[]}
              placementArmed={false}
              onTogglePlacement={() => {}}
              showSolo={false}
              onStartNow={() => {}}
              notice={null}
            />
          </div>
        </>
      )}
    </main>
  )
}
