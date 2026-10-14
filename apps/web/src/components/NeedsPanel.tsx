"use client"

import { useCallback, useEffect, useState } from "react"
import { FOODS } from "@tiral/game-core"
import { formatCoins, notifyCoinsChanged, useWallet } from "@/lib/useCoins"
import { useColyseusContext } from "@/components/ColyseusProvider"

type Needs = { energy: number; health: number; resting: boolean }

function Meter({ label, icon, value, color }: { label: string; icon: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs font-bold text-slate-300">
        <span>
          <span aria-hidden>{icon}</span> {label}
        </span>
        <span className="font-mono">{Math.round(pct)}/100</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="mt-1 h-3 overflow-hidden rounded-full bg-white/10"
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// Energy & health, street food and your bed. Energy fuels Sprint in races;
// health only drops if you sprint on empty.
export function NeedsPanel() {
  const { balance } = useWallet()
  // In a race, the race server holds the live numbers; show those.
  const race = useColyseusContext()
  const [needs, setNeeds] = useState<Needs | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/needs")
      if (response.ok) setNeeds((await response.json()) as Needs)
    } catch {
      // keep the last known value
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Regen is time-based; tick the display while the panel is open.
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  const buy = async (foodId: string) => {
    setBusy(foodId)
    setNotice(null)
    try {
      const response = await fetch("/api/needs/eat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId, purchaseId: crypto.randomUUID() })
      })
      const body = (await response.json()) as { needs?: Needs; error?: string }
      if (!response.ok || !body.needs) {
        setNotice(body.error ?? "Couldn't buy that")
        return
      }
      setNeeds(body.needs)
      notifyCoinsChanged()
      if (race.connected) race.sendRefreshNeeds()
    } catch {
      setNotice("Couldn't reach the shop")
    } finally {
      setBusy(null)
    }
  }

  const toggleRest = async () => {
    if (!needs) return
    setBusy("rest")
    try {
      const response = await fetch("/api/needs/rest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resting: !needs.resting })
      })
      if (response.ok) setNeeds((await response.json()) as Needs)
    } finally {
      setBusy(null)
    }
  }

  if (!needs) return <p className="text-sm text-slate-400">Loading your body…</p>
  const live = race.connected && race.needs ? race.needs : null
  const energy = live ? live.energy : needs.energy
  const health = live ? live.health : needs.health

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <Meter label="Energy" icon="⚡" value={energy} color="#fbbf24" />
        <Meter label="Health" icon="❤" value={health} color="#f87171" />
        {live && <p className="text-[11px] font-bold text-emerald-300">● Live from your current race</p>}
        <p className="text-[11px] leading-snug text-slate-400">
          Energy fuels Sprint and refills on its own (full in about 4 hours). Sprinting on empty burns health, and at
          zero you collapse.
        </p>
      </div>

      <button
        type="button"
        onClick={toggleRest}
        disabled={busy !== null}
        className={`min-h-[44px] rounded-xl px-3 py-2 text-sm font-black transition disabled:opacity-50 ${
          needs.resting ? "bg-indigo-400 text-slate-950" : "border border-indigo-300/50 text-indigo-200 hover:bg-indigo-400/10"
        }`}
      >
        {needs.resting ? "😴 Sleeping. Tap to wake up" : "🛏 Sleep in your bed (heals faster)"}
      </button>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Street food
          {balance !== null && (
            <span className="font-mono normal-case tracking-normal text-amber-200">🪙 {formatCoins(balance)}</span>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-1.5">
          {FOODS.map((food) => {
            const affordable = balance === null || balance >= food.price
            return (
              <li key={food.id}>
                <button
                  type="button"
                  onClick={() => buy(food.id)}
                  disabled={busy !== null || !affordable}
                  className="flex w-full flex-col items-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10 disabled:opacity-40"
                >
                  <span className="text-sm font-black text-white">{food.name}</span>
                  <span className="text-[11px] text-slate-300">
                    +{food.energy} ⚡{food.health > 0 ? ` · +${food.health} ❤` : ""}
                  </span>
                  <span className="mt-0.5 font-mono text-xs font-bold text-amber-200">
                    {busy === food.id ? "…" : `${formatCoins(food.price)} BNG`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {notice && <p className="mt-2 text-xs font-bold text-rose-300">{notice}</p>}
      </div>
    </div>
  )
}
