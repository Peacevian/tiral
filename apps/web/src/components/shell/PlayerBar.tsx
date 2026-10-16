"use client"

import Link from "next/link"
import { formatCoins } from "@/lib/useCoins"
import { usePlayer } from "@/lib/player"
import { STRESSED_THRESHOLD } from "@tiral/game-core"
import { StatMeter } from "@/components/ui"

export function PlayerAvatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-flame font-black text-white"
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
        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-sheet-line bg-sheet-card px-2.5 font-mono text-xs font-black text-sheet-ink"
      >
        <span aria-hidden>🪙</span>
        {formatCoins(player.balance)}
      </Link>
      <Link
        href="/home?tab=body"
        aria-label={`Energy ${Math.round(player.needs.energy)}, health ${Math.round(player.needs.health)}`}
        className="flex min-h-[44px] w-[4.5rem] flex-col justify-center gap-1 rounded-xl border border-sheet-line bg-sheet-card px-2 sm:w-24"
      >
        <span className="flex items-center gap-1 text-[11px] leading-none">
          <span aria-hidden>⚡</span>
          <span className="flex-1">
            <StatMeter compact track="bg-sheet-line" label="Energy" icon="⚡" value={player.needs.energy} color="#D99A2B" />
          </span>
        </span>
        <span className="flex items-center gap-1 text-[11px] leading-none">
          <span aria-hidden>❤</span>
          <span className="flex-1">
            <StatMeter compact track="bg-sheet-line" label="Health" icon="❤" value={player.needs.health} color="#E5484D" />
          </span>
        </span>
      </Link>
      <Link
        href="/inbox"
        aria-label={`Stress ${Math.round(stress)} of 100`}
        title="Stress"
        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-sheet-line bg-sheet-card px-2 font-mono text-xs font-black"
        // Darker than the usual stress colours: these sit on the light bar.
        style={{ color: stress >= STRESSED_THRESHOLD ? "#C2410C" : "#5B6F88" }}
      >
        <span aria-hidden>😤</span>
        {Math.round(stress)}
      </Link>
    </div>
  )
}
