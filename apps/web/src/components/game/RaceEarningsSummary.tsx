"use client"

import type { RaceEarnings } from "@/lib/useColyseus"
import { REASON_LABELS, formatCoins } from "@/lib/useCoins"

// Coins line on the race-finished card: what this race paid and why.
export function RaceEarningsSummary({
  earnings,
  soloRace
}: {
  earnings: RaceEarnings | null
  soloRace: boolean
}) {
  if (!earnings) {
    if (!soloRace) return null
    return (
      <p className="mt-3 rounded-lg bg-sheet-card px-3 py-2 text-xs text-sheet-mute">
        Solo races don&apos;t pay. Race someone to earn BNG.
      </p>
    )
  }
  const total = earnings.earnings.reduce((sum, item) => sum + item.amount, 0)
  if (total === 0) {
    return (
      <p className="mt-3 rounded-lg bg-sheet-card px-3 py-2 text-xs text-sheet-mute">
        No coins this time. You&apos;ve hit today&apos;s race earnings limit.
      </p>
    )
  }
  return (
    <div className="mt-3 rounded-xl border border-flame/30 bg-flame-soft px-3 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sheet-blue">You earned</span>
        <span className="font-mono text-lg font-black text-flame-deep">+{formatCoins(total)} BNG</span>
      </div>
      <ul className="mt-1 flex flex-col gap-0.5 text-xs text-sheet-mute">
        {earnings.earnings.map((item) => (
          <li key={item.reason} className="flex justify-between">
            <span>{REASON_LABELS[item.reason] ?? item.reason}</span>
            <span className="font-mono">+{formatCoins(item.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
