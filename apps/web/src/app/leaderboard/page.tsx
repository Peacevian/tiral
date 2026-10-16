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
    <main className="h-dvh w-full overflow-y-auto bg-sheet text-sheet-ink">
      <div className="mx-auto w-full max-w-xl px-4 pb-[calc(var(--shell-bottom)+1.5rem)] pt-[calc(var(--shell-top)+1.25rem)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-flame-deep">
              Tiral
            </div>
            <h1 className="text-2xl font-black">Leaderboard</h1>
          </div>
          {/* Signed-in players have the app navigation; visitors from the landing page get a way in. */}
          {ready && !player && (
            <Link href="/play" className="rounded-lg bg-flame px-3 py-2 text-sm font-black text-white">
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
              aria-pressed={period === option}
              className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-black ${
                period === option ? "bg-flame text-white" : "bg-sheet-soft text-sheet-blue"
              }`}
            >
              {option === "week" ? "This week" : "All time"}
            </button>
          ))}
        </div>

        {loading && <div className="mt-6 text-center text-sm text-sheet-mute">Loading standings…</div>}
        {error && <div className="mt-6 rounded-xl bg-flame-soft px-4 py-3 text-sm font-bold text-flame-deep">{error}</div>}

        {!loading && !error && entries.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-sheet-line px-4 py-6 text-center text-sm text-sheet-mute">
            No finished races yet — be the first on the board.
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <ol className="mt-4 flex flex-col gap-2">
            {entries.map((entry, index) => (
              <li
                key={entry.userId}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                  entry.userId === player?.user.id ? "border-flame bg-flame-soft" : "border-sheet-line bg-sheet-card"
                }`}
              >
                <div className="w-8 text-center font-mono text-lg font-black text-flame-deep">
                  {index + 1}
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sheet-soft text-base font-black text-sheet-blue">
                  {entry.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {entry.displayName}
                    {entry.userId === player?.user.id && <span className="ml-1 text-xs text-flame-deep">· you</span>}
                  </div>
                  <div className="text-xs text-sheet-mute">
                    {entry.wins} wins · {entry.podiums} podiums · {entry.races} races
                  </div>
                </div>
                <div className="font-mono text-lg font-black text-sheet-blue">{entry.points}</div>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-4 text-center text-[11px] text-sheet-mute">
          1st = 3 pts · 2nd = 2 pts · 3rd = 1 pt
        </p>
      </div>
    </main>
  )
}
