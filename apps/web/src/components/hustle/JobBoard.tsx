"use client"

import { useEffect, useState } from "react"
import { PORTER_LOADS, findHustle, findSpot } from "@tiral/game-core"
import { formatCoins } from "@/lib/useCoins"
import type { HustleOffer, HustleState } from "@/lib/useColyseus"
import { ActionButton, SectionLabel } from "@/components/ui"

/** Re-render every `ms` (for countdowns). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export function clock(msLeft: number) {
  const seconds = Math.max(0, Math.ceil(msLeft / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export const spotName = (id: string) => findSpot(id)?.name ?? id
export const loadName = (id: string) => PORTER_LOADS.find((load) => load.id === id)?.name ?? "a load"
/** "a sack of shoes" → "A sack of shoes" (for headings). */
export const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function OfferCard({
  offer,
  now,
  energy,
  onAccept
}: {
  offer: HustleOffer
  now: number
  energy: number
  onAccept(): void
}) {
  const tooTired = energy < offer.energy
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black text-white">
            {sentence(loadName(offer.loadId))}
            {offer.heavy && (
              <span className="ml-1.5 rounded bg-rose-400/20 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-rose-200">
                heavy
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs leading-snug text-slate-300">
            {spotName(offer.pickupId)} <span className="text-slate-500">→</span> {spotName(offer.dropoffId)}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-base font-black text-amber-200">+{formatCoins(offer.pay)}</div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          {offer.meters} m · ⚡{Math.round(offer.energy)} · {clock(offer.timeLimitSeconds * 1000)} to deliver · gone in{" "}
          {clock(offer.expiresAt - now)}
        </span>
        <ActionButton variant="primary" className="shrink-0 text-xs" disabled={tooTired} onClick={onAccept}>
          {tooTired ? "Too tired" : "Take job"}
        </ActionButton>
      </div>
    </li>
  )
}

/**
 * The shift's job board: offers to take, or the job in progress. A side panel
 * on wide screens; a bottom sheet on phones that opens when you're free.
 */
export function JobBoard({
  state,
  energy,
  distanceToTarget,
  openOnPhone,
  onClosePhone,
  onAccept,
  onAbandon
}: {
  state: HustleState
  energy: number
  distanceToTarget: number | null
  openOnPhone: boolean
  onClosePhone(): void
  onAccept(offerId: string): void
  onAbandon(): void
}) {
  const now = useNow()
  const hustle = findHustle(state.hustle)
  const job = state.job

  return (
    <section
      aria-label="Jobs"
      className={`fixed inset-x-0 bottom-0 z-40 max-h-[62dvh] flex-col overflow-hidden rounded-t-3xl border border-b-0 border-white/10 bg-slate-950/95 text-white shadow-2xl backdrop-blur-md md:bottom-2 md:left-auto md:right-2 md:top-2 md:flex md:max-h-none md:w-[24rem] md:rounded-2xl md:border-b ${
        openOnPhone ? "flex" : "hidden"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-black">
            {hustle?.icon} {hustle?.name ?? "Hustle"}
          </div>
          <div className="text-[11px] text-slate-400">
            This shift: {state.shift.jobs} job{state.shift.jobs === 1 ? "" : "s"} ·{" "}
            <span className="font-mono font-bold text-amber-200">{formatCoins(state.shift.earned)} BNG</span>
            {state.shift.failed > 0 ? ` · ${state.shift.failed} failed` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClosePhone}
          aria-label="Close jobs"
          className="min-h-[40px] min-w-[40px] rounded-lg text-lg font-black text-slate-300 md:hidden"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {job ? (
          <div className={`rounded-2xl border p-3 ${job.stage === "carrying" ? "border-emerald-300/40 bg-emerald-400/10" : "border-amber-300/40 bg-amber-300/10"}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              {job.stage === "carrying" ? "Carrying" : "Go to the pickup"}
            </div>
            <div className="mt-1 text-base font-black">{sentence(loadName(job.offer.loadId))}</div>
            <div className="mt-1 text-sm text-slate-200">
              {job.stage === "carrying" ? "Deliver to " : "Collect at "}
              <span className="font-bold text-white">
                {spotName(job.stage === "carrying" ? job.offer.dropoffId : job.offer.pickupId)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/20 py-2">
                <div className="font-mono text-lg font-black">{distanceToTarget === null ? "…" : `${distanceToTarget}m`}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">away</div>
              </div>
              <div className="rounded-xl bg-black/20 py-2">
                <div className={`font-mono text-lg font-black ${job.deadline - now < 15_000 ? "text-rose-300" : ""}`}>
                  {clock(job.deadline - now)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">left</div>
              </div>
              <div className="rounded-xl bg-black/20 py-2">
                <div className="font-mono text-lg font-black text-amber-200">{formatCoins(job.offer.pay)}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">pay</div>
              </div>
            </div>
            {job.stage === "carrying" && job.offer.heavy && (
              <p className="mt-2 text-[11px] text-slate-300">Heavy load: sprinting drains energy much faster.</p>
            )}
            <ActionButton variant="danger" className="mt-3 w-full text-xs" onClick={onAbandon}>
              Drop this job
            </ActionButton>
          </div>
        ) : (
          <>
            <SectionLabel>Jobs on offer</SectionLabel>
            <ul className="flex flex-col gap-2">
              {state.offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} now={now} energy={energy} onAccept={() => onAccept(offer.id)} />
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-slate-400">
              Walk to the shop to collect the load, then carry it to the drop-off before time runs out. Dropped or late
              jobs pay nothing and stress you out. Low on energy? Eat or sleep at Home.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
