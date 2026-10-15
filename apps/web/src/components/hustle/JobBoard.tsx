"use client"

import { useEffect, useState } from "react"
import { PORTER_LOADS, bodaGiveUpSeconds, findHustle, findPlace } from "@tiral/game-core"
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

export const spotName = (id: string) => findPlace(id)?.name ?? id
export const loadName = (id: string) => PORTER_LOADS.find((load) => load.id === id)?.name ?? "a load"
/** "a sack of shoes" → "A sack of shoes" (for headings). */
export const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** What the job is, in a few words. */
export function offerTitle(offer: HustleOffer) {
  return offer.kind === "boda" ? sentence(offer.passenger) : sentence(loadName(offer.loadId))
}

/** What it pays before costs. */
export function offerPay(offer: HustleOffer) {
  return offer.kind === "boda" ? offer.fare : offer.pay
}

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
            {offerTitle(offer)}
            {offer.kind === "porter" && offer.heavy && (
              <span className="ml-1.5 rounded bg-rose-400/20 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-rose-200">
                heavy
              </span>
            )}
            {offer.kind === "boda" && offer.rush && (
              <span className="ml-1.5 rounded bg-amber-400/20 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-amber-200">
                rush ×1.5
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs leading-snug text-slate-300">
            {spotName(offer.pickupId)} <span className="text-slate-500">→</span> {spotName(offer.dropoffId)}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-base font-black text-amber-200">+{formatCoins(offerPay(offer))}</div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          {offer.meters >= 1000 ? `${(offer.meters / 1000).toFixed(1)} km` : `${offer.meters} m`} · ⚡{Math.round(offer.energy)}
          {offer.kind === "porter" ? ` · ${clock(offer.timeLimitSeconds * 1000)} to deliver` : " · fuel extra"} · gone in{" "}
          {clock(offer.expiresAt - now)}
        </span>
        <ActionButton variant="primary" className="shrink-0 text-xs" disabled={tooTired} onClick={onAccept}>
          {tooTired ? "Too tired" : offer.kind === "boda" ? "Take ride" : "Take job"}
        </ActionButton>
      </div>
    </li>
  )
}

function JobCard({
  job,
  now,
  distanceToTarget,
  patienceFactor,
  onAbandon
}: {
  job: NonNullable<HustleState["job"]>
  now: number
  distanceToTarget: number | null
  patienceFactor: number
  onAbandon(): void
}) {
  const { offer, stage } = job
  const carrying = stage === "carrying"
  const boda = offer.kind === "boda"
  const fullFareLeft = job.fullFareDeadline === null ? null : job.fullFareDeadline - now
  // Share of the passenger's patience left (they give up at the deadline).
  const patience =
    boda && carrying
      ? Math.max(0, Math.min(1, (job.deadline - now) / (bodaGiveUpSeconds(offer.meters, patienceFactor) * 1000)))
      : null
  return (
    <div className={`rounded-2xl border p-3 ${carrying ? "border-emerald-300/40 bg-emerald-400/10" : "border-amber-300/40 bg-amber-300/10"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
        {carrying ? (boda ? "Riding" : "Carrying") : boda ? "Go to the stage" : "Go to the pickup"}
      </div>
      <div className="mt-1 text-base font-black">{offerTitle(offer)}</div>
      <div className="mt-1 text-sm text-slate-200">
        {carrying ? (boda ? "Drop them at " : "Deliver to ") : boda ? "Pick up at " : "Collect at "}
        <span className="font-bold text-white">{spotName(carrying ? offer.dropoffId : offer.pickupId)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-black/20 py-2">
          <div className="font-mono text-lg font-black">{distanceToTarget === null ? "…" : `${distanceToTarget}m`}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">away</div>
        </div>
        <div className="rounded-xl bg-black/20 py-2">
          <div className={`font-mono text-lg font-black ${job.deadline - now < 15_000 ? "text-rose-300" : ""}`}>{clock(job.deadline - now)}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{boda && carrying ? "patience" : "left"}</div>
        </div>
        <div className="rounded-xl bg-black/20 py-2">
          <div className="font-mono text-lg font-black text-amber-200">{formatCoins(offerPay(offer))}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{boda ? "fare" : "pay"}</div>
        </div>
      </div>
      {patience !== null && (
        <div className="mt-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${patience * 100}%`, background: fullFareLeft !== null && fullFareLeft > 0 ? "#34d399" : "#f59e0b" }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-300">
            {fullFareLeft !== null && fullFareLeft > 0
              ? `Full fare for ${clock(fullFareLeft)} more. Quick rides get tipped.`
              : "Running late: half fare now. Don't let them give up."}
          </p>
        </div>
      )}
      {carrying && offer.kind === "porter" && offer.heavy && (
        <p className="mt-2 text-[11px] text-slate-300">Heavy load: sprinting drains energy much faster.</p>
      )}
      <ActionButton variant="danger" className="mt-3 w-full text-xs" onClick={onAbandon}>
        {boda && carrying ? "Drop the passenger" : "Drop this job"}
      </ActionButton>
    </div>
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
  const boda = state.boda

  return (
    <section
      aria-label="Jobs"
      className={`fixed inset-x-0 bottom-0 z-40 max-h-[62dvh] flex-col overflow-hidden rounded-t-3xl border border-b-0 border-white/10 bg-slate-950/95 text-white shadow-2xl md:backdrop-blur-md md:bottom-2 md:left-auto md:right-2 md:top-2 md:flex md:max-h-none md:w-[24rem] md:rounded-2xl md:border-b ${
        openOnPhone ? "flex" : "hidden"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-black">
            {hustle?.icon} {hustle?.name ?? "Hustle"}
            {boda?.rush && <span className="ml-1.5 text-[11px] font-bold text-amber-300">· rush hour</span>}
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
        {boda && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px]">
            <span className="text-slate-300">
              {boda.bike.own
                ? `🛵 Your ${boda.bike.name} · wear ${boda.bike.wear}%`
                : boda.bikeReady
                  ? "🛵 Stage bike, rented for today"
                  : `🛵 Stage bike: ${formatCoins(boda.rent)} rent with your first ride`}
            </span>
            <span className="font-mono text-slate-400">
              {boda.bike.look.model === "zemboE" ? "battery" : "fuel"} {formatCoins(boda.fuel)}
            </span>
          </div>
        )}
        {job ? (
          <JobCard job={job} now={now} distanceToTarget={distanceToTarget} patienceFactor={boda?.bike.patience ?? 1} onAbandon={onAbandon} />
        ) : (
          <>
            <SectionLabel>{boda ? "Passengers waiting" : "Jobs on offer"}</SectionLabel>
            <ul className="flex flex-col gap-2">
              {state.offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} now={now} energy={energy} onAccept={() => onAccept(offer.id)} />
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-slate-400">
              {boda
                ? "Ride to the stage, pick your passenger up, and drop them before they lose patience. Quick rides get tipped; fuel comes off each fare."
                : "Walk to the shop to collect the load, then carry it to the drop-off before time runs out. Dropped or late jobs pay nothing and stress you out. Low on energy? Eat or sleep at Home."}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
