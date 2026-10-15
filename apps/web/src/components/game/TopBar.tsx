"use client"

import { useState } from "react"

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

// Slim race HUD: status on the left, recenter and leave on the right. The
// app shell (coins, profile, navigation) is hidden during races; this is all.
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

  const statusLine = reconnecting
    ? "Reconnecting…"
    : countdown !== null && phase !== "racing"
      ? `Starts in ${formatCountdown(countdown)}`
      : hudText ?? (phase === "racing" ? "Racing" : phase === "lobby" ? "Lobby" : phase)

  return (
    <div className="absolute inset-x-0 top-0 z-20 pt-[max(0.5rem,env(safe-area-inset-top))] px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
      <div className="flex min-h-[44px] items-center justify-between gap-1.5 rounded-2xl border border-white/10 bg-slate-950/80 py-1 pl-2.5 pr-1 shadow-xl md:backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-1.5">
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
            <div className="truncate text-xs font-black leading-tight text-white">
              {roomCode ?? "Tiral"}
              <span className="ml-1 font-bold text-slate-300">
                · {racerCount} racer{racerCount === 1 ? "" : "s"}
                {locked && phase !== "racing" ? " · 🔒" : ""}
              </span>
            </div>
            <div className="truncate font-mono text-[11px] leading-tight text-cyan-300">
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
        <div className="ml-auto mt-1.5 flex w-[min(72vw,240px)] flex-col gap-1 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl md:backdrop-blur-md">
          <p className="px-2 py-1 text-[11px] leading-snug text-slate-400">
            {phase === "racing" ? "Leaving now means no pay for this race." : "Back to the hub."}
          </p>
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
