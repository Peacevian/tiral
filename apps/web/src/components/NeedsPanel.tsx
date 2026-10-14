"use client"

import { useState } from "react"
import { FOODS } from "@tiral/game-core"
import { formatCoins } from "@/lib/useCoins"
import { usePlayer } from "@/lib/player"
import { useColyseusContext } from "@/components/ColyseusProvider"
import { ActionButton, Card, SectionLabel, Skeleton, StatMeter } from "@/components/ui"

// Energy & health, street food and your bed. Energy fuels Sprint in races;
// health only drops if you sprint on empty.
export function NeedsPanel() {
  const { player, busy, eat, setResting } = usePlayer()
  // In a race, the race server holds the live numbers; show those.
  const race = useColyseusContext()
  const [notice, setNotice] = useState<string | null>(null)

  if (!player) return <Skeleton className="h-40" />
  const live = race.connected && race.needs ? race.needs : null
  const energy = live ? live.energy : player.needs.energy
  const health = live ? live.health : player.needs.health

  const buy = async (foodId: string) => {
    setNotice(null)
    const failure = await eat(foodId)
    if (failure) setNotice(failure)
    else if (race.connected) race.sendRefreshNeeds()
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2">
        <StatMeter label="Energy" icon="⚡" value={energy} color="#fbbf24" />
        <StatMeter label="Health" icon="❤" value={health} color="#f87171" />
        {live && <p className="text-[11px] font-bold text-emerald-300">● Live from your current race</p>}
        <p className="text-[11px] leading-snug text-slate-400">
          Energy fuels Sprint and refills on its own (full in about 4 hours). Sprinting on empty burns health, and at
          zero you collapse.
        </p>
      </Card>

      <ActionButton
        onClick={() => void setResting(!player.needs.resting)}
        disabled={busy !== null}
        className={player.needs.resting ? "!bg-indigo-400 !text-slate-950" : "border border-indigo-300/50 !bg-transparent text-indigo-200"}
      >
        {player.needs.resting ? "😴 Sleeping. Tap to wake up" : "🛏 Sleep in your bed (heals faster)"}
      </ActionButton>

      <div>
        <SectionLabel aside={<span className="font-mono text-amber-200">🪙 {formatCoins(player.balance)}</span>}>
          Street food
        </SectionLabel>
        <FoodGrid onBuy={buy} />
        {notice && <p className="mt-2 text-xs font-bold text-rose-300">{notice}</p>}
      </div>
    </div>
  )
}

/** Street food buttons; `limit` shows only the cheapest few (hub quick-food). */
export function FoodGrid({ onBuy, limit }: { onBuy(foodId: string): void; limit?: number }) {
  const { player, busy } = usePlayer()
  const foods = limit ? FOODS.slice(0, limit) : FOODS
  return (
    <ul className={`grid gap-1.5 ${limit === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {foods.map((food) => {
        const affordable = (player?.balance ?? 0) >= food.price
        return (
          <li key={food.id}>
            <button
              type="button"
              onClick={() => onBuy(food.id)}
              disabled={busy !== null || !affordable}
              className="flex min-h-[44px] w-full flex-col items-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10 disabled:opacity-40"
            >
              <span className="text-sm font-black text-white">{food.name}</span>
              <span className="text-[11px] text-slate-300">
                +{food.energy} ⚡{food.health > 0 ? ` · +${food.health} ❤` : ""}
              </span>
              <span className="mt-0.5 font-mono text-xs font-bold text-amber-200">
                {busy === `food:${food.id}` ? "…" : `${formatCoins(food.price)} BNG`}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
