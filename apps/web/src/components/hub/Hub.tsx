"use client"

import { useState } from "react"
import Link from "next/link"
import type { RaceListing } from "@/lib/useColyseus"
import { HUSTLES } from "@tiral/game-core"
import { usePlayer } from "@/lib/player"
import { FoodGrid, FoodResultLine, useFoodPurchase } from "@/components/NeedsPanel"
import { HomeStatusCard, MessageList } from "@/components/LifePanel"
import { ActionButton, SectionLabel, Skeleton } from "@/components/ui"
import { PrizeRaces } from "@/components/hub/PrizeRaces"

export type HubActions = {
  races: RaceListing[]
  loadingRaces: boolean
  joining: boolean
  error: string | null
  onRefresh(): void
  onQuickRace(): void
  onCreate(): void
  onJoin(roomId: string): void
  onJoinCode(code: string): void
  /** Something to tell the player (not an error), e.g. "you're signed up". */
  notice?: string | null
  /** Pulse the Quick race button (first run). */
  highlightQuickRace?: boolean
}

function OpenRaces({ races, loadingRaces, joining, onRefresh, onJoin }: HubActions) {
  const joinable = races.filter(
    (race) =>
      // Prize races have their own section.
      !race.prize && !race.locked && (race.phase === "lobby" || race.phase === "countdown") && race.playerCount < race.maxClients
  )
  return (
    <div>
      <SectionLabel
        aside={
          <button
            type="button"
            onClick={onRefresh}
            disabled={loadingRaces}
            className="min-h-[44px] rounded-lg px-3 text-xs font-bold text-cyan-300 disabled:opacity-40"
          >
            {loadingRaces ? "…" : "Refresh"}
          </button>
        }
      >
        Open races ({joinable.length})
      </SectionLabel>
      {joinable.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-center text-xs text-slate-400">
          No open races. Quick race starts one others can join.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {joinable.map((race) => (
            <li key={race.roomId}>
              <button
                type="button"
                disabled={joining}
                onClick={() => onJoin(race.roomId)}
                className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10 disabled:opacity-40"
              >
                <span>
                  <span className="block font-mono text-base font-black tracking-[0.2em]">{race.roomCode}</span>
                  <span className="text-[11px] text-slate-400">
                    {race.playerCount}/{race.maxClients} racers
                    {race.phase === "countdown" && race.countdownSeconds !== null
                      ? ` · starts in ${race.countdownSeconds}s`
                      : ""}
                  </span>
                </span>
                <span className="text-xs font-black text-cyan-300">Join →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Between races: start racing first, then what needs your attention today.
export function Hub(actions: HubActions) {
  const { player } = usePlayer()
  const [code, setCode] = useState("")
  const [showCode, setShowCode] = useState(false)
  const food = useFoodPurchase()
  const { joining, error } = actions

  const pending = player?.life?.events.filter((event) => event.status === "pending") ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Race (visible in the collapsed sheet on phones) */}
      <div className="flex flex-col gap-2">
        <ActionButton
          variant="primary"
          size="lg"
          disabled={joining}
          onClick={actions.onQuickRace}
          className={`w-full ${actions.highlightQuickRace ? "animate-pulse ring-4 ring-amber-300/40 motion-reduce:animate-none" : ""}`}
        >
          {joining ? "Finding a race…" : "▶ Quick race"}
        </ActionButton>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton variant="secondary" disabled={joining} onClick={actions.onCreate}>
            Create race
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={joining}
            onClick={() => setShowCode((value) => !value)}
            aria-expanded={showCode}
          >
            Join with code
          </ActionButton>
        </div>
        {showCode && (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (code.trim()) actions.onJoinCode(code)
            }}
          >
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="CODE"
              aria-label="Race code"
              maxLength={8}
              autoFocus
              className="min-h-[44px] w-full rounded-xl border border-white/15 bg-white/5 px-3 text-center font-mono font-bold uppercase tracking-[0.3em] text-white placeholder:text-slate-500"
            />
            <ActionButton type="submit" variant="secondary" disabled={joining || !code.trim()}>
              Join
            </ActionButton>
          </form>
        )}
        {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-200">{error}</p>}
        {actions.notice && (
          <p role="status" className="rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-100">
            {actions.notice}
          </p>
        )}
      </div>

      <PrizeRaces openRaces={actions.races} joining={actions.joining} onJoinCode={actions.onJoinCode} />

      <OpenRaces {...actions} />

      {/* 2. Today */}
      <div>
        <SectionLabel>Today</SectionLabel>
        {player?.life ? <HomeStatusCard life={player.life} balance={player.balance} /> : <Skeleton className="h-32" />}
      </div>

      {/* 3. Inbox preview */}
      <div>
        <SectionLabel
          aside={
            <Link href="/inbox" className="text-xs font-bold text-cyan-300">
              Open inbox →
            </Link>
          }
        >
          Waiting on you
        </SectionLabel>
        <MessageList events={pending.slice(0, 2)} empty="No one needs anything from you right now." />
      </div>

      {/* 4. Hustles */}
      <div>
        <SectionLabel>Hustles</SectionLabel>
        <p className="mb-2 text-[11px] leading-snug text-slate-400">Work on your own time. No other players needed.</p>
        <ul className="flex flex-col gap-1.5">
          {HUSTLES.map((hustle) =>
            hustle.available ? (
              <li key={hustle.id}>
                <Link
                  href={`/hustle?gig=${hustle.id}`}
                  className="flex min-h-[56px] items-center gap-3 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 transition hover:bg-emerald-400/15"
                >
                  <span aria-hidden className="text-2xl">
                    {hustle.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-white">{hustle.name}</span>
                    <span className="block text-[11px] leading-snug text-slate-300">{hustle.blurb}</span>
                  </span>
                  <span className="text-xs font-black text-emerald-300">Work →</span>
                </Link>
              </li>
            ) : (
              <li
                key={hustle.id}
                className="flex min-h-[56px] items-center gap-3 rounded-xl border border-dashed border-white/15 px-3 py-2 opacity-70"
              >
                <span aria-hidden className="text-2xl grayscale">
                  {hustle.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-white">{hustle.name}</span>
                  <span className="block text-[11px] leading-snug text-slate-400">{hustle.blurb}</span>
                </span>
                <span className="text-[11px] font-bold text-slate-400">Soon</span>
              </li>
            )
          )}
        </ul>
      </div>

      {/* 5. Quick food */}
      <div>
        <SectionLabel
          aside={
            <Link href="/home?tab=body" className="text-xs font-bold text-cyan-300">
              All food →
            </Link>
          }
        >
          Eat before you race
        </SectionLabel>
        <FoodGrid
          limit={3}
          onBuy={(foodId) => void food.buy(foodId)}
        />
        <FoodResultLine result={food.result} />
      </div>
    </div>
  )
}
