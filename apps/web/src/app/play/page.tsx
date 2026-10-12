"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import maplibregl from "maplibre-gl"
import { KAMPALA_ZONE, haversineDistanceMeters } from "@tiral/game-core"
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
import { LobbyList } from "@/components/LobbyList"
import { TopBar } from "@/components/game/TopBar"
import { ControlDeck } from "@/components/game/ControlDeck"
import { StartPins } from "@/components/game/StartPins"
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
  { color: "#38bdf8", accentColor: "#075985" },
  { color: "#f472b6", accentColor: "#831843" },
  { color: "#a78bfa", accentColor: "#4c1d95" },
  { color: "#4ade80", accentColor: "#14532d" },
  { color: "#fb7185", accentColor: "#7f1d1d" }
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
    countdown,
    sendWalk,
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
  const [races, setRaces] = useState<RaceListing[]>([])
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const phase = roomState?.phase ?? "lobby"
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

  const movement = useRoadMovement(graph, assignedStart, handleRoadInput, locked)
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
          loadout: entry.loadout ?? DEFAULT_LOADOUT,
          ...palette
        }
      })
  }, [graph, positions, sessionId])

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
    if (!connected && !reconnecting) {
      void refreshRaces()
    }
  }, [connected, reconnecting, refreshRaces])

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
    readyMap.fitBounds(
      [[32.574, 0.309], [32.588, 0.321]],
      { padding: { top: 70, right: 45, bottom: 170, left: 45 }, maxZoom: 16 }
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

  const [lobbyOpen, setLobbyOpen] = useState(false)

  if (!connected && !reconnecting) {
    const joinHandlers = {
      onRefresh: () => void refreshRaces(),
      onJoin: (roomId: string) => void runJoin(() => joinRace(roomId, myLoadout)),
      onJoinCode: handleJoinCode,
      onCreate: () => void runJoin(() => createRace(myLoadout)),
      onQuickPlay: () => void runJoin(() => quickPlay(myLoadout))
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
        <Link
          href="/"
          className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 rounded-xl bg-slate-950/80 px-3 py-2 text-sm font-black text-white shadow-xl backdrop-blur-md"
        >
          Tiral
        </Link>
        <div className="absolute inset-x-0 bottom-0 z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={() => setLobbyOpen((open) => !open)}
              aria-expanded={lobbyOpen}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-300"
            >
              <span aria-hidden>{lobbyOpen ? "▾" : "▴"}</span>
              {lobbyOpen ? "Hide races" : "Find a race"}
            </button>
            {lobbyOpen ? (
              <div className="max-h-[64dvh] overflow-y-auto px-3 pb-3">
                <LobbyList
                  races={races}
                  loading={lobbyLoading || joining}
                  error={lobbyError}
                  joining={joining}
                  {...joinHandlers}
                />
              </div>
            ) : (
              <div className="flex gap-2 px-3 pb-3">
                <button
                  type="button"
                  disabled={joining}
                  onClick={joinHandlers.onCreate}
                  className="min-h-[48px] flex-1 rounded-xl bg-amber-400 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
                >
                  Create race
                </button>
                <button
                  type="button"
                  disabled={joining}
                  onClick={joinHandlers.onQuickPlay}
                  className="min-h-[48px] flex-1 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                >
                  Quick play
                </button>
              </div>
            )}
          </div>
        </div>
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
          <hemisphereLight args={["#fff4d6", "#293548", 1.6]} />
          <directionalLight position={[4, 8, 10]} intensity={2.2} />
          {movement.coordinate && (
            <Avatar3D
              latLng={movement.coordinate}
              heading={movement.heading}
              moving={movement.moving}
              color="#f59e0b"
              accentColor="#92400e"
              loadout={myLoadout}
            />
          )}
          {remoteAvatars.map((avatar) => (
            <Avatar3D
              key={avatar.id}
              latLng={avatar.coordinate}
              heading={avatar.heading}
              moving={avatar.moving}
              color={avatar.color}
              accentColor={avatar.accentColor}
              loadout={avatar.loadout}
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
          hudText={
            raceHud ? `${raceHud.distanceMeters}m · ${raceHud.rank}/${raceHud.total}` : null
          }
          locked={locked}
          showRecenter={phase === "racing"}
          followSuspended={followSuspended}
          onRecenter={recenter}
          onLeave={leaveRoom}
        />
      )}

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
            <button
              type="button"
              onClick={sendPlayAgain}
              className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-300"
            >
              Play again
            </button>
            <Link
              href="/leaderboard"
              className="mt-2 block w-full rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-bold text-slate-200"
            >
              See leaderboard
            </Link>
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
