"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { KAMPALA_ZONE, RENTAL_BIKE_LOOK, type BikeLook } from "@tiral/game-core"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { DEFAULT_HOUSE, type HouseLoadout } from "@tiral/houses"
import { ProfileCustomizer } from "@/components/ProfileCustomizer"
import { HousePreview } from "@/components/house/HousePreview"
import { HouseCustomizer } from "@/components/house/HouseCustomizer"
import { HomeHud } from "@/components/house/HomeHud"
import { HomeSheet, type HomeSheetTab } from "@/components/house/HomeSheet"
import { WalletPanel } from "@/components/WalletPanel"
import { GaragePanel } from "@/components/bike/GaragePanel"
import { NeedsPanel } from "@/components/NeedsPanel"
import { usePlayer } from "@/lib/player"
import { isLiteDevice } from "@/lib/deviceTier"
import { ServerUnreachable } from "@/components/ui"
import { AVATAR_HOME, type HouseView, type RoomSpot } from "@/components/house/roomSpots"

const BikeShowroom = dynamic(
  () => import("@/components/bike/BikeShowroom").then((module) => ({ default: module.BikeShowroom })),
  { ssr: false }
)

type ProfileUser = {
  id: string
  displayName: string
  avatarUrl: string | null
  loadout: AvatarLoadout
  house: HouseLoadout
  tiktokLinked: boolean
}

type ProfileStats = {
  races: number
  wins: number
  podiums: number
  points: number
  bestPosition: number | null
}

type RecentRace = {
  raceId: string
  destinationId: string
  position: number
  playerCount: number
  finishedAt: string
}

function bountyName(destinationId: string): string {
  return (
    KAMPALA_ZONE.bountyLocations.find((bounty) => bounty.id === destinationId)?.name ??
    destinationId
  )
}

export default function HomePage() {
  const { refresh: refreshPlayer, player } = usePlayer()
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [recentRaces, setRecentRaces] = useState<RecentRace[]>([])
  const [draftName, setDraftName] = useState("")
  const [draftLoadout, setDraftLoadout] = useState<AvatarLoadout>(DEFAULT_LOADOUT)
  const [draftHouse, setDraftHouse] = useState<HouseLoadout>(DEFAULT_HOUSE)
  const [showRoof, setShowRoof] = useState(true)
  const [homeView, setHomeView] = useState<HouseView>("outside")
  // Open section of the home panel, or null for the menu of tiles.
  const [section, setSection] = useState<HomeSheetTab | null>(null)
  // The bike showroom mounts on first visit; it's kept (paused) afterwards
  // unless the phone is low-end (see the scene viewport below).
  const [showroomOpened, setShowroomOpened] = useState(false)
  const [keepShowroom, setKeepShowroom] = useState(false)
  useEffect(() => {
    if (section === "bike") setShowroomOpened(true)
  }, [section])
  useEffect(() => setKeepShowroom(!isLiteDevice()), [])
  // Home → Bike shows the selected bike big in the main scene.
  const [showroomLook, setShowroomLook] = useState<BikeLook>(RENTAL_BIKE_LOOK)
  // The Bike tile shows which bike you ride.
  const [bikeStatus, setBikeStatus] = useState<string | null>(null)
  useEffect(() => {
    if (!player) return
    fetch("/api/garage")
      .then((response) => (response.ok ? response.json() : null))
      .then((garage: { bikes: Array<{ id: string; name: string; wear: number }>; activeBikeId: string | null } | null) => {
        if (!garage) return
        const active = garage.bikes.find((bike) => bike.id === garage.activeBikeId)
        setBikeStatus(active ? `${active.name} · wear ${Math.round(active.wear)}%` : "Stage rental")
      })
      .catch(() => {})
  }, [player, section])
  const [avatarSpot, setAvatarSpot] = useState<RoomSpot>(AVATAR_HOME)
  const [selection, setSelection] = useState<RoomSpot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // The player bar links straight to a tab: /home?tab=wallet, ?tab=body, …
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab")
    if (tab === "wallet" || tab === "body" || tab === "avatar" || tab === "house" || tab === "room" || tab === "bike") {
      setSection(tab)
    }
  }, [])

  // A failed load is "can't reach the server", never "signed out".
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoadFailed(false)
    fetch("/api/profile", { signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        return (await response.json()) as {
          user: ProfileUser | null
          stats: ProfileStats
          recentRaces: RecentRace[]
        }
      })
      .then((body) => {
        if (cancelled || !body?.user) return
        setUser(body.user)
        setStats(body.stats)
        setRecentRaces(body.recentRaces)
        setDraftName(body.user.displayName)
        setDraftLoadout(body.user.loadout)
        setDraftHouse(body.user.house ?? DEFAULT_HOUSE)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadAttempt])

  // Unsaved look/house/name: warn before the edits are lost, both on reload or
  // closing the tab, and on in-app links (the nav bar, Home → Play, ...).
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link || link.target === "_blank" || event.defaultPrevented) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [dirty])

  const save = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setNotice(null)
    try {
      const payload: { displayName?: string; loadout?: AvatarLoadout; house?: HouseLoadout } = {}
      if (draftName.trim() !== user.displayName) {
        payload.displayName = draftName.trim()
      }
      if (JSON.stringify(draftLoadout) !== JSON.stringify(user.loadout)) {
        payload.loadout = draftLoadout
      }
      if (JSON.stringify(draftHouse) !== JSON.stringify(user.house)) {
        payload.house = draftHouse
      }
      if (Object.keys(payload).length === 0) {
        setNotice("Nothing to save — no changes yet.")
        return
      }
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const body = (await response.json()) as {
        user?: ProfileUser
        error?: string
      }
      if (!response.ok || !body.user) {
        setNotice(body.error ?? "Could not save — try again.")
        return
      }
      setUser({ ...body.user, tiktokLinked: user.tiktokLinked })
      setDraftName(body.user.displayName)
      setDraftLoadout(body.user.loadout)
      setDraftHouse(body.user.house ?? DEFAULT_HOUSE)
      setDirty(false)
      setNotice("Saved! Your new look shows up in your next race.")
      void refreshPlayer()
    } catch {
      setNotice("Could not save — try again.")
    } finally {
      setSaving(false)
    }
  }, [user, draftName, draftLoadout, draftHouse])

  if (loading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl bg-slate-950 px-4 pb-[calc(var(--shell-bottom)+1.5rem)] pt-[calc(var(--shell-top)+2rem)] text-white">
        <div className="text-center text-sm text-slate-400">Loading your home…</div>
      </main>
    )
  }

  if (!user && loadFailed) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl bg-slate-950 px-4 pb-[calc(var(--shell-bottom)+1.5rem)] pt-[calc(var(--shell-top)+2rem)] text-white">
        <ServerUnreachable
          retrying={loading}
          onRetry={() => {
            setLoading(true)
            setLoadAttempt((attempt) => attempt + 1)
          }}
        />
      </main>
    )
  }

  if (!user) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl bg-slate-950 px-4 pb-[calc(var(--shell-bottom)+1.5rem)] pt-[calc(var(--shell-top)+2rem)] text-white">
        <h1 className="text-2xl font-black">Home</h1>
        <p className="mt-2 text-sm text-slate-400">
          You are signed out. Sign in with TikTok or as a guest to get your runner and your room.
        </p>
        <Link
          href="/play"
          className="mt-4 inline-block rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950"
        >
          Sign in
        </Link>
      </main>
    )
  }

  return (
    <main className="tiral-game relative h-dvh w-screen overflow-hidden bg-slate-950 text-white">
      {/* Scene viewport: shrinks above the open sheet on phones so the house
          stays in view; docks left of the side panel on tablet/desktop. */}
      <div
        className={`absolute inset-x-0 top-[var(--shell-top)] transition-[bottom] duration-200 md:bottom-0 md:right-[23rem] ${
          section ? "bottom-[calc(var(--shell-bottom)+40dvh+4rem)] sm:bottom-[calc(var(--shell-bottom)+44dvh+4rem)]" : "bottom-[calc(var(--shell-bottom)+16.5rem)]"
        }`}
      >
        {/* Bike: the main scene becomes the showroom for the selected bike.
            The house scene stays alive underneath (paused, hidden) so coming
            back doesn't rebuild it; the showroom is kept too once opened,
            except on low-end phones where two live scenes cost too much memory. */}
        {(section === "bike" || keepShowroom) && showroomOpened && (
          <div className={`absolute inset-0 ${section === "bike" ? "z-[1]" : "invisible"}`}>
            <BikeShowroom look={showroomLook} paused={section !== "bike"} />
            <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] font-bold text-slate-400">
              Drag to look around
            </div>
          </div>
        )}
        <div className={section === "bike" ? "invisible" : undefined}>
          <HousePreview
            fill
            paused={section === "bike"}
            house={draftHouse}
            showRoof={showRoof}
            view={homeView}
            avatarLoadout={draftLoadout}
            avatarSpot={avatarSpot}
            selection={selection}
            onSelectTile={(x, z) => {
              setAvatarSpot({ x, z })
              setSelection({ x, z })
            }}
            onSelectAvatar={() => {
              setSelection(null)
              setSection("avatar")
            }}
            onSelectSurface={() => {
              setSelection(null)
              setSection("house")
            }}
          />
        </div>
        <HomeHud
          displayName={user.displayName}
          dirty={dirty}
          saving={saving}
          notice={notice}
          onSave={() => void save()}
          showRoof={showRoof}
          onToggleRoof={() => setShowRoof((value) => !value)}
          onReset={() => {
            setDraftLoadout(user.loadout)
            setDraftHouse(user.house ?? DEFAULT_HOUSE)
            setDraftName(user.displayName)
            setDirty(false)
            setNotice(null)
          }}
        />
        <div className={`absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[3.75rem] z-20 overflow-hidden ${section === "bike" ? "hidden" : "flex"} rounded-xl border border-white/15 bg-slate-950/80 shadow-xl md:backdrop-blur-md`}>
          {(["outside", "inside"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setHomeView(view)}
              aria-pressed={homeView === view}
              className={`min-h-[44px] px-3 text-[11px] font-black capitalize transition sm:px-4 sm:text-xs ${
                homeView === view ? "bg-amber-400 text-slate-950" : "text-slate-200"
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>
      <HomeSheet
        section={section}
        onSection={setSection}
        status={{
          avatar: dirty ? "Unsaved changes" : "Your look",
          body: player ? `⚡${Math.round(player.needs.energy)} ❤${Math.round(player.needs.health)}` : undefined,
          bike: bikeStatus ?? undefined,
          wallet: player ? `${player.balance.toLocaleString("en-US")} BNG` : undefined,
          room: stats ? `${stats.wins} wins · ${stats.races} races` : undefined
        }}
        avatar={
          <ProfileCustomizer
            loadout={draftLoadout}
            onChange={(next) => {
              setDraftLoadout(next)
              setDirty(true)
            }}
          />
        }
        body={<NeedsPanel />}
        bike={<GaragePanel onShow={setShowroomLook} />}
        wallet={<WalletPanel />}
        house={
          <div className="flex flex-col gap-3">
            {/* Roof on/off and Reset live in the ⋯ menu at the top (one place for each). */}
            <HouseCustomizer
              house={draftHouse}
              onChange={(next) => {
                setDraftHouse(next)
                setDirty(true)
              }}
            />
          </div>
        }
        room={
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-lg font-black text-slate-950">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                {user.tiktokLinked ? (
                  <>
                    <div className="truncate font-bold">{user.displayName}</div>
                    <div className="text-[11px] text-slate-400">Synced from TikTok</div>
                  </>
                ) : (
                  <input
                    value={draftName}
                    maxLength={24}
                    onChange={(event) => {
                      setDraftName(event.target.value)
                      setDirty(true)
                    }}
                    className="w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 font-bold"
                  />
                )}
              </div>
            </div>
            {stats && (
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { label: "Points", value: stats.points },
                  { label: "Wins", value: stats.wins },
                  { label: "Races", value: stats.races },
                  { label: "Best", value: stats.bestPosition ?? "–" }
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-white/10 bg-white/5 px-1 py-2">
                    <div className="font-mono text-base font-black text-cyan-300">{stat.value}</div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">{stat.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Recent races
              </div>
              {recentRaces.length === 0 ? (
                <div className="rounded-xl border border-white/10 px-4 py-3 text-center text-xs text-slate-400">
                  No finished races yet.
                </div>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {recentRaces.map((race) => (
                    <li
                      key={race.raceId}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
                    >
                      <span className="font-bold">{bountyName(race.destinationId)}</span>
                      <span className="text-[11px] text-slate-400">
                        {race.position}
                        {race.position === 1 ? "st" : race.position === 2 ? "nd" : race.position === 3 ? "rd" : "th"} of{" "}
                        {race.playerCount} · {new Date(race.finishedAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        }
      />
    </main>
  )
}
