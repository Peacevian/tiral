"use client"

import { useState } from "react"
import { HOUSING_TIERS, STRESSED_THRESHOLD } from "@tiral/game-core"
import { formatCoins, notifyCoinsChanged } from "@/lib/useCoins"
import type { Life, LifeEvent } from "@/lib/useLife"

function untilText(iso: string): string {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60000)
  if (minutes <= 0) return "now"
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`
  return `in ${Math.floor(hours / 24)}d ${hours % 24}h`
}

const STATUS_LABEL: Partial<Record<LifeEvent["status"], string>> = {
  paid: "Sent",
  refused: "Said no",
  expired: "Ignored"
}

// Kampala Hustle: where you live, rent, stress, and the messages that keep
// arriving from home. Money only ever comes from racing and gigs.
export function LifePanel({ life, onChange }: { life: Life | null; onChange(): void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const answer = async (event: LifeEvent, action: "pay" | "refuse") => {
    setBusy(event.id)
    setNotice(null)
    try {
      const response = await fetch(`/api/life/events/${event.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) setNotice(body.error ?? "Couldn't send")
      if (action === "pay" && response.ok) notifyCoinsChanged()
      onChange()
    } catch {
      setNotice("Network is down")
    } finally {
      setBusy(null)
    }
  }

  const move = async (tier: string) => {
    setBusy(tier)
    try {
      await fetch("/api/life/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier })
      })
      onChange()
    } finally {
      setBusy(null)
    }
  }

  if (!life) return <p className="text-sm text-slate-400">Checking on home…</p>
  const stressed = life.stress >= STRESSED_THRESHOLD
  const short = life.balance < life.tier.rent

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Home</div>
        <div className="mt-0.5 text-sm font-black text-white">{life.tier.name}</div>
        <div className="mt-1 flex items-baseline justify-between text-xs">
          <span className="text-slate-300">
            Rent <span className="font-mono font-bold text-amber-200">{formatCoins(life.tier.rent)} BNG</span>
          </span>
          <span className={short ? "font-bold text-rose-300" : "text-slate-300"}>due {untilText(life.rentDueAt)}</span>
        </div>
        {short && (
          <p className="mt-1 text-[11px] leading-snug text-rose-300">
            You're {formatCoins(life.tier.rent - life.balance)} short. Can't pay and you move somewhere cheaper.
          </p>
        )}
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs font-bold text-slate-300">
            <span>😤 Stress</span>
            <span className="font-mono">{Math.round(life.stress)}/100</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.min(100, life.stress)}%`, background: stressed ? "#f43f5e" : "#a78bfa" }}
            />
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            {stressed
              ? "You're stressed: energy refills slower. Paying rent, helping family and winning races calm you down."
              : "Missed rent, ignored family and bad luck push stress up. It eases off on its own."}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Messages</div>
        {life.events.length === 0 && <p className="text-xs text-slate-400">Quiet for now.</p>}
        <ul className="flex flex-col gap-1.5">
          {life.events.map((event) => (
            <li
              key={event.id}
              className={`rounded-xl border px-3 py-2 ${
                event.status === "pending" ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 text-[11px] font-bold">
                <span className="text-white">{event.from}</span>
                <span className="text-slate-400">
                  {event.status === "pending" && event.expiresAt
                    ? `answer ${untilText(event.expiresAt)}`
                    : STATUS_LABEL[event.status] ?? ""}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-slate-200">{event.text}</p>
              {event.status === "pending" && (
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy !== null || life.balance < event.amount}
                    onClick={() => answer(event, "pay")}
                    className="min-h-[40px] flex-1 rounded-lg bg-amber-400 px-2 text-xs font-black text-slate-950 disabled:opacity-40"
                  >
                    {busy === event.id ? "…" : `Send ${formatCoins(event.amount)}`}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => answer(event, "refuse")}
                    className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs font-bold text-slate-200 disabled:opacity-40"
                  >
                    Not now
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {notice && <p className="mt-2 text-xs font-bold text-rose-300">{notice}</p>}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Move house</div>
        <ul className="flex flex-col gap-1.5">
          {HOUSING_TIERS.map((tier) => {
            const current = tier.id === life.tier.id
            return (
              <li key={tier.id}>
                <button
                  type="button"
                  disabled={busy !== null || current}
                  onClick={() => move(tier.id)}
                  className={`flex min-h-[44px] w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition ${
                    current ? "border-amber-300/60 bg-amber-300/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="font-bold text-white">
                    {tier.name}
                    {current && <span className="ml-1 text-amber-300">· you</span>}
                  </span>
                  <span className="font-mono font-bold text-amber-200">{formatCoins(tier.rent)}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-1 text-[11px] text-slate-400">New rent applies from your next due date.</p>
      </div>
    </div>
  )
}
