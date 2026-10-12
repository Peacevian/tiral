"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

type AuthUser = {
  id: string
  displayName: string
  avatarUrl: string | null
}

type TopBarProps = {
  roomCode: string | null
  racerCount: number
  phase: string
  reconnecting: boolean
  countdown: number | null
  bountyName: string | null
  hudText: string | null
  locked: boolean
  showRecenter: boolean
  followSuspended: boolean
  onRecenter(): void
  onLeave(): void
}

function formatCountdown(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
}

// Slim full-width HUD: status on the left, actions on the right.
// Everything secondary lives behind the ⋯ menu so the map stays visible.
export function TopBar({
  roomCode,
  racerCount,
  phase,
  reconnecting,
  countdown,
  bountyName,
  hudText,
  locked,
  showRecenter,
  followSuspended,
  onRecenter,
  onLeave
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((body: { user: AuthUser | null }) => {
        if (!cancelled) setUser(body.user)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const playAsGuest = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch("/api/auth/guest", { method: "POST" })
      const body = (await response.json()) as { user?: AuthUser }
      if (body.user) setUser(body.user)
    } catch {
      // stay signed out on failure
    } finally {
      setBusy(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setBusy(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // cookie may already be gone; still clear local state
    } finally {
      setUser(null)
      setBusy(false)
      setMenuOpen(false)
    }
  }, [])

  const statusLine = reconnecting
    ? "Reconnecting…"
    : countdown !== null && phase !== "racing"
      ? `Starts in ${formatCountdown(countdown)}`
      : hudText ?? (phase === "racing" ? "Racing" : phase === "lobby" ? "Lobby" : phase)

  return (
    <div className="absolute inset-x-0 top-0 z-20 pt-[max(0.5rem,env(safe-area-inset-top))] px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
      <div className="flex min-h-[48px] items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/80 py-1.5 pl-3 pr-1.5 shadow-xl backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                phase === "racing" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                phase === "racing" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-black leading-tight text-white">
              {roomCode ?? "Tiral"}
              <span className="ml-1.5 font-bold text-slate-300">
                · {racerCount} racer{racerCount === 1 ? "" : "s"}
                {locked && phase === "racing" ? "" : locked ? " · 🔒" : ""}
              </span>
            </div>
            <div className="truncate font-mono text-xs leading-tight text-cyan-300">
              {bountyName ? <span className="mr-1.5 text-emerald-300">◉ {bountyName}</span> : null}
              {statusLine}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showRecenter && (
            <button
              type="button"
              onClick={onRecenter}
              aria-label="Recenter on me"
              title={followSuspended ? "Follow off — tap to resume" : "Recenter on me"}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border text-lg font-black ${
                followSuspended
                  ? "border-amber-300/70 text-amber-300"
                  : "border-white/15 text-slate-200"
              }`}
            >
              ◎
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/15 text-lg font-black text-slate-200"
          >
            ⋯
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="ml-auto mt-1.5 flex w-[min(72vw,240px)] flex-col gap-1 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-black text-slate-950">
              {user ? user.displayName.charAt(0).toUpperCase() : "?"}
            </div>
            <div className="min-w-0 truncate text-sm font-bold text-slate-100">
              {user ? user.displayName : "Signed out"}
            </div>
          </div>
          {!user && (
            <>
              <a
                href="/api/auth/tiktok"
                className="block rounded-xl bg-white px-3 py-2.5 text-center text-sm font-black text-slate-950"
              >
                Continue with TikTok
              </a>
              <button
                type="button"
                onClick={playAsGuest}
                disabled={busy}
                className="rounded-xl bg-white/10 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "…" : "Play as guest"}
              </button>
            </>
          )}
          {user && (
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="block rounded-xl bg-white/5 px-3 py-2.5 text-center text-sm font-bold text-slate-100"
            >
              Profile
            </Link>
          )}
          <Link
            href="/leaderboard"
            onClick={() => setMenuOpen(false)}
            className="block rounded-xl bg-white/5 px-3 py-2.5 text-center text-sm font-bold text-slate-100"
          >
            Leaderboard
          </Link>
          {user && (
            <button
              type="button"
              onClick={logout}
              disabled={busy}
              className="rounded-xl bg-white/5 px-3 py-2.5 text-sm font-bold text-slate-300 disabled:opacity-40"
            >
              Log out
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              onLeave()
            }}
            className="rounded-xl border border-rose-300/30 px-3 py-2.5 text-sm font-bold text-rose-200"
          >
            Leave race
          </button>
        </div>
      )}
    </div>
  )
}
