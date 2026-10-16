"use client"

import { useEffect, useState } from "react"
import { PRIZE_CUT_SHARE } from "@tiral/game-core"
import type { PrizeResult, PrizeSummary } from "@/lib/useColyseus"
import { formatCoins } from "@/lib/useCoins"
import { startLabel, untilLabel } from "@/lib/prizeRaces"

const PLACE = ["1st", "2nd", "3rd", "4th", "5th"]

/** In a prize race's lobby: the pot, the split, the host and when it starts. */
export function PrizeBanner({ prize, counting }: { prize: PrizeSummary; counting: boolean }) {
  // Re-render each minute so "in 12 min" stays right.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])
  const payable = Math.floor(prize.pot * (1 - PRIZE_CUT_SHARE))
  return (
    <div className="mx-2.5 mt-1 rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-center">
      <div className="text-sm font-black text-amber-100">
        🏆 {formatCoins(prize.pot)} BNG prize · hosted by {prize.host}
      </div>
      <div className="text-[11px] text-amber-100/90">
        {prize.shares.map((share, index) => `${PLACE[index]} ${formatCoins(Math.floor((payable * share) / 100))}`).join(" · ")}
      </div>
      {prize.message && <div className="truncate text-[11px] italic text-slate-200">“{prize.message}”</div>}
      {!counting && (
        <div className="mt-0.5 text-[11px] font-bold text-white">
          Starts {startLabel(prize.startsAt)} · {untilLabel(prize.startsAt)}
        </div>
      )}
    </div>
  )
}

/** On the results card: who won the prize, or why it went back to the host. */
export function PrizeResultLines({ result, sessionId }: { result: PrizeResult; sessionId: string | null }) {
  if (result.kind === "refunded") {
    const why =
      result.why === "few_racers"
        ? "fewer than 2 other people raced"
        : result.why === "no_finishers"
          ? "nobody reached the treasure"
          : "the race didn't count"
    return (
      <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
        🏆 No prize this time: {why}. {result.host}&apos;s pot went back to them.
      </p>
    )
  }
  const mine = result.payouts.find((payout) => payout.sessionId === sessionId)
  return (
    <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
      {mine && (
        <div className="mb-1 text-sm font-black text-amber-200">
          🏆 You won {formatCoins(mine.amount)} BNG from {result.host}&apos;s prize!
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {result.payouts.map((payout) => (
          <li key={payout.place} className={payout.sessionId === sessionId ? "font-bold" : ""}>
            {PLACE[payout.place - 1]} {payout.name}: {formatCoins(payout.amount)} BNG
          </li>
        ))}
      </ul>
    </div>
  )
}
