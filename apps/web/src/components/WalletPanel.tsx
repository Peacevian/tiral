"use client"

import { REASON_LABELS, formatCoins, useWallet } from "@/lib/useCoins"

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// Balance + recent ledger entries. Coins are earned in-game only.
export function WalletPanel() {
  const { balance, entries } = useWallet()

  if (balance === null) {
    return <p className="text-sm text-slate-400">Wallet unavailable right now.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">Banange Coins</div>
        <div className="mt-0.5 font-mono text-2xl font-black text-amber-100">{formatCoins(balance)} BNG</div>
        <p className="mt-1 text-xs text-slate-300">
          Earn by finishing races against other people: podiums, your first win of the day and daily streaks pay more.
        </p>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">History</div>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate text-slate-100">{REASON_LABELS[entry.reason] ?? entry.reason}</span>
                  <span className="text-[11px] text-slate-500">{timeAgo(entry.createdAt)}</span>
                </span>
                <span className={`font-mono font-black ${entry.delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
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
