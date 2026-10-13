"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { KAMPALA_ZONE } from "@tiral/game-core"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { DEFAULT_HOUSE, type HouseLoadout } from "@tiral/houses"
import { ProfileCustomizer } from "@/components/ProfileCustomizer"
import { HousePreview } from "@/components/house/HousePreview"
import { HouseCustomizer } from "@/components/house/HouseCustomizer"
import { HomeHud } from "@/components/house/HomeHud"
import { HomeSheet, type HomeSheetTab } from "@/components/house/HomeSheet"
import { WalletPanel } from "@/components/WalletPanel"
import { AVATAR_HOME, type HouseView, type RoomSpot } from "@/components/house/roomSpots"

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

export default function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [recentRaces, setRecentRaces] = useState<RecentRace[]>([])
  const [draftName, setDraftName] = useState("")
  const [draftLoadout, setDraftLoadout] = useState<AvatarLoadout>(DEFAULT_LOADOUT)
  const [draftHouse, setDraftHouse] = useState<HouseLoadout>(DEFAULT_HOUSE)
  const [showRoof, setShowRoof] = useState(true)
  const [homeView, setHomeView] = useState<HouseView>("outside")
  const [sheetTab, setSheetTab] = useState<HomeSheetTab>("avatar")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [avatarSpot, setAvatarSpot] = useState<RoomSpot>(AVATAR_HOME)
  const [selection, setSelection] = useState<RoomSpot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // The race HUD's coin chip links to /profile?tab=wallet.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "wallet") {
      setSheetTab("wallet")
      setSheetOpen(true)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/profile")
      .then(async (response) => {
        if (!response.ok) return null
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
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    } catch {
      setNotice("Could not save — try again.")
    } finally {
      setSaving(false)
    }
  }, [user, draftName, draftLoadout, draftHouse])

  if (loading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl bg-slate-950 px-4 pb-24 pt-8 text-white md:pb-8">
        <div className="text-center text-sm text-slate-400">Loading profile…</div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl bg-slate-950 px-4 pb-24 pt-8 text-white md:pb-8">
        <h1 className="text-2xl font-black">Profile</h1>
        <p className="mt-2 text-sm text-slate-400">
          You are signed out. Join the game first — a profile is created automatically.
        </p>
        <Link
          href="/play"
          className="mt-4 inline-block rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950"
        >
          ← Back to the game
        </Link>
      </main>
    )
  }

  return (
    <main className="tiral-game relative h-dvh w-screen overflow-hidden bg-slate-950 text-white">
      {/* Scene viewport: shrinks above the open sheet on phones so the house
          stays in view; docks left of the side panel on tablet/desktop. */}
      <div
        className={`absolute inset-x-0 top-0 transition-[bottom] duration-200 md:bottom-0 md:right-[22rem] ${
          sheetOpen ? "bottom-[46dvh] sm:bottom-[50dvh]" : "bottom-0"
        }`}
      >
        <HousePreview
          fill
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
            setSheetTab("avatar")
            setSheetOpen(true)
          }}
          onSelectSurface={() => {
            setSelection(null)
            setSheetTab("house")
            setSheetOpen(true)
          }}
        />
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
        <div className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(4.25rem,calc(env(safe-area-inset-top)+3.75rem))] z-20 flex overflow-hidden rounded-xl border border-white/15 bg-slate-950/80 shadow-xl backdrop-blur-md">
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
        tab={sheetTab}
        onTab={setSheetTab}
        open={sheetOpen}
        onToggle={() => setSheetOpen((open) => !open)}
        avatar={
          <ProfileCustomizer
            loadout={draftLoadout}
            onChange={(next) => {
              setDraftLoadout(next)
              setDirty(true)
            }}
          />
        }
        wallet={<WalletPanel />}
        house={
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowRoof((value) => !value)}
              className="min-h-[44px] rounded-xl border border-white/15 px-3 text-xs font-bold text-slate-200"
            >
              {showRoof ? "Hide roof" : "Show roof"}
            </button>
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
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{stat.label}</div>
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
            <button
              type="button"
              onClick={() => {
                setDraftLoadout(user.loadout)
                setDraftHouse(user.house ?? DEFAULT_HOUSE)
                setDraftName(user.displayName)
                setDirty(false)
                setNotice(null)
              }}
              disabled={saving || !dirty}
              className="min-h-[44px] rounded-xl border border-white/15 px-4 text-sm font-bold text-slate-200 disabled:opacity-40"
            >
              Reset changes
            </button>
          </div>
        }
      />
    </main>
  )
}
