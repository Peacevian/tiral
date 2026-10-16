"use client"

import Link from "next/link"
import { formatCoins } from "@/lib/useCoins"
import { usePlayer } from "@/lib/player"
import { STRESS_COLOR } from "@/components/LifePanel"
import { StatMeter } from "@/components/ui"

export function PlayerAvatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-amber-400 font-black text-slate-950"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

// Coins, body and stress at a glance; each one opens where you manage it.
export function PlayerStats() {
  const { player } = usePlayer()
  if (!player) return null
  const stress = player.life?.stress ?? 0
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Link
        href="/home?tab=wallet"
        aria-label={`${formatCoins(player.balance)} Banange Coins`}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-amber-300/40 bg-amber-300/10 px-2.5 font-mono text-xs font-black text-amber-200"
      >
        <span aria-hidden>🪙</span>
        {formatCoins(player.balance)}
      </Link>
      <Link
        href="/home?tab=body"
        aria-label={`Energy ${Math.round(player.needs.energy)}, health ${Math.round(player.needs.health)}`}
        className="flex min-h-[44px] w-[4.5rem] flex-col justify-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 sm:w-24"
      >
        <span className="flex items-center gap-1 text-[11px] leading-none">
          <span aria-hidden>⚡</span>
          <span className="flex-1">
            <StatMeter compact label="Energy" icon="⚡" value={player.needs.energy} color="#fbbf24" />
          </span>
        </span>
        <span className="flex items-center gap-1 text-[11px] leading-none">
          <span aria-hidden>❤</span>
          <span className="flex-1">
            <StatMeter compact label="Health" icon="❤" value={player.needs.health} color="#f87171" />
          </span>
        </span>
      </Link>
      <Link
        href="/inbox"
        aria-label={`Stress ${Math.round(stress)} of 100`}
        title="Stress"
        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 font-mono text-xs font-black"
        style={{ color: STRESS_COLOR(stress) }}
      >
        <span aria-hidden>😤</span>
        {Math.round(stress)}
      </Link>
    </div>
  )
}
