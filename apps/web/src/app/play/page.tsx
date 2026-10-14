"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type maplibregl from "maplibre-gl"
import { KAMPALA_ZONE, SPRINT_MULTIPLIER, haversineDistanceMeters } from "@tiral/game-core"
import { useColyseusContext } from "@/components/ColyseusProvider"
import {
  buildRoadGraph,
  getRoadHeading,
  type OverpassResponse,
  type RoadGraph
} from "@tiral/road-graph"
import { useRoadMovement, type RoadInput } from "@/lib/useRoadMovement"
import { useStartPlacement } from "@/lib/useStartPlacement"
import { useMyLoadout } from "@/lib/useMyLoadout"
import { useRaceCamera } from "@/lib/useRaceCamera"
import { DEFAULT_LOADOUT } from "@tiral/avatars"
import { SignInGate } from "@/components/SignInGate"
import { Hub } from "@/components/hub/Hub"
import { FirstRunIntro, useFirstRun } from "@/components/hub/FirstRunIntro"
import { AdaptivePanel } from "@/components/ui/AdaptivePanel"
import { usePlayer } from "@/lib/player"
import { TopBar } from "@/components/game/TopBar"
import { ControlDeck } from "@/components/game/ControlDeck"
import { BillboardLayer, type BillboardPin } from "@/components/BillboardLayer"
import { BrandCard } from "@/components/BrandCard"

function ActiveSponsors({ campaigns }: { campaigns: { brandName: string }[] }) {
  if (campaigns.length === 0) return null
  const names = [...new Set(campaigns.map((campaign) => campaign.brandName))].slice(0, 3)
  return (
    <div className="mt-2 text-center text-[11px] text-slate-400">
      Sponsored by {names.join(" · ")}
    </div>
  )
}

import { ROTATION_SECONDS, selectCurrentAd } from "@/lib/billboards"
import { RaceEarningsSummary } from "@/components/game/RaceEarningsSummary"
import { NeedsHud } from "@/components/game/NeedsHud"
import { SprintButton } from "@/components/game/SprintButton"
import { CollapseOverlay, PreloadCollapseFont } from "@/components/game/CollapseOverlay"
import type { RaceListing } from "@/lib/useColyseus"

type BillboardSlot = {
  id: string
  name: string
  lat: number
  lng: number
  tier: string
}

type BillboardCampaign = {
  id: string
  brandName: string
  imagePath: string
  link: string
  slotIds: string[]
}

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })
// Only mounts once the map exists; shares the maplibre chunk MapView already loaded.
const StartPins = dynamic(
  () => import("@/components/game/StartPins").then((module) => ({ default: module.StartPins })),
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
const TreasureBeacon = dynamic(
  () => import("@/components/Avatar3D").then((module) => ({ default: module.TreasureBeacon })),
  { ssr: false }
)

const fallbackStart = KAMPALA_ZONE.startPoints[0]!

const REMOTE_COLORS = [
  { color: "#38bdf8" },
  { color: "#f472b6" },
  { color: "#a78bfa" },
  { color: "#4ade80" },
  { color: "#fb7185" }
]

export default function Home() {
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [graph, setGraph] = useState<RoadGraph | null>(null)
  const [loadingRoads, setLoadingRoads] = useState(true)
  const [roadError, setRoadError] = useState<string | null>(null)
  const {
    connected,
    reconnecting,
    sessionId,
    roomCode,
    roomState,
    positions,
    results,
    earnings,
    needs,
    hustle,
    stall,
    countdown,
    sendWalk,
    sendSprint,
    sendTurn,
    sendTurnAround,
    sendPlaceStart,
    sendPlayAgain,
    sendStartNow,
    leaveRoom,
    listRaces,
    createRace,
    joinRace,
    joinByCode,
    quickPlay
  } = useColyseusContext()
  const { ready: authReady, player, busy: authBusy, error: authFailure, playAsGuest } = usePlayer()
  const firstRun = useFirstRun(player?.user.id ?? null)
  // TikTok sign-in failures come back as ?auth_error=…; read once, then tidy the URL.
  const [authError, setAuthError] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reason = params.get("auth_error")
    if (!reason) return
    setAuthError(reason)
    params.delete("auth_error")
    const query = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`)
  }, [])
  // Signing out mid-race leaves the room: only signed-in players race.
  useEffect(() => {
    if (authReady && !player && connected) leaveRoom()
  }, [authReady, player, connected, leaveRoom])
  const [races, setRaces] = useState<RaceListing[]>([])
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const phase = roomState?.phase ?? "lobby"
  // In a hustle shift, not a race: that has its own screen.
  const router = useRouter()
  useEffect(() => {
    if (connected && (hustle || (stall && stall.phase !== "closed"))) router.replace("/hustle")
    // A finished stall shift has nothing to show here: disconnect it.
    else if (connected && stall?.phase === "closed") leaveRoom()
  }, [connected, hustle, stall, router, leaveRoom])
  const ownFinishPosition =
    sessionId ? roomState?.players[sessionId]?.finishPosition ?? null : null
  const locked = (connected && phase !== "racing") || ownFinishPosition !== null
  const destinationId = roomState?.destinationId ?? null
  const revealedBounty = destinationId
    ? KAMPALA_ZONE.bountyLocations.find((bounty) => bounty.id === destinationId) ?? null
    : null

  const ownStartPin = sessionId ? (roomState?.players[sessionId]?.startAt ?? null) : null
  const ownStartId = sessionId ? roomState?.players[sessionId]?.startPointId ?? null : null

  // Explicit placement mode: arm via the deck button, tap the map to drop.
  const placement = useStartPlacement({
    map,
    graph,
    canPlace: connected && (phase === "lobby" || phase === "countdown"),
    placementOver: phase !== "lobby" && phase !== "countdown",
    serverPin: ownStartPin,
    sendPlaceStart
  })

  const assignedStart = useMemo(() => {
    // Explicit placement only: optimistic pin shows instantly, server pin
    // wins on confirm, legacy presets work, otherwise null so no avatar
    // appears before the player chooses.
    if (placement.effectivePin) return placement.effectivePin
    if (ownStartPin) return ownStartPin
    if (!ownStartId) return null
    return KAMPALA_ZONE.startPoints.find((point) => point.id === ownStartId)?.position ?? null
  }, [placement.effectivePin, ownStartPin, ownStartId])

  const handleRoadInput = useCallback(
    (input: RoadInput) => {
      if (!connected) return
      if (input.type === "walk") sendWalk(input.on)
      else if (input.type === "turn") sendTurn(input.direction)
      else sendTurnAround()
    },
    [connected, sendWalk, sendTurn, sendTurnAround]
  )

  // Sprint: hold the button or Shift. The server owns energy/health and tells
  // us when we collapse; local movement mirrors its speed via speedRef.
  const [sprinting, setSprinting] = useState(false)
  const speedRef = useRef(1)
  const collapsed = needs?.collapsedUntil != null && needs.collapsedUntil > Date.now()
  const canSprint = connected && phase === "racing" && !locked
  const setSprint = useCallback(
    (on: boolean) => {
      const next = on && canSprint
      setSprinting(next)
      sendSprint(next)
    },
    [canSprint, sendSprint]
  )
  useEffect(() => {
    if (!canSprint && sprinting) setSprint(false)
  }, [canSprint, sprinting, setSprint])
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Shift" && !event.repeat) setSprint(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === "Shift") setSprint(false)
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [setSprint])
  speedRef.current = collapsed ? 0 : sprinting ? SPRINT_MULTIPLIER : 1

  const movement = useRoadMovement(graph, assignedStart, handleRoadInput, locked, speedRef)
  // The server decides who reaches the bounty; keep the predicted runner close to it.
  const ownServerPosition = sessionId ? positions[sessionId] : undefined
  const { reconcile } = movement
  useEffect(() => {
    if (ownServerPosition?.roadPosition) reconcile(ownServerPosition.roadPosition, ownServerPosition.moving)
  }, [ownServerPosition, reconcile])
  const myLoadout = useMyLoadout()
  const { recenter, followSuspended } = useRaceCamera(map, phase, movement.coordinate, movement.heading)

  const remoteAvatars = useMemo(() => {
    if (!graph) return []
    return Object.entries(positions)
      .filter(([id, entry]) => id !== sessionId && entry.coordinate && entry.roadPosition)
      .map(([id, entry], index) => {
        const palette = REMOTE_COLORS[index % REMOTE_COLORS.length]!
        return {
          id,
          coordinate: entry.coordinate!,
          heading: getRoadHeading(graph, entry.roadPosition!),
          moving: entry.moving,
          collapsed: entry.collapsed === true,
          loadout: entry.loadout ?? DEFAULT_LOADOUT,
          name: roomState?.players[id]?.name ?? "Runner",
          finishPosition: roomState?.players[id]?.finishPosition ?? null,
          ...palette
        }
      })
  }, [graph, positions, sessionId, roomState])

  const raceHud = useMemo(() => {
    if (phase !== "racing" || !revealedBounty || !movement.coordinate) return null
    const entries: Array<{ id: string; distance: number }> = [
      { id: sessionId ?? "self", distance: haversineDistanceMeters(movement.coordinate, revealedBounty.position) }
    ]
    for (const [id, entry] of Object.entries(positions)) {
      if (id === sessionId || !entry.coordinate) continue
      entries.push({ id, distance: haversineDistanceMeters(entry.coordinate, revealedBounty.position) })
    }
    entries.sort((a, b) => a.distance - b.distance)
    const ownIndex = entries.findIndex((entry) => entry.id === (sessionId ?? "self"))
    return {
      distanceMeters: Math.round(entries[ownIndex]?.distance ?? 0),
      rank: ownIndex + 1,
      total: entries.length
    }
  }, [phase, revealedBounty, movement.coordinate, positions, sessionId])

  const playerCount = roomState ? Object.keys(roomState.players).length : 0

  const refreshRaces = useCallback(async () => {
    setLobbyLoading(true)
    setLobbyError(null)
    try {
      setRaces(await listRaces())
    } catch {
      setLobbyError("Could not load open races")
    } finally {
      setLobbyLoading(false)
    }
  }, [listRaces])

  useEffect(() => {
    if (!connected && !reconnecting && player) {
      void refreshRaces()
    }
  }, [connected, reconnecting, refreshRaces, player !== null])

  const runJoin = useCallback(
    async (action: () => Promise<void>) => {
      setJoining(true)
      setLobbyError(null)
      try {
        await action()
      } catch (err) {
        setLobbyError(err instanceof Error ? err.message : "Could not join race")
        await refreshRaces()
      } finally {
        setJoining(false)
      }
    },
    [refreshRaces]
  )

  const handleJoinCode = useCallback(
    (code: string) => {
      void runJoin(async () => {
        await joinByCode(code, myLoadout)
      })
    },
    [joinByCode, runJoin, myLoadout]
  )

  const onMapReady = useCallback((readyMap: maplibregl.Map) => {
    setMap(readyMap)
    // Keep the zone clear of the hub: side panel on wide screens, sheet on phones.
    const wide = window.innerWidth >= 768
    readyMap.fitBounds(
      [[32.574, 0.309], [32.588, 0.321]],
      { padding: { top: 70, right: wide ? 440 : 45, bottom: wide ? 45 : 240, left: 45 }, maxZoom: 16 }
    )
  }, [])

  const startPinPlayers = useMemo(() => {
    const list = roomState
      ? Object.entries(roomState.players).map(([id, player]) => ({
          sessionId: id,
          name: player.name,
          startAt: player.startAt ?? null
        }))
      : []
    // Optimistic own pin until the server confirms it.
    const hasOwn = sessionId !== null && list.some((p) => p.sessionId === sessionId && p.startAt)
    if (!hasOwn && placement.effectivePin && sessionId) {
      list.push({
        sessionId,
        name: (roomState?.players[sessionId]?.name ?? "You") as string,
        startAt: placement.effectivePin
      })
    }
    return list
  }, [roomState, placement.effectivePin, sessionId])

  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/roads", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null
          throw new Error(body?.error ?? `Road request failed with ${response.status}`)
        }
        return response.json() as Promise<OverpassResponse>
      })
      .then((data) => {
        setGraph(buildRoadGraph(data))
        setLoadingRoads(false)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setRoadError(error instanceof Error ? error.message : "Could not load roads")
        setLoadingRoads(false)
      })

    return () => controller.abort()
  }, [])

  const [billboardSlots, setBillboardSlots] = useState<BillboardSlot[]>([])
  const [billboardCampaigns, setBillboardCampaigns] = useState<BillboardCampaign[]>([])
  const [brandCardPin, setBrandCardPin] = useState<BillboardPin | null>(null)
  const [rotationTick, setRotationTick] = useState(() => Date.now())

  // Tick once per rotation boundary (not every second) so the page only
  // re-renders when the ad on a board actually changes.
  useEffect(() => {
    const period = ROTATION_SECONDS * 1000
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setRotationTick(Date.now())
        schedule()
      }, period - (Date.now() % period) + 50)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch("/api/billboards/active")
        .then(async (response) => {
          if (!response.ok) return null
          return (await response.json()) as { slots: BillboardSlot[]; campaigns: BillboardCampaign[] }
        })
        .then((body) => {
          if (cancelled || !body) return
          setBillboardSlots(body.slots)
          setBillboardCampaigns(body.campaigns)
        })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const billboardPins = useMemo<BillboardPin[]>(() => {
    return billboardSlots.map((slot) => {
      const ads = billboardCampaigns
        .filter((campaign) => campaign.slotIds.includes(slot.id))
        .map((campaign) => ({
          campaignId: campaign.id,
          brandName: campaign.brandName,
          imagePath: campaign.imagePath,
          link: campaign.link
        }))
      const current = selectCurrentAd(ads, rotationTick)
      const tier = slot.tier === "premium" ? ("premium" as const) : ("standard" as const)
      if (!current) {
        return { slotId: slot.id, slotName: slot.name, lat: slot.lat, lng: slot.lng, tier, kind: "house" as const }
      }
      return {
        slotId: slot.id,
        slotName: slot.name,
        lat: slot.lat,
        lng: slot.lng,
        tier,
        kind: "ad" as const,
        brandName: current.brandName,
        imagePath: current.imagePath,
        link: current.link,
        campaignId: current.campaignId
      }
    })
  }, [billboardSlots, billboardCampaigns, rotationTick])

  const showPicker = connected && (phase === "lobby" || phase === "countdown")

  if (!connected && !reconnecting) {
    return (
      <main className="tiral-game relative h-dvh w-screen overflow-hidden bg-slate-950">
        <div className="absolute inset-x-0 bottom-0 top-[var(--shell-top)]">
          <MapView
            center={fallbackStart.position}
            zoom={15}
            pitch={48}
            bearing={-18}
            onMapReady={onMapReady}
          />
        </div>
        {map && <BillboardLayer map={map} pins={billboardPins} onPinClick={setBrandCardPin} />}
        {brandCardPin && (
          <BrandCard
            pin={brandCardPin}
            onClose={() => setBrandCardPin(null)}
            onAdvertise={() => {
              setBrandCardPin(null)
              window.location.href = "/advertise"
            }}
          />
        )}
        {player ? (
          <>
            <AdaptivePanel label="Race hub">
              <Hub
                races={races}
                loadingRaces={lobbyLoading}
                joining={joining}
                error={lobbyError}
                onRefresh={() => void refreshRaces()}
                onQuickRace={() => {
                  firstRun.markRaced()
                  void runJoin(() => quickPlay(myLoadout))
                }}
                onCreate={() => void runJoin(() => createRace(myLoadout))}
                onJoin={(roomId) => void runJoin(() => joinRace(roomId, myLoadout))}
                onJoinCode={handleJoinCode}
                highlightQuickRace={firstRun.highlight}
              />
            </AdaptivePanel>
            {firstRun.showIntro && <FirstRunIntro onDone={firstRun.finishIntro} />}
          </>
        ) : (
          <>
            <Link
              href="/"
              className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 rounded-xl bg-slate-950/80 px-3 py-2 text-sm font-black text-white shadow-xl backdrop-blur-md"
            >
              Tiral
            </Link>
            <div className="absolute inset-x-0 bottom-0 z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 pt-3 shadow-2xl backdrop-blur-md">
                {authReady ? (
                  <SignInGate busy={authBusy === "guest"} error={authFailure} authError={authError} onGuest={playAsGuest} />
                ) : (
                  <p className="px-4 pb-5 pt-2 text-center text-sm text-slate-400">Checking who you are…</p>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    )
  }

  return (
    <main className="tiral-game relative h-dvh w-screen overflow-hidden bg-slate-950">
      <MapView
        center={fallbackStart.position}
        zoom={15}
        pitch={48}
        bearing={-18}
        onMapReady={onMapReady}
      />

      {map && (
        <ThreeLayer map={map}>
          {/* Map world is z-up (three defaults to y-up): sky from above, ground below. */}
          <hemisphereLight args={["#fff4d6", "#293548", 1.6]} position={[0, 0, 1]} />
          <directionalLight position={[4, 8, 10]} intensity={2.2} />
          {movement.coordinate && (
            <Avatar3D
              latLng={movement.coordinate}
              heading={movement.heading}
              moving={movement.moving}
              color="#f59e0b"
              loadout={myLoadout}
              isSelf
              finishPosition={ownFinishPosition}
              collapsed={collapsed}
            />
          )}
          {remoteAvatars.map((avatar) => (
            <Avatar3D
              key={avatar.id}
              latLng={avatar.coordinate}
              heading={avatar.heading}
              moving={avatar.moving}
              color={avatar.color}
              loadout={avatar.loadout}
              name={avatar.name}
              finishPosition={avatar.finishPosition}
              collapsed={avatar.collapsed}
              smooth
            />
          ))}
          {revealedBounty && <TreasureBeacon latLng={revealedBounty.position} />}
        </ThreeLayer>
      )}

      {map && (
        <BillboardLayer
          map={map}
          pins={billboardPins}
          showEmpty={!connected || phase === "lobby" || phase === "countdown"}
          onPinClick={setBrandCardPin}
        />
      )}
      {map && <StartPins map={map} players={startPinPlayers} ownSessionId={sessionId} />}
      {brandCardPin && (
        <BrandCard
          pin={brandCardPin}
          onClose={() => setBrandCardPin(null)}
          onAdvertise={() => {
            setBrandCardPin(null)
            window.location.href = "/advertise"
          }}
        />
      )}

      {connected && (
        <TopBar
          roomCode={roomCode}
          racerCount={remoteAvatars.length + 1}
          phase={phase}
          reconnecting={reconnecting}
          countdown={countdown}
          bountyName={revealedBounty?.name ?? null}
          hudText={raceHud ? `${raceHud.distanceMeters}m · ${raceHud.rank}/${raceHud.total}` : null}
          locked={locked}
          showRecenter={phase === "racing"}
          followSuspended={followSuspended}
          onRecenter={recenter}
          onLeave={leaveRoom}
        />
      )}

      {connected && needs && (
        <div className="absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[calc(max(0.5rem,env(safe-area-inset-top))+3.75rem)] z-20">
          <NeedsHud energy={needs.energy} health={needs.health} sprinting={sprinting && movement.moving} />
        </div>
      )}
      {canSprint && (
        <div className="absolute bottom-[max(12.5rem,calc(env(safe-area-inset-bottom)+12rem))] right-[max(0.75rem,env(safe-area-inset-right))] z-30 md:bottom-[7.5rem]">
          <SprintButton
            active={sprinting}
            disabled={collapsed}
            empty={(needs?.energy ?? 100) <= 0}
            onChange={setSprint}
          />
        </div>
      )}
      {canSprint && <PreloadCollapseFont />}
      {connected && collapsed && needs?.collapsedUntil && <CollapseOverlay until={needs.collapsedUntil} />}

      {connected && phase === "racing" && ownFinishPosition !== null && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-2xl border border-emerald-300/30 bg-slate-950/90 px-5 py-3 text-center text-white shadow-2xl backdrop-blur-md">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            You finished {ownFinishPosition}
            {ownFinishPosition === 1 ? "st" : ownFinishPosition === 2 ? "nd" : ownFinishPosition === 3 ? "rd" : "th"}!
          </div>
          <div className="mt-1 text-sm text-slate-300">Others are still racing…</div>
        </div>
      )}

      {connected && phase === "finished" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-[min(92vw,380px)] rounded-2xl border border-amber-300/30 bg-slate-950/95 p-5 text-white shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
              Race finished
            </div>
            <div className="mt-1 text-2xl font-black">
              {results?.[0]?.sessionId === sessionId
                ? "You won!"
                : results
                  ? `Winner: ${results[0]!.name}`
                  : "Finished"}
            </div>
            {results && results.length > 0 && (
              <ol className="mt-3 flex flex-col gap-1">
                {results.map((result) => (
                  <li
                    key={result.sessionId}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      result.sessionId === sessionId
                        ? "bg-amber-300/20 font-bold text-amber-100"
                        : "bg-white/5 text-slate-200"
                    }`}
                  >
                    <span>
                      {result.position}. {result.name}
                      {result.sessionId === sessionId ? " (you)" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <RaceEarningsSummary earnings={earnings} soloRace={playerCount < 2} />
            {earnings && player && !player.user.tiktokLinked && (
              <a
                href="/api/auth/tiktok"
                className="mt-3 block rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs leading-snug text-slate-200"
              >
                <span className="font-bold text-white">Connect TikTok</span> so you never lose these coins. Guest
                accounts live on this device only. →
              </a>
            )}
            <button
              type="button"
              onClick={sendPlayAgain}
              className="mt-4 min-h-[48px] w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300"
            >
              Race again
            </button>
            <button
              type="button"
              onClick={leaveRoom}
              className="mt-2 min-h-[48px] w-full rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-bold text-slate-200"
            >
              Back to base
            </button>
            <ActiveSponsors campaigns={billboardCampaigns} />
          </div>
        </div>
      )}

      <ControlDeck
        graph={graph}
        position={movement.position}
        moving={movement.moving}
        loadingRoads={loadingRoads}
        roadError={roadError}
        turnIntent={movement.turnIntent}
        feedback={movement.feedback}
        distanceToJunction={movement.distanceToJunction}
        locked={locked}
        onMovingChange={movement.setMoving}
        onTurnAround={movement.turnAround}
        onRequestTurn={movement.requestTurn}
        showStarts={showPicker && roomState !== null}
        hasStartPin={placement.hasPin}
        placementArmed={placement.armed}
        onTogglePlacement={() => placement.setArmed((armed) => !armed)}
        showSolo={phase === "lobby" && playerCount < 2}
        onStartNow={sendStartNow}
        notice={placement.notice}
      />
    </main>
  )
}
