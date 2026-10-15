"use client"

import { useCallback, useEffect, useState } from "react"
import {
  BIKE_MODELS,
  RENTAL_BIKE_LOOK,
  bikeFuelPerMeter,
  canBuy,
  canLease,
  findBikeModel,
  leaseTerms,
  lookCost,
  lookItemIds,
  type BikeLook,
  type BikeStats
} from "@tiral/game-core"
import { formatCoins, notifyCoinsChanged } from "@/lib/useCoins"
import { usePlayer } from "@/lib/player"
import { ActionButton, SectionLabel, Skeleton, StatMeter, untilText } from "@/components/ui"
import { BikeCustomizer } from "./BikeCustomizer"

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

type Garage = { bikes: BikeView[]; activeBikeId: string | null; items: string[] }

/** What's selected in the garage: one of your bikes, the rental, or a showroom model. */
export type GarageSelection = { kind: "bike"; id: string } | { kind: "rental" } | { kind: "model"; model: string }

const STAT_LABELS: Array<{ key: keyof BikeStats; label: string }> = [
  { key: "speed", label: "Speed" },
  { key: "economy", label: "Economy" },
  { key: "comfort", label: "Comfort" },
  { key: "durability", label: "Durability" }
]

function Stats({ stats }: { stats: BikeStats }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {STAT_LABELS.map((stat) => (
        <div key={stat.key}>
          <div className="flex justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <span>{stat.label}</span>
            <span>{stats[stat.key]}/5</span>
          </div>
          <StatMeter compact label={stat.label} icon="" value={stats[stat.key] * 20} color="#38bdf8" />
        </div>
      ))}
    </div>
  )
}

function Row({
  selected,
  onClick,
  title,
  detail,
  right,
  tag
}: {
  selected: boolean
  onClick(): void
  title: string
  detail: string
  right?: string
  tag?: string
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`flex min-h-[52px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${
          selected ? "border-amber-300/70 bg-amber-300/10" : "border-white/10 bg-white/5 hover:bg-white/10"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-white">
            {title}
            {tag && <span className="ml-1.5 rounded bg-emerald-400/20 px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase text-emerald-200">{tag}</span>}
          </span>
          <span className="block truncate text-[11px] text-slate-400">{detail}</span>
        </span>
        {right && <span className="shrink-0 font-mono text-xs font-black text-amber-200">{right}</span>}
      </button>
    </li>
  )
}

/** The look of whatever is selected (for the big showroom scene). */
export function selectionLook(selection: GarageSelection, bikes: BikeView[]): BikeLook {
  if (selection.kind === "bike") return bikes.find((bike) => bike.id === selection.id)?.look ?? RENTAL_BIKE_LOOK
  if (selection.kind === "model") return { ...RENTAL_BIKE_LOOK, model: selection.model as BikeLook["model"], rack: false, slogan: null }
  return RENTAL_BIKE_LOOK
}

// Home → Bike: a compact list (your bikes, the rental, the showroom). The
// selected bike shows big in the main scene; its details and actions sit in a
// footer that never scrolls away.
export function GaragePanel({ onShow }: { onShow(look: BikeLook): void }) {
  const { player, refresh: refreshPlayer } = usePlayer()
  const [garage, setGarage] = useState<Garage | null>(null)
  const [selection, setSelection] = useState<GarageSelection | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Two-tap confirm for spending money.
  const [confirm, setConfirm] = useState<string | null>(null)
  // Customising one of your bikes: the draft look (shown live, bought on apply).
  const [customizing, setCustomizing] = useState<{ bikeId: string; draft: BikeLook } | null>(null)

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

  // Start on what you ride.
  useEffect(() => {
    if (garage && !selection) setSelection(garage.activeBikeId ? { kind: "bike", id: garage.activeBikeId } : { kind: "rental" })
  }, [garage, selection])

  // Keep the big scene on the selected bike (or the look being designed).
  useEffect(() => {
    if (customizing) onShow(customizing.draft)
    else if (garage && selection) onShow(selectionLook(selection, garage.bikes))
  }, [garage, selection, customizing, onShow])

  const select = (next: GarageSelection) => {
    setSelection(next)
    setConfirm(null)
    setNotice(null)
  }

  const act = async (key: string, body: Record<string, unknown>, then?: (garage: Garage) => GarageSelection | null) => {
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
      const next = then?.(json)
      if (next) setSelection(next)
      notifyCoinsChanged()
      void refreshPlayer()
    } catch {
      setNotice("Couldn't reach the garage")
    } finally {
      setBusy(null)
    }
  }

  if (!garage || !player || !selection) return <Skeleton className="h-64" />
  const balance = player.balance
  const owned = garage.bikes
  const ridingId = garage.activeBikeId
  const selectedBike = selection.kind === "bike" ? owned.find((bike) => bike.id === selection.id) ?? null : null
  const model = findBikeModel(selection.kind === "model" ? selection.model : selectedBike?.model ?? "rental")
  const riding = selection.kind === "rental" ? ridingId === null : selectedBike?.id === ridingId
  const newestOf = (json: Garage) => json.bikes.find((bike) => bike.active) ?? null

  if (customizing) {
    const bike = owned.find((candidate) => candidate.id === customizing.bikeId)
    // Parts already on this bike count as yours.
    const ownedItems = new Set([...garage.items, ...(bike ? lookItemIds(bike.look) : [])])
    const cost = lookCost(customizing.draft, ownedItems)
    return (
      <div className="flex min-h-full flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-black text-white">Customising your {bike?.name}</span>
          <span className="font-mono text-[11px] text-amber-200">🪙 {formatCoins(balance)}</span>
        </div>
        <BikeCustomizer
          look={customizing.draft}
          owned={ownedItems}
          onChange={(draft) => {
            setCustomizing({ ...customizing, draft })
            setConfirm(null)
          }}
        />
        <div className="sticky bottom-[-0.75rem] -mx-3 -mb-3 mt-auto border-t border-white/10 bg-slate-950 px-3 pb-3 pt-3 md:bottom-[-1rem] md:-mb-4 md:pb-4">
          <div className="mb-2 flex items-baseline justify-between text-xs">
            <span className="text-slate-300">
              {cost.items.length === 0 ? "Nothing new to buy" : `${cost.items.length} new part${cost.items.length === 1 ? "" : "s"}`}
            </span>
            <span className={`font-mono font-black ${balance < cost.total ? "text-rose-300" : "text-amber-200"}`}>
              {formatCoins(cost.total)} BNG
            </span>
          </div>
          <div className="flex gap-2">
            <ActionButton variant="ghost" className="flex-1 text-xs" disabled={busy !== null} onClick={() => setCustomizing(null)}>
              Cancel
            </ActionButton>
            <ActionButton
              variant={confirm === "apply" || cost.total === 0 ? "primary" : "secondary"}
              className="flex-[2] text-xs"
              disabled={busy !== null || balance < cost.total}
              onClick={() => {
                if (cost.total > 0 && confirm !== "apply") return setConfirm("apply")
                void act("apply", { action: "customize", bikeId: customizing.bikeId, look: customizing.draft }, () => {
                  setCustomizing(null)
                  return { kind: "bike", id: customizing.bikeId }
                })
              }}
            >
              {busy === "apply"
                ? "…"
                : cost.total === 0
                  ? "Apply look"
                  : confirm === "apply"
                    ? `Confirm: pay ${formatCoins(cost.total)}`
                    : `Apply · ${formatCoins(cost.total)}`}
            </ActionButton>
          </div>
          {notice && <p className="mt-2 text-xs font-bold text-rose-300">{notice}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div>
        <SectionLabel>Your bikes</SectionLabel>
        <ul className="flex flex-col gap-1.5">
          {owned.map((bike) => (
            <Row
              key={bike.id}
              selected={selection.kind === "bike" && selection.id === bike.id}
              onClick={() => select({ kind: "bike", id: bike.id })}
              title={bike.name}
              detail={
                bike.status === "repossessed"
                  ? "Taken back"
                  : `${bike.status === "leasing" ? "Leasing" : "Yours"} · wear ${Math.round(bike.wear)}%`
              }
              tag={bike.id === ridingId ? "riding" : undefined}
            />
          ))}
          <Row
            selected={selection.kind === "rental"}
            onClick={() => select({ kind: "rental" })}
            title="Stage rental"
            detail="10,000 per day, paid with your first ride"
            tag={ridingId === null ? "riding" : undefined}
          />
        </ul>
      </div>

      <div>
        <SectionLabel aside={<span className="font-mono text-amber-200">🪙 {formatCoins(balance)}</span>}>Showroom</SectionLabel>
        <ul className="flex flex-col gap-1.5">
          {BIKE_MODELS.filter((bike) => bike.id !== "rental").map((bike) => (
            <Row
              key={bike.id}
              selected={selection.kind === "model" && selection.model === bike.id}
              onClick={() => select({ kind: "model", model: bike.id })}
              title={bike.name}
              detail={bike.basedOn}
              right={bike.price !== null && canBuy(bike.id) ? formatCoins(bike.price) : "lease"}
            />
          ))}
        </ul>
      </div>

      {/* Details and actions for the selected bike: always in view. */}
      <div className="sticky bottom-[-0.75rem] -mx-3 -mb-3 mt-auto border-t border-white/10 bg-slate-950 px-3 pb-3 pt-3 md:bottom-[-1rem] md:-mb-4 md:pb-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-base font-black text-white">{selectedBike?.name ?? model.name}</span>
          <span className="font-mono text-[11px] text-slate-400">
            {formatCoins(Math.round(bikeFuelPerMeter(model.stats) * 1000))}/km {model.build.electric ? "battery" : "fuel"}
          </span>
        </div>
        <Stats stats={model.stats} />

        {selectedBike && selectedBike.status !== "repossessed" && (
          <div className="mt-3">
            <StatMeter label="Wear" icon="🔧" value={selectedBike.wear} color={selectedBike.wear >= 60 ? "#f43f5e" : "#f59e0b"} />
            {selectedBike.lease && selectedBike.status === "leasing" && (
              <p className={`mt-1 text-[11px] ${selectedBike.lease.missedAt ? "font-bold text-rose-300" : "text-slate-400"}`}>
                Lease week {selectedBike.lease.weeksPaid}/{selectedBike.lease.weeksTotal} ·{" "}
                {selectedBike.lease.missedAt
                  ? "payment missed! Have the money ready or they take it back."
                  : selectedBike.lease.dueAt
                    ? `${formatCoins(selectedBike.lease.weekly)} due ${untilText(selectedBike.lease.dueAt)}`
                    : ""}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          {selection.kind === "model" ? (
            <>
              {canBuy(model.id) && model.price !== null && (
                <ActionButton
                  variant={confirm === "buy" ? "primary" : "secondary"}
                  className="flex-1 text-xs"
                  disabled={busy !== null || balance < model.price}
                  onClick={() =>
                    confirm === "buy"
                      ? void act("buy", { action: "buy", model: model.id }, (json) => {
                          const bike = newestOf(json)
                          return bike ? { kind: "bike", id: bike.id } : null
                        })
                      : setConfirm("buy")
                  }
                >
                  {busy === "buy" ? "…" : confirm === "buy" ? `Confirm: pay ${formatCoins(model.price)}` : `Buy · ${formatCoins(model.price)}`}
                </ActionButton>
              )}
              {canLease(model.id) &&
                (() => {
                  const lease = leaseTerms(model.id)!
                  return (
                    <ActionButton
                      variant={confirm === "lease" ? "primary" : "ghost"}
                      className="flex-1 text-xs"
                      disabled={busy !== null || balance < lease.deposit}
                      onClick={() =>
                        confirm === "lease"
                          ? void act("lease", { action: "lease", model: model.id }, (json) => {
                              const bike = newestOf(json)
                              return bike ? { kind: "bike", id: bike.id } : null
                            })
                          : setConfirm("lease")
                      }
                    >
                      {busy === "lease"
                        ? "…"
                        : confirm === "lease"
                          ? `Confirm: ${formatCoins(lease.deposit)} now`
                          : `Lease · ${formatCoins(lease.deposit)} + ${formatCoins(lease.weekly)}/wk × ${lease.weeks}`}
                    </ActionButton>
                  )
                })()}
            </>
          ) : selectedBike?.status === "repossessed" ? (
            <p className="text-[11px] text-slate-400">The lessor took this one back.</p>
          ) : (
            <>
              <ActionButton
                variant="secondary"
                className="flex-1 text-xs"
                disabled={busy !== null || riding}
                onClick={() => void act("ride", { action: "ride", bikeId: selection.kind === "bike" ? selection.id : null })}
              >
                {riding ? "You ride this" : busy === "ride" ? "…" : "Ride this"}
              </ActionButton>
              {selectedBike && (
                <ActionButton
                  variant="ghost"
                  className="flex-1 text-xs"
                  disabled={busy !== null}
                  onClick={() => setCustomizing({ bikeId: selectedBike.id, draft: selectedBike.look })}
                >
                  🎨 Customise
                </ActionButton>
              )}
              {selectedBike && (
                <ActionButton
                  variant={selectedBike.wear >= 40 ? "primary" : "ghost"}
                  className="flex-1 text-xs"
                  disabled={busy !== null || selectedBike.wear < 1 || balance < selectedBike.serviceCost}
                  onClick={() => void act("service", { action: "service", bikeId: selectedBike.id })}
                >
                  {busy === "service" ? "…" : `Service · ${formatCoins(selectedBike.serviceCost)}`}
                </ActionButton>
              )}
            </>
          )}
        </div>
        {selection.kind === "model" && !canBuy(model.id) && (
          <p className="mt-2 text-[11px] text-slate-400">Lease only, like real e-boda schemes.</p>
        )}
        {selection.kind === "model" && canLease(model.id) && (
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Leasing costs more overall; miss a week (2 days&apos; grace) and the bike is taken back with nothing returned.
          </p>
        )}
        {notice && <p className="mt-2 text-xs font-bold text-rose-300">{notice}</p>}
      </div>
    </div>
  )
}
