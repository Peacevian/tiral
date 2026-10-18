"use client"

import { findFood } from "@tiral/game-core"
import { REASON_LABELS, formatCoins, type WalletEntry } from "@/lib/useCoins"
import { usePlayer } from "@/lib/player"
import { Card, EmptyState, SectionLabel, Skeleton, agoText } from "@/components/ui"

function entryLabel(entry: WalletEntry): string {
  if (entry.reason === "food" && typeof entry.meta?.food === "string") {
    return findFood(entry.meta.food)?.name ?? "Food"
  }
  if (entry.reason === "tier_up" && entry.meta?.tier === "town") return "Moved up to Town business"
  return REASON_LABELS[entry.reason] ?? entry.reason
}

// Balance + recent ledger entries. Coins are earned in-game only.
export function WalletPanel() {
  const { player } = usePlayer()
  if (!player) return <Skeleton className="h-40" />

  return (
    <div className="flex flex-col gap-3">
      <Card tone="amber">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sheet-blue">Banange Coins</div>
        <div className="mt-0.5 font-mono text-2xl font-black text-flame-deep">{formatCoins(player.balance)} BNG</div>
        <p className="mt-1 text-xs text-sheet-mute">
          Earn from hustles (porter loads, boda rides, the rolex stand, the car wash) and from racing other people:
          podiums, your first win of the day and daily streaks pay more. Rent, food, fuel and family cost coins.
        </p>
      </Card>
      <div>
        <SectionLabel>History</SectionLabel>
        {player.entries.length === 0 ? (
          <EmptyState>Nothing yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-1">
            {player.entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between rounded-lg bg-sheet-card px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-sheet-ink">{entryLabel(entry)}</span>
                  <span className="text-[11px] text-sheet-mute">{agoText(entry.createdAt)}</span>
                </span>
                <span className={`font-mono font-black ${entry.delta >= 0 ? "text-leaf" : "text-flame-deep"}`}>
                  {entry.delta >= 0 ? "+" : ""}
                  {formatCoins(entry.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
