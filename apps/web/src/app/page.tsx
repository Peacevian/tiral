"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import maplibregl from "maplibre-gl"
import { KAMPALA_ZONE, haversineDistanceMeters } from "@tiral/game-core"
import { useColyseus } from "@/lib/useColyseus"
import {
  buildRoadGraph,
  getRoadHeading,
  type OverpassResponse,
  type RoadGraph
} from "@tiral/road-graph"
import { useRoadMovement, type RoadInput } from "@/lib/useRoadMovement"
import { RoadMovementControls } from "@/components/RoadMovementControls"
import { StartPicker } from "@/components/StartPicker"
import { LobbyList } from "@/components/LobbyList"
import { AuthButton } from "@/components/AuthButton"
import type { RaceListing } from "@/lib/useColyseus"

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
    sendSelectStart,
    sendPlayAgain,
    sendStartNow,
    leaveRoom,
    listRaces,
    createRace,
    joinRace,
    joinByCode,
    quickPlay
  } = useColyseus()
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

  const ownStartId = sessionId ? roomState?.players[sessionId]?.startPointId ?? null : null
  const assignedStart = useMemo(() => {
    if (!ownStartId) return fallbackStart.position
    return (
      KAMPALA_ZONE.startPoints.find((point) => point.id === ownStartId)?.position ??
      fallbackStart.position
    )
  }, [ownStartId])

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
          ...palette
        }
      })
  }, [graph, positions, sessionId])

  const raceHud = useMemo(() => {
    if (phase !== "racing" || !revealedBounty) return null
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
        try {
          await joinByCode(code)
        } catch {
          throw new Error("No open race with that code — it may have started already")
        }
      })
    },
    [joinByCode, runJoin]
  )

  const onMapReady = useCallback((readyMap: maplibregl.Map) => {
    setMap(readyMap)
    readyMap.fitBounds(
      [[32.574, 0.309], [32.588, 0.321]],
      { padding: { top: 70, right: 45, bottom: 170, left: 45 }, maxZoom: 16 }
    )
  }, [])

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

  useEffect(() => {
    if (!map || !revealedBounty) return
    map.flyTo({
      center: [revealedBounty.position.lng, revealedBounty.position.lat],
      zoom: 15.5,
      pitch: 48,
      duration: 2500,
      essential: true
    })
  }, [map, destinationId])

  const showPicker = connected && (phase === "lobby" || phase === "countdown")

  if (!connected && !reconnecting) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-slate-950 p-4">
        <div className="h-[min(92vh,640px)] w-[min(94vw,420px)]">
          <LobbyList
            races={races}
            loading={lobbyLoading || joining}
            error={lobbyError}
            joining={joining}
            onRefresh={() => void refreshRaces()}
            onJoin={(roomId) => void runJoin(() => joinRace(roomId))}
            onJoinCode={handleJoinCode}
            onCreate={() => void runJoin(() => createRace())}
            onQuickPlay={() => void runJoin(() => quickPlay())}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
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
          <Avatar3D
            latLng={movement.coordinate}
            heading={movement.heading}
            moving={movement.moving}
            color="#f59e0b"
            accentColor="#92400e"
          />
          {remoteAvatars.map((avatar) => (
            <Avatar3D
              key={avatar.id}
              latLng={avatar.coordinate}
              heading={avatar.heading}
              moving={avatar.moving}
              color={avatar.color}
              accentColor={avatar.accentColor}
              smooth
            />
          ))}
          {revealedBounty && <TreasureBeacon latLng={revealedBounty.position} />}
        </ThreeLayer>
      )}

      <div className="absolute left-4 top-4 z-20 flex w-[min(78vw,260px)] flex-col gap-2">
        <div className="rounded-lg bg-black/70 px-4 py-3 text-white shadow-lg backdrop-blur-sm">
          <AuthButton />
        </div>
        {connected && (
          <div className="rounded-lg bg-black/70 px-4 py-3 text-white shadow-lg backdrop-blur-sm">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm text-green-400">
              <span>
                {reconnecting
                  ? "Reconnecting…"
                  : `Race ${roomCode ?? ""}${remoteAvatars.length > 0 ? ` · ${remoteAvatars.length + 1} racers` : ""}${
                      phase === "racing" ? " · Racing" : ""
                    }`}
              </span>
              {!reconnecting && (
                <span className="flex gap-1">
                  <Link
                    href="/leaderboard"
                    className="rounded-md border border-white/20 px-2 py-1 text-xs font-bold text-slate-300"
                  >
                    Ranks
                  </Link>
                  <button
                    type="button"
                    onClick={leaveRoom}
                    className="rounded-md border border-white/20 px-2 py-1 text-xs font-bold text-slate-300"
                  >
                    Leave
                  </button>
                </span>
              )}
            </div>
            {countdown !== null && phase !== "racing" && (
              <div className="font-mono text-2xl font-bold text-amber-400">
                {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
              </div>
            )}
            {revealedBounty && (
              <div className="mt-1 text-sm font-bold text-emerald-300">
                Bounty: {revealedBounty.name}
              </div>
            )}
            {raceHud && (
              <div className="mt-1 font-mono text-lg font-bold text-cyan-300">
                {raceHud.distanceMeters}m · {raceHud.rank}/{raceHud.total}
              </div>
            )}
            {phase === "lobby" && playerCount < 2 && (
              <button
                type="button"
                onClick={sendStartNow}
                className="mt-2 w-full rounded-lg bg-cyan-500 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-400"
              >
                Start now (solo)
              </button>
            )}
          </div>
        )}
        {showPicker && roomState && (
          <StartPicker
            players={roomState.players}
            ownSessionId={sessionId}
            locked={false}
            onSelect={sendSelectStart}
          />
        )}
        {connected && phase !== "lobby" && phase !== "countdown" && phase !== "finished" && (
          <div className="rounded-2xl border border-white/15 bg-slate-950/88 p-3 text-sm text-slate-200 shadow-2xl backdrop-blur-md">
            Positions locked — race to the bounty.
          </div>
        )}
      </div>

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
          </div>
        </div>
      )}

      <RoadMovementControls
        graph={graph}
        position={movement.position}
        moving={movement.moving}
        loading={loadingRoads}
        error={roadError}
        turnIntent={movement.turnIntent}
        feedback={movement.feedback}
        distanceToJunction={movement.distanceToJunction}
        availableDirections={movement.availableDirections}
        locked={locked}
        onMovingChange={movement.setMoving}
        onTurnAround={movement.turnAround}
        onRequestTurn={movement.requestTurn}
      />
    </main>
  )
}
