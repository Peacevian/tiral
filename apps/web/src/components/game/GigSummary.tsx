"use client"

import { formatCoins } from "@/lib/useCoins"
import type { GigResult } from "@/lib/useColyseus"

const UNPAID_TEXT: Record<string, string> = {
  guest: "Sign in to get paid for deliveries.",
  daily_limit: "That's 5 deliveries today. The stage boss has no more work until tomorrow.",
  duplicate: "Already paid for this one.",
  error: "Couldn't reach the bank. Try another delivery later."
}

// End of a boda delivery: what the customer paid, what the bike owner took.
export function GigSummary({ result }: { result: GigResult | null }) {
  if (!result) return <p className="mt-3 text-sm text-slate-400">Counting the money…</p>
  if (!result.delivered) {
    return (
      <p className="mt-3 text-sm leading-snug text-rose-200">
        Too slow. The customer cancelled and you still owe the owner for the fuel. Stress up.
      </p>
    )
  }
  if (!result.paid) {
    return <p className="mt-3 text-sm leading-snug text-slate-300">{UNPAID_TEXT[result.reason ?? "error"]}</p>
  }
  return (
    <dl className="mt-3 flex flex-col gap-1 rounded-xl bg-white/5 p-3 font-mono text-sm">
      <div className="flex justify-between text-slate-300">
        <dt>Fare ({(result.meters / 1000).toFixed(1)} km)</dt>
        <dd>{formatCoins(result.gross ?? 0)}</dd>
      </div>
      <div className="flex justify-between text-rose-300">
        <dt>Bike owner's cut</dt>
        <dd>−{formatCoins(result.cut ?? 0)}</dd>
      </div>
      <div className="flex justify-between border-t border-white/10 pt-1 font-black text-amber-200">
        <dt>You keep</dt>
        <dd>{formatCoins(result.net ?? 0)} BNG</dd>
      </div>
    </dl>
  )
}
