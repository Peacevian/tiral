"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { cityEnabled } from "@/lib/deviceTier"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type maplibregl from "maplibre-gl"
import { KAMPALA_ZONE, SPRINT_MULTIPLIER, haversineDistanceMeters } from "@tiral/game-core"
import { useColyseusContext } from "@/components/ColyseusProvider"
import { getRoadHeading, type RoadGraph } from "@tiral/road-graph"
import { WalkableWays } from "@/components/WalkableWays"
import { useRoadMovement, type RoadInput } from "@/lib/useRoadMovement"
import { useStartPlacement } from "@/lib/useStartPlacement"
import { useMyLoadout } from "@/lib/useMyLoadout"
import { useRaceCamera } from "@/lib/useRaceCamera"
import { DEFAULT_LOADOUT } from "@tiral/avatars"
import { SignInGate } from "@/components/SignInGate"
import { privyEnabled, requestPrivyLogin } from "@/lib/privy"
import { Hub } from "@/components/hub/Hub"
import { FirstRunIntro, useFirstRun } from "@/components/hub/FirstRunIntro"
import { AdaptivePanel } from "@/components/ui/AdaptivePanel"
import { ServerUnreachable } from "@/components/ui"
import { usePlayer } from "@/lib/player"
import { loadRoadGraph } from "@/lib/roadGraph"
import { TopBar } from "@/components/game/TopBar"
import { ControlDeck } from "@/components/game/ControlDeck"
import { BillboardLayer, type BillboardPin } from "@/components/BillboardLayer"
import { VenuePins } from "@/components/VenuePins"
import { VENUES, type VenueId } from "@tiral/game-core"
import { BrandCard } from "@/components/BrandCard"

function ActiveSponsors({ campaigns }: { campaigns: { brandName: string }[] }) {
  if (campaigns.length === 0) return null
  const names = [...new Set(campaigns.map((campaign) => campaign.brandName))].slice(0, 3)
  return (
    <div className="mt-2 text-center text-[11px] text-sheet-mute">
      Sponsored by {names.join(" · ")}
    </div>
  )
}

import { ROTATION_SECONDS, selectCurrentAd } from "@/lib/billboards"
import { RaceEarningsSummary } from "@/components/game/RaceEarningsSummary"
import { NeedsHud } from "@/components/game/NeedsHud"
import { CollapseOverlay, PreloadCollapseFont } from "@/components/game/CollapseOverlay"
import { Modal } from "@/components/ui/Modal"
import { formatCoins } from "@/lib/useCoins"
import { PrizeBanner, PrizeResultLines } from "@/components/game/PrizeBanner"
import { signUpByCode } from "@/lib/prizeRaces"
import type { RaceListing } from "@/lib/useColyseus"
import { PageLoader } from "@/components/loader/Loader"

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
const City = dynamic(() => import("@/components/city/City").then((module) => ({ default: module.City })), { ssr: false })
const StreetCrowd = dynamic(
  () => import("@/components/city/StreetCrowd").then((module) => ({ default: module.StreetCrowd })),
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

/** Set in this browser once someone has an account here (see the roads effect). */
const RETURNING_KEY = "tiral:player"

const REMOTE_COLORS = [
  { color: "#38bdf8" },
  { color: "#f472b6" },
  { color: "#a78bfa" },
  { color: "#4ade80" },
  { color: "#fb7185" }
]

export default function Home() {
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  // Tiral's own 3D city over the map (strong phones; see components/city).
  const [city, setCity] = useState(false)
  useEffect(() => setCity(cityEnabled()), [])
  // Street-level only. The lobby map starts at 15, so the city and crowd stay
  // unloaded until a race or a pinch-in. That keeps the first play screen off
  // the building tiles and the Three scene.
  const [closeZoom, setCloseZoom] = useState(false)
  useEffect(() => {
    if (!map) return
    const sync = () => setCloseZoom(map.getZoom() >= 16)
    sync()
    map.on("zoom", sync)
    return () => {
      map.off("zoom", sync)
    }
  }, [map])
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
    prizeResult,
    needs,
    hustle,
    stall,
    live,
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
  const { ready: authReady, player, offline, refresh: refreshPlayer, busy: authBusy, error: authFailure, playAsGuest } = usePlayer()
  const [retryingPlayer, setRetryingPlayer] = useState(false)
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
  const [lobbyNotice, setLobbyNotice] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const phase = roomState?.phase ?? "lobby"
  const showWorld = city && (phase === "racing" || closeZoom)
  // In a hustle shift, not a race: that has its own screen.
  const router = useRouter()
  useEffect(() => {
    if (connected && (hustle || (stall && stall.phase !== "closed"))) router.replace("/hustle")
    else if (connected && live?.phase === "live") router.replace("/hustle?gig=live")
    // A finished stall shift (or LivTok between lives) has nothing to show here: disconnect it.
    else if (connected && (stall?.phase === "closed" || live)) leaveRoom()
  }, [connected, hustle, stall, live, router, leaveRoom])
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

  // Keep the open races live between races, quietly (no spinner, and an
  // error from a join attempt stays on screen).
  useEffect(() => {
    if (connected || reconnecting || !player) return
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return
      listRaces()
        .then(setRaces)
        .catch(() => {})
    }, 10_000)
    return () => clearInterval(id)
  }, [connected, reconnecting, listRaces, player !== null])

  // Any race counts as the first one (friends' races and prize races too),
  // so the first-run highlight on "Race now" goes away.
  const markRaced = firstRun.markRaced
  useEffect(() => {
    if (connected) markRaced()
  }, [connected, markRaced])

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
      setLobbyNotice(null)
      void runJoin(async () => {
        try {
          await joinByCode(code, myLoadout)
        } catch (error) {
          // Not open yet? It may be a prize race further out: sign up for it.
          const signedUp = await signUpByCode(code)
          if (!signedUp) throw error
          setLobbyNotice(signedUp)
        }
      })
    },
    [joinByCode, runJoin, myLoadout]
  )

  // A shared link (/play?join=CODE) drops a friend straight into that lobby.
  const sharedJoinDone = useRef(false)
  useEffect(() => {
    if (sharedJoinDone.current || !player || connected || reconnecting) return
    const code = new URLSearchParams(window.location.search).get("join")
    if (!code) return
    sharedJoinDone.current = true
    window.history.replaceState(null, "", window.location.pathname)
    handleJoinCode(code)
  }, [player, connected, reconnecting, handleJoinCode])

  const onMapReady = useCallback((readyMap: maplibregl.Map) => {
    setMap(readyMap)
    // Keep the zone clear of the hub: side panel on wide screens, sheet on phones.
    const wide = window.innerWidth >= 768
    readyMap.fitBounds(
      [[32.574, 0.309], [32.588, 0.321]],
      { padding: { top: 70, right: wide ? 440 : 45, bottom: wide ? 45 : 240, left: 45 }, maxZoom: 16 }
    )
  }, [])

  // Before the race the server sends only whether each rival has picked a start.
  const rivals = useMemo(
    () =>
      roomState
        ? Object.entries(roomState.players)
            .filter(([id]) => id !== sessionId)
            .map(([id, player]) => ({ id, name: player.name.slice(0, 12), ready: player.hasStart === true }))
        : [],
    [roomState, sessionId]
  )

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

  // Remember who has an account here, so the next visit can start on the roads
  // straight away (see below).
  useEffect(() => {
    if (!authReady) return
    try {
      if (player) window.localStorage.setItem(RETURNING_KEY, "1")
      else window.localStorage.removeItem(RETURNING_KEY)
    } catch {
      // Storage blocked: the roads just wait for the answer.
    }
  }, [authReady, player])

  // The roads (~100 KB, then built on the main thread) matter once you play. A
  // player, or someone who has played here before, loads them at once. A first
  // visit sees the sign-in card first: they load when the phone is idle (or at
  // once if the person signs in), so the card doesn't wait behind them.
  useEffect(() => {
    let returning = false
    try {
      returning = window.localStorage.getItem(RETURNING_KEY) === "1"
    } catch {
      // Treated as a first visit.
    }
    if (!player && !returning && !authReady) return
    let cancelled = false
    const start = () => {
      loadRoadGraph()
        .then((loaded) => {
          if (cancelled) return
          setGraph(loaded)
          setLoadingRoads(false)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setRoadError(error instanceof Error ? error.message : "Could not load roads")
          setLoadingRoads(false)
        })
    }
    if (player || returning) {
      start()
      return () => {
        cancelled = true
      }
    }
    const hasIdle = "requestIdleCallback" in window
    const idle = hasIdle ? window.requestIdleCallback(start, { timeout: 6000 }) : window.setTimeout(start, 3000)
    return () => {
      cancelled = true
      if (hasIdle) window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
  }, [authReady, player])

  const [billboardSlots, setBillboardSlots] = useState<BillboardSlot[]>([])
  const [billboardCampaigns, setBillboardCampaigns] = useState<BillboardCampaign[]>([])
  const [brandCardPin, setBrandCardPin] = useState<BillboardPin | null>(null)
  // A hangout pin tapped on the map (its card: boda fare, go).
  const [venueCard, setVenueCard] = useState<VenueId | null>(null)
  // A race needs the whole map: no ad card over it.
  useEffect(() => {
    if (phase === "racing") setBrandCardPin(null)
  }, [phase])
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
      <main className="tiral-game relative h-dvh w-screen overflow-hidden bg-sheet">
        <div className="absolute inset-x-0 bottom-0 top-[var(--shell-top)]">
          <MapView
            center={fallbackStart.position}
            zoom={15}
            pitch={48}
            bearing={-18}
            onMapReady={onMapReady}
          />
          {/* Tiral's 3D city on the lobby map too (inside the map's box, so it lines up). */}
          {map && showWorld && (
            <ThreeLayer map={map}>
              <City map={map} />
              <StreetCrowd map={map} />
              <hemisphereLight args={["#fff4d6", "#293548", 1.6]} position={[0, 0, 1]} />
              <directionalLight position={[4, 8, 10]} intensity={2.2} />
            </ThreeLayer>
          )}
        </div>
        {map && <BillboardLayer map={map} pins={billboardPins} onPinClick={setBrandCardPin} />}
        {map && player && <VenuePins map={map} onOpen={setVenueCard} />}
        {venueCard && (
          <Modal
            label={VENUES[venueCard].name}
            onClose={() => setVenueCard(null)}
            portal
            backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
            className="w-full max-w-sm rounded-3xl border border-sheet-line bg-sheet p-5 text-sheet-ink shadow-2xl"
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Go out</div>
            <h2 className="mt-1 text-xl font-black">
              {VENUES[venueCard].icon} {VENUES[venueCard].name}
            </h2>
            <p className="mt-1 text-sm text-sheet-mute">
              {VENUES[venueCard].area}. Music, pork and cold drinks with everyone who&apos;s out. Busiest in the evening and on Saturdays.
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setVenueCard(null)} className="min-h-[48px] flex-1 rounded-xl border border-sheet-line bg-sheet-card text-sm font-bold">
                Not now
              </button>
              <button
                type="button"
                disabled={(player?.balance ?? 0) < VENUES[venueCard].rideFare}
                onClick={() => router.push(`/out?place=${venueCard}&go=1`)}
                className="min-h-[48px] flex-[2] rounded-xl bg-flame text-sm font-black text-white disabled:opacity-40"
              >
                🛵 Take a boda · {formatCoins(VENUES[venueCard].rideFare)}
              </button>
            </div>
          </Modal>
        )}
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
            <AdaptivePanel label="Race" peekHeight={250} tone="light">
              <Hub
                races={races}
                loadingRaces={lobbyLoading}
                joining={joining}
                error={lobbyError}
                onRefresh={() => void refreshRaces()}
                onQuickRace={() => void runJoin(() => quickPlay(myLoadout))}
                onCreate={() => void runJoin(() => createRace(myLoadout))}
                onJoin={(roomId) => void runJoin(() => joinRace(roomId, myLoadout))}
                onJoinCode={handleJoinCode}
                notice={lobbyNotice}
                highlightQuickRace={firstRun.highlight}
              />
            </AdaptivePanel>
            {firstRun.showIntro && <FirstRunIntro onDone={firstRun.finishIntro} />}
          </>
        ) : (
          <>
            <Link
              href="/"
              prefetch={false}
              className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-20 rounded-xl border border-flame bg-flame px-3 py-2 text-sm font-black text-white shadow-xl"
            >
              Tiral
            </Link>
            {!authReady && <PageLoader label="Checking who you are…" />}
            <div className="absolute inset-x-0 bottom-0 z-20 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-flame/30 bg-flame-soft pt-3 text-sheet-ink shadow-[0_-6px_24px_rgba(14,42,77,0.14)]">
                {authReady && offline ? (
                  <ServerUnreachable
                    retrying={retryingPlayer}
                    onRetry={() => {
                      setRetryingPlayer(true)
                      void refreshPlayer().finally(() => setRetryingPlayer(false))
                    }}
                  />
                ) : authReady ? (
                  <SignInGate
                    busy={authBusy === "guest"}
                    error={authFailure}
                    authError={authError}
                    onGuest={playAsGuest}
                    onSignIn={privyEnabled ? requestPrivyLogin : null}
                  />
                ) : null}
              </div>
            </div>
          </>
        )}
      </main>
    )
  }

  return (
    <main className="tiral-game relative h-dvh w-screen overflow-hidden bg-sheet">
      {/* Same element type and position as the lobby screen's map wrapper, so
          React keeps the one map (no teardown, refetch or blank flash) when a
          race is joined or left. */}
      <div className="absolute inset-0">
        <MapView
          center={fallbackStart.position}
          zoom={15}
          pitch={48}
          bearing={-18}
          onMapReady={onMapReady}
        />
      </div>

      {map && <WalkableWays map={map} graph={graph} visible={showWorld} />}
      {map && (
        <ThreeLayer map={map}>
          {showWorld && <City map={map} />}
          {showWorld && <StreetCrowd map={map} focus={movement.coordinate} />}
          {/* Map world is z-up (three defaults to y-up): sky from above, ground below. */}
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
          interactive={phase !== "racing"}
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
          // Everyone in the room (rivals have no runner on the map before the gun).
          racerCount={roomState ? Object.keys(roomState.players).length : remoteAvatars.length + 1}
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
      {canSprint && <PreloadCollapseFont />}
      {connected && collapsed && needs?.collapsedUntil && <CollapseOverlay until={needs.collapsedUntil} />}

      {connected && phase === "racing" && ownFinishPosition !== null && (
        <div className="absolute left-1/2 top-[calc(max(0.5rem,env(safe-area-inset-top))+8.25rem)] z-30 -translate-x-1/2 rounded-2xl border border-leaf/30 bg-sheet-card/95 px-5 py-3 text-center text-sheet-ink shadow-2xl md:backdrop-blur-md">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-leaf">
            You finished {ownFinishPosition}
            {ownFinishPosition === 1 ? "st" : ownFinishPosition === 2 ? "nd" : ownFinishPosition === 3 ? "rd" : "th"}!
          </div>
          <div className="mt-1 text-sm text-sheet-mute">Others are still racing…</div>
        </div>
      )}

      {connected && phase === "finished" && (
        <Modal
          label="Race results"
          // It pops up mid-race: a held Space or Enter must not press "Race again".
          focus="panel"
          backdropClassName="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          // Scrolls on short screens (landscape phones, 10 racers) so the buttons stay reachable.
          className="max-h-[calc(100dvh-2rem)] w-[min(92vw,380px)] overflow-y-auto overscroll-contain rounded-2xl border border-flame/30 bg-sheet p-5 text-sheet-ink shadow-2xl"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-flame-deep">
            Race finished
          </div>
          <div className="mt-1 text-2xl font-black">
            {results?.[0]?.sessionId === sessionId
              ? "You won!"
              : results?.[0]
                ? `Winner: ${results[0].name}`
                : "Time's up: nobody reached the treasure"}
          </div>
          {results && results.length > 0 && (
            <ol className="mt-3 flex flex-col gap-1">
              {results.map((result) => (
                <li
                  key={result.sessionId}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    result.sessionId === sessionId
                      ? "bg-flame-soft font-bold text-flame-deep"
                      : "bg-sheet-card text-sheet-ink"
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
          {prizeResult && <PrizeResultLines result={prizeResult} sessionId={sessionId} />}
          {earnings && player && !player.user.signedIn &&
            (privyEnabled ? (
              <button
                type="button"
                onClick={requestPrivyLogin}
                className="mt-3 block w-full rounded-xl border border-sheet-line bg-sheet-card px-3 py-2 text-left text-xs leading-snug text-sheet-ink"
              >
                <span className="font-bold text-sheet-ink">Sign in</span> so you never lose these coins. Guest accounts
                live on this device only. →
              </button>
            ) : (
              <p className="mt-3 rounded-xl border border-sheet-line bg-sheet-card px-3 py-2 text-xs leading-snug text-sheet-mute">
                These coins stay on this device until sign-in is turned on.
              </p>
            ))}
          <button
            type="button"
            onClick={sendPlayAgain}
            className="mt-4 min-h-[48px] w-full rounded-xl bg-flame px-4 py-3 text-sm font-black text-white transition hover:bg-flame-dark"
          >
            Race again
          </button>
          <button
            type="button"
            onClick={leaveRoom}
            className="mt-2 min-h-[48px] w-full rounded-xl border border-sheet-line px-4 py-3 text-center text-sm font-bold text-sheet-ink"
          >
            Back to base
          </button>
          <ActiveSponsors campaigns={billboardCampaigns} />
        </Modal>
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
        onCancelTurn={movement.cancelTurn}
        queuedTurn={movement.queuedTurn}
        junction={movement.junction}
        turnLandedAt={movement.turnLandedAt}
        sprint={canSprint ? { active: sprinting, disabled: collapsed, empty: (needs?.energy ?? 100) <= 0, onChange: setSprint } : null}
        showStarts={showPicker && roomState !== null}
        hasStartPin={placement.hasPin}
        rivals={rivals}
        placementArmed={placement.armed}
        onTogglePlacement={() => placement.setArmed((armed) => !armed)}
        showSolo={phase === "lobby" && playerCount < 2 && !roomState?.prize}
        banner={roomState?.prize ? <PrizeBanner prize={roomState.prize} counting={phase === "countdown"} /> : null}
        onStartNow={sendStartNow}
        notice={placement.notice}
      />
    </main>
  )
}
