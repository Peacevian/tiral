"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { onThisHost } from "@/lib/serverAddress"

type LiveState = {
  races: number
  top: string[]
  sponsors: string[]
} | null

// Best-effort live snapshot. Renders nothing if every source fails,
// so the landing page can never break because of game APIs.
export function LiveStrip() {
  const [live, setLive] = useState<LiveState>(null)

  useEffect(() => {
    let cancelled = false
    const racesUrl = process.env.NEXT_PUBLIC_RACES_API_URL ? onThisHost(process.env.NEXT_PUBLIC_RACES_API_URL) : ""
    const jobs: Promise<Partial<NonNullable<LiveState>>>[] = [
      fetch("/api/leaderboard?limit=3")
        .then((r) => (r.ok ? r.json() : null))
        .then((body): Partial<NonNullable<LiveState>> => {
          const rows = Array.isArray(body?.entries) ? body.entries : []
          const top = rows
            .slice(0, 3)
            .map((row: { displayName?: string }) => row.displayName)
            .filter(Boolean) as string[]
          return top.length > 0 ? { top } : {}
        })
        .catch(() => ({})),
      fetch("/api/billboards/active")
        .then((r) => (r.ok ? r.json() : null))
        .then((body): Partial<NonNullable<LiveState>> => {
          const campaigns = Array.isArray(body?.campaigns) ? body.campaigns : []
          const sponsors = [...new Set(campaigns.map((c: { brandName?: string }) => c.brandName).filter(Boolean))] as string[]
          return sponsors.length > 0 ? { sponsors: sponsors.slice(0, 3) } : {}
        })
        .catch(() => ({}))
    ]
    if (racesUrl) {
      jobs.push(
        fetch(`${racesUrl}/races`)
          .then((r) => (r.ok ? r.json() : null))
          .then((body): Partial<NonNullable<LiveState>> => {
            // The listings API returns a plain array of open races.
            const list = Array.isArray(body) ? body : []
            return list.length > 0 ? { races: list.length } : {}
          })
          .catch(() => ({}))
      )
    }
    Promise.all(jobs).then((parts) => {
      if (cancelled) return
      const merged = Object.assign({}, ...parts)
      if (merged.races !== undefined || merged.top !== undefined || merged.sponsors !== undefined) {
        setLive(merged as NonNullable<LiveState>)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!live) return null

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-4">
      <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/5 px-5 py-4 text-center sm:flex-row sm:text-left">
        <div className="flex flex-col gap-1 text-sm text-slate-200">
          {live.races !== undefined && (
            <span>
              <span className="font-black text-emerald-300">{live.races}</span> race
              {live.races === 1 ? "" : "s"} open right now
            </span>
          )}
          {live.top && <span className="text-slate-300">Top hunters: {live.top.join(" · ")}</span>}
          {live.sponsors && (
            <span className="text-xs text-slate-400">Sponsored by {live.sponsors.join(" · ")}</span>
          )}
        </div>
        <Link
          href="/play"
          className="shrink-0 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
        >
          Join a race →
        </Link>
      </div>
    </section>
  )
}
