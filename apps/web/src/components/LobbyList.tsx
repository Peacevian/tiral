"use client"

import { useState } from "react"
import type { RaceListing } from "@/lib/useColyseus"

type LobbyListProps = {
  races: RaceListing[]
  loading: boolean
  error: string | null
  joining: boolean
  onRefresh(): void
  onJoin(roomId: string): void
  onJoinCode(code: string): void
  onCreate(): void
  onQuickPlay(): void
}

function phaseBadge(phase: string) {
  if (phase === "lobby") return "bg-emerald-400/20 text-emerald-200"
  if (phase === "countdown") return "bg-amber-300/20 text-amber-200"
  if (phase === "racing") return "bg-sky-400/20 text-sky-200"
  return "bg-white/10 text-slate-300"
}

export function LobbyList({
  races,
  loading,
  error,
  joining,
  onRefresh,
  onJoin,
  onJoinCode,
  onCreate,
  onQuickPlay
}: LobbyListProps) {
  const [code, setCode] = useState("")
  const joinable = races.filter(
    (race) =>
      !race.locked &&
      (race.phase === "lobby" || race.phase === "countdown") &&
      race.playerCount < race.maxClients
  )

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            Tiral
          </div>
          <div className="text-xl font-black">Kampala Treasure Race</div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 disabled:opacity-40"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {error && <div className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCreate}
          disabled={joining}
          className="rounded-xl bg-amber-400 px-3 py-3 text-sm font-black text-slate-950 disabled:opacity-40"
        >
          Create race
        </button>
        <button
          type="button"
          onClick={onQuickPlay}
          disabled={joining}
          className="rounded-xl bg-cyan-500 px-3 py-3 text-sm font-black text-slate-950 disabled:opacity-40"
        >
          Quick play
        </button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (code.trim()) onJoinCode(code)
        }}
      >
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={8}
          disabled={joining}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-center font-mono text-sm font-bold uppercase tracking-[0.3em] text-white placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={joining || !code.trim()}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold disabled:opacity-40"
        >
          Join
        </button>
      </form>

      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        Open races ({joinable.length})
      </div>
      <div className="flex flex-col gap-2">
        {joinable.length === 0 && !loading && (
          <div className="rounded-xl border border-white/10 px-3 py-4 text-center text-sm text-slate-400">
            No open races — create one or quick play.
          </div>
        )}
        {joinable.map((race) => (
          <button
            key={race.roomId}
            type="button"
            disabled={joining}
            onClick={() => onJoin(race.roomId)}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:bg-white/10 disabled:opacity-40"
          >
            <div>
              <div className="font-mono text-lg font-black tracking-[0.2em]">{race.roomCode}</div>
              <div className="text-xs text-slate-400">
                {race.playerCount}/{race.maxClients} racers
                {race.phase === "countdown" && race.countdownSeconds !== null
                  ? ` · starts in ${race.countdownSeconds}s`
                  : ""}
              </div>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-bold ${phaseBadge(race.phase)}`}>
              {race.phase}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
