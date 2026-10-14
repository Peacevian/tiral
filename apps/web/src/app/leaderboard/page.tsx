"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePlayer } from "@/lib/player"

type LeaderboardEntry = {
  userId: string
  displayName: string
  avatarUrl: string | null
  points: number
  wins: number
  podiums: number
  races: number
}

type Period = "week" | "all"

export default function LeaderboardPage() {
  const { ready, player } = usePlayer()
  const [period, setPeriod] = useState<Period>("all")
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (nextPeriod: Period) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/leaderboard?period=${nextPeriod}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = (await response.json()) as { entries: LeaderboardEntry[] }
      setEntries(body.entries)
    } catch {
      setError("Could not load the leaderboard")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(period)
  }, [load, period])

  return (
    <main className="mx-auto h-dvh w-full max-w-xl overflow-y-auto bg-slate-950 px-4 pb-[calc(var(--shell-bottom)+1.5rem)] pt-[calc(var(--shell-top)+1.25rem)] text-white">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            Tiral
          </div>
          <h1 className="text-2xl font-black">Leaderboard</h1>
        </div>
        {/* Signed-in players have the app navigation; visitors from the landing page get a way in. */}
        {ready && !player && (
          <Link href="/play" className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold text-slate-200">
            Play →
          </Link>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["week", "all"] as Period[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setPeriod(option)}
            className={`rounded-xl px-3 py-2 text-sm font-black ${
              period === option ? "bg-amber-400 text-slate-950" : "bg-white/10 text-white"
            }`}
          >
            {option === "week" ? "This week" : "All time"}
          </button>
        ))}
      </div>

      {loading && <div className="mt-6 text-center text-sm text-slate-400">Loading standings…</div>}
      {error && <div className="mt-6 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200">{error}</div>}

      {!loading && !error && entries.length === 0 && (
        <div className="mt-6 rounded-xl border border-white/10 px-4 py-6 text-center text-sm text-slate-400">
          No finished races yet — be the first on the board.
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <ol className="mt-4 flex flex-col gap-2">
          {entries.map((entry, index) => (
            <li
              key={entry.userId}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3"
            >
              <div className="w-8 text-center font-mono text-lg font-black text-amber-300">
                {index + 1}
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-base font-black text-slate-950">
                {entry.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{entry.displayName}</div>
                <div className="text-xs text-slate-400">
                  {entry.wins} wins · {entry.podiums} podiums · {entry.races} races
                </div>
              </div>
              <div className="font-mono text-lg font-black text-cyan-300">{entry.points}</div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-center text-[11px] text-slate-500">
        1st = 3 pts · 2nd = 2 pts · 3rd = 1 pt
      </p>
    </main>
  )
}
