"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  BIKE_MODELS,
  RENTAL_BIKE_LOOK,
  bikeFuelPerMeter,
  canBuy,
  canLease,
  findBikeModel,
  leaseTerms,
  type BikeLook,
  type BikeStats
} from "@tiral/game-core"
import { formatCoins, notifyCoinsChanged } from "@/lib/useCoins"
import { usePlayer } from "@/lib/player"
import { ActionButton, Card, SectionLabel, Skeleton, StatMeter, untilText } from "@/components/ui"

const BikePreview = dynamic(() => import("./BikePreview").then((module) => ({ default: module.BikePreview })), {
  ssr: false,
  loading: () => <Skeleton className="h-40" />
})

type BikeView = {
  id: string
  model: string
  name: string
  status: "owned" | "leasing" | "repossessed"
  active: boolean
  look: BikeLook
  wear: number
  serviceCost: number
  lease: { weekly: number; weeksPaid: number; weeksTotal: number; dueAt: string | null; missedAt: string | null } | null
}

type Garage = { bikes: BikeView[]; activeBikeId: string | null }

const STAT_LABELS: Array<{ key: keyof BikeStats; label: string; hint: string }> = [
  { key: "speed", label: "Speed", hint: "trip time" },
  { key: "economy", label: "Economy", hint: "fuel per km" },
  { key: "comfort", label: "Comfort", hint: "patience & tips" },
  { key: "durability", label: "Durability", hint: "fewer breakdowns" }
]

function Stats({ stats }: { stats: BikeStats }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {STAT_LABELS.map((stat) => (
        <div key={stat.key} title={stat.hint}>
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <span>{stat.label}</span>
            <span>{stats[stat.key]}/5</span>
          </div>
          <StatMeter compact label={stat.label} icon="" value={stats[stat.key] * 20} color="#38bdf8" />
        </div>
      ))}
    </div>
  )
}

// Home → Bike: what you ride, keeping it running, and the showroom.
export function GaragePanel() {
  const { player, refresh: refreshPlayer } = usePlayer()
  const [garage, setGarage] = useState<Garage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Two-tap confirm for spending money.
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/garage")
      if (response.ok) setGarage((await response.json()) as Garage)
    } catch {
      // keep what we have
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setNotice(null)
    setConfirm(null)
    try {
      const response = await fetch("/api/garage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, purchaseId: crypto.randomUUID() })
      })
      const json = (await response.json()) as Garage & { error?: string }
      if (!response.ok) {
        setNotice(json.error ?? "That didn't work")
        return
      }
      setGarage(json)
      notifyCoinsChanged()
      void refreshPlayer()
    } catch {
      setNotice("Couldn't reach the garage")
    } finally {
      setBusy(null)
    }
  }

  if (!garage || !player) return <Skeleton className="h-64" />
  const balance = player.balance
  const active = garage.bikes.find((bike) => bike.id === garage.activeBikeId) ?? null
  const others = garage.bikes.filter((bike) => bike.id !== active?.id)
  const look = active?.look ?? RENTAL_BIKE_LOOK
  const model = findBikeModel(look.model)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>You ride</SectionLabel>
        <Card className="flex flex-col gap-3">
          <div className="h-40 overflow-hidden rounded-xl bg-gradient-to-b from-slate-800 to-slate-900">
            <BikePreview look={look} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-base font-black text-white">{active ? active.name : "Stage rental"}</div>
              <div className="text-[11px] text-slate-400">
                {active
                  ? active.status === "leasing"
                    ? "Leasing"
                    : "Yours"
                  : `Rented per day: ${formatCoins(model.rentPerDay ?? 0)} with your first boda ride`}
              </div>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-400">
              {formatCoins(Math.round(bikeFuelPerMeter(model.stats) * 1000))}/km {model.build.electric ? "battery" : "fuel"}
            </div>
          </div>
          <Stats stats={model.stats} />
          {active && (
            <div>
              <StatMeter label="Wear" icon="🔧" value={active.wear} color={active.wear >= 60 ? "#f43f5e" : "#f59e0b"} />
              <p className="mt-1 text-[11px] text-slate-400">
                Worn bikes break down mid-ride (no fare, plus a roadside repair). A service puts wear back to 0.
              </p>
              <ActionButton
                variant={active.wear >= 40 ? "primary" : "secondary"}
                className="mt-2 w-full text-xs"
                disabled={busy !== null || active.wear < 1 || balance < active.serviceCost}
                onClick={() => void act(`service:${active.id}`, { action: "service", bikeId: active.id })}
              >
                {busy === `service:${active.id}` ? "…" : `Service · ${formatCoins(active.serviceCost)} BNG`}
              </ActionButton>
            </div>
          )}
          {active?.lease && active.status === "leasing" && (
            <div className={`rounded-xl px-3 py-2 text-xs ${active.lease.missedAt ? "bg-rose-500/15 text-rose-100" : "bg-white/5 text-slate-200"}`}>
              <div className="flex justify-between font-bold">
                <span>
                  Lease: week {active.lease.weeksPaid} of {active.lease.weeksTotal} paid
                </span>
                <span className="font-mono">{formatCoins(active.lease.weekly)}/week</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-sky-400" style={{ width: `${(active.lease.weeksPaid / active.lease.weeksTotal) * 100}%` }} />
              </div>
              <p className="mt-1 text-[11px]">
                {active.lease.missedAt
                  ? "Payment missed! Have the money ready or they take the bike back, and your payments are gone."
                  : active.lease.dueAt
                    ? `Next payment due ${untilText(active.lease.dueAt)}, taken automatically.`
                    : ""}
              </p>
            </div>
          )}
        </Card>
      </div>

      {(others.length > 0 || active) && (
        <div>
          <SectionLabel>Your bikes</SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {others.map((bike) => (
              <li key={bike.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <span>
                  <span className="font-bold text-white">{bike.name}</span>{" "}
                  <span className="text-slate-400">
                    {bike.status === "repossessed" ? "· taken back" : `· wear ${Math.round(bike.wear)}%`}
                  </span>
                </span>
                {bike.status !== "repossessed" && (
                  <ActionButton variant="ghost" className="text-xs" disabled={busy !== null} onClick={() => void act(`ride:${bike.id}`, { action: "ride", bikeId: bike.id })}>
                    Ride this
                  </ActionButton>
                )}
              </li>
            ))}
            {active && (
              <li className="flex items-center justify-between rounded-xl border border-dashed border-white/15 px-3 py-2 text-xs">
                <span className="text-slate-300">Stage rental (10,000/day)</span>
                <ActionButton variant="ghost" className="text-xs" disabled={busy !== null} onClick={() => void act("ride:rental", { action: "ride", bikeId: null })}>
                  Ride rental
                </ActionButton>
              </li>
            )}
          </ul>
        </div>
      )}

      <div>
        <SectionLabel aside={<span className="font-mono text-amber-200">🪙 {formatCoins(balance)}</span>}>Showroom</SectionLabel>
        <ul className="flex flex-col gap-2">
          {BIKE_MODELS.filter((bike) => bike.id !== "rental").map((bike) => {
            const lease = canLease(bike.id) ? leaseTerms(bike.id) : null
            const buyable = canBuy(bike.id) && bike.price !== null
            return (
              <li key={bike.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-sm font-black text-white">{bike.name}</div>
                      <div className="text-[11px] text-slate-400">{bike.basedOn}</div>
                    </div>
                    {buyable && <div className="font-mono text-sm font-black text-amber-200">{formatCoins(bike.price ?? 0)}</div>}
                  </div>
                  <Stats stats={bike.stats} />
                  <div className="flex gap-2">
                    {buyable && (
                      <ActionButton
                        variant={confirm === `buy:${bike.id}` ? "primary" : "secondary"}
                        className="flex-1 text-xs"
                        disabled={busy !== null || balance < (bike.price ?? 0)}
                        onClick={() =>
                          confirm === `buy:${bike.id}` ? void act(`buy:${bike.id}`, { action: "buy", model: bike.id }) : setConfirm(`buy:${bike.id}`)
                        }
                      >
                        {busy === `buy:${bike.id}` ? "…" : confirm === `buy:${bike.id}` ? `Confirm: pay ${formatCoins(bike.price ?? 0)}` : "Buy"}
                      </ActionButton>
                    )}
                    {lease && (
                      <ActionButton
                        variant={confirm === `lease:${bike.id}` ? "primary" : "ghost"}
                        className="flex-1 text-xs"
                        disabled={busy !== null || balance < lease.deposit}
                        onClick={() =>
                          confirm === `lease:${bike.id}` ? void act(`lease:${bike.id}`, { action: "lease", model: bike.id }) : setConfirm(`lease:${bike.id}`)
                        }
                      >
                        {busy === `lease:${bike.id}`
                          ? "…"
                          : confirm === `lease:${bike.id}`
                            ? `Confirm: ${formatCoins(lease.deposit)} now`
                            : `Lease: ${formatCoins(lease.deposit)} + ${formatCoins(lease.weekly)}/wk × ${lease.weeks}`}
                      </ActionButton>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Leasing costs more in total and a missed week (with 2 days&apos; grace) means the bike is taken back with
          nothing returned. A game week is two real days.
        </p>
        {notice && <p className="mt-2 text-xs font-bold text-rose-300">{notice}</p>}
      </div>
    </div>
  )
}
