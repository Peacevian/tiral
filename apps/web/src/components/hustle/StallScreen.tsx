"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  CAR_TYPES,
  ROLEX_FLIP_WINDOW,
  ROLEX_PACKS,
  ROLEX_SPOTS,
  findCarType,
  findHustle,
  findRolexSpot
} from "@tiral/game-core"
import { useColyseusContext, useColyseusStatus } from "@/components/ColyseusProvider"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import type { StallState } from "@/lib/useColyseus"
import { ActionButton, Card, SectionLabel } from "@/components/ui"
import { AdaptivePanel } from "@/components/ui/AdaptivePanel"
import { useMyLoadout } from "@/lib/useMyLoadout"
import type { AvatarLoadout } from "@tiral/avatars"
import { WASH_RINSE_DIRT, type WashTool } from "@tiral/game-core"
import { carLayout } from "@/components/carwash/carLayout"
import type { RolexFlip, RolexPrep, RolexStep, RolexTarget } from "@/components/rolex/RolexStall3D"

const CarWashBay = dynamic(() => import("@/components/carwash/CarWashBay").then((module) => ({ default: module.CarWashBay })), {
  ssr: false
})

/** Re-render on a fast clock (timers and the frying egg). */
function useTicker(ms: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const COOK_TOTAL = ROLEX_FLIP_WINDOW.end + 1.5

const FLIP_TEXT = {
  perfect: { text: "Perfect! +500 tip", tone: "text-emerald-300" },
  good: { text: "Good rolex", tone: "text-emerald-200" },
  raw: { text: "Too early: raw, half price", tone: "text-amber-300" },
  burnt: { text: "Burnt! Ingredients wasted", tone: "text-rose-300" }
} as const

const OUTCOME_TEXT: Record<string, string> = {
  closed: "You closed up.",
  left: "Shift over.",
  sold_out: "Sold out!",
  escaped: "You ran before KCCA got you. Unsold stock went to waste.",
  raided: "KCCA took your stall."
}

/** Leave any finished shift, then go back to the hub. */
function BackToBase() {
  const router = useRouter()
  const { connected, leaveRoom } = useColyseusStatus()
  return (
    <button
      type="button"
      onClick={() => {
        if (connected) leaveRoom()
        router.push("/play")
      }}
      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-white/15 text-sm font-bold text-slate-200"
    >
      Back to base
    </button>
  )
}

const CAR_ICONS: Record<string, string> = { saloon: "🚗", suv: "🚙", taxi: "🚐" }

const NO_CUSTOMERS: never[] = []
const NO_ZONES: never[] = []
const noop = () => {}

/**
 * The 3D scene behind the start card. Memoised: the screen re-renders on a
 * fast clock, and a canvas re-rendered with fresh props that often never
 * finishes setting up its renderer.
 */
const StartBackdrop = memo(function StartBackdrop({ gig, loadout }: { gig: "rolex" | "carwash"; loadout: AvatarLoadout }) {
  return gig === "carwash" ? (
    <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_70%_60%,#334155,#0f172a_70%)]">
      <CarWashBay showcase carId="showcase" carType="saloon" zones={NO_CUSTOMERS} tool="soap" loadout={loadout} onWash={noop} />
    </div>
  ) : (
    <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_bottom,#7dd3fc,#bae6fd_45%,#8a5a3c_55%,#6b4430)]">
      <RolexStall3D showcase customers={NO_CUSTOMERS} received={0} prep={EMPTY_PREP} next={null} cooking={null} flip={null} loadout={loadout} onPick={noop} onTap={noop} />
    </div>
  )
})

/** Before a shift: the bay (or stall) behind, and a card to start from. */
function StartCard({ gig, onStart, busy, error }: { gig: "rolex" | "carwash"; onStart(spot: string, pack: string): void; busy: boolean; error: string | null }) {
  const { player } = usePlayer()
  const loadout = useMyLoadout()
  const info = findHustle(gig)!
  const [spot, setSpot] = useState<string>(ROLEX_SPOTS[0].id)
  const [pack, setPack] = useState<string>(ROLEX_PACKS[1].id)
  const packPrice = ROLEX_PACKS.find((candidate) => candidate.id === pack)?.price ?? 0
  const energy = player ? Math.round(player.needs.energy) : 0
  return (
    <div className="fixed inset-0 z-10">
      <StartBackdrop gig={gig} loadout={loadout} />
      {/* The same panel as every other screen: docked on the right on wide
          screens, a bottom sheet on phones. */}
      <AdaptivePanel label={info.name} initial="half" peekHeight={260}>
        <div className="flex flex-col pb-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
            Hustle{gig === "carwash" ? " · Nakivubo washing bay" : ""}
          </div>
          <h1 className="mt-1 text-2xl font-black text-white">
            {info.icon} {info.name}
          </h1>
          {gig === "rolex" ? (
            <>
              <p className="mt-1 text-sm leading-snug text-slate-300">
                Buy ingredients, then cook rolexes to order: flip the egg at the right moment. Unsold stock spoils, and KCCA
                raids stalls. 2 shifts a day.
              </p>
              <div className="mt-4">
                <SectionLabel>Where</SectionLabel>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {ROLEX_SPOTS.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSpot(candidate.id)}
                    aria-pressed={spot === candidate.id}
                    className={`min-w-0 rounded-xl border p-2 text-left text-xs ${spot === candidate.id ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-white/5"}`}
                  >
                    <span className="block font-black text-white">{candidate.name}</span>
                    <span className="block text-[10px] text-slate-400">
                      {candidate.customersPerMinute >= 5 ? "busiest" : candidate.customersPerMinute >= 4 ? "busy" : "quieter"} · KCCA{" "}
                      {Math.round(candidate.raidChance * 100)}%
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <SectionLabel>Stock</SectionLabel>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {ROLEX_PACKS.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setPack(candidate.id)}
                    aria-pressed={pack === candidate.id}
                    className={`rounded-xl border p-2 text-left text-xs ${pack === candidate.id ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-white/5"}`}
                  >
                    <span className="block font-black text-white">{candidate.rolexes} rolexes</span>
                    <span className="block font-mono text-amber-200">{formatCoins(candidate.price)} BNG</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Each rolex sells for 2,000 (+500 tip if perfect).</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm leading-snug text-slate-300">
                Drivers pull in covered in Kampala mud. Wash every panel before they lose patience.
              </p>
              <ol className="mt-4 grid grid-cols-3 gap-1.5">
                {TOOLS.map((entry, index) => (
                  <li key={entry.id} className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/5 px-1 py-2 text-center">
                    <span aria-hidden className="text-xl">
                      {entry.icon}
                    </span>
                    <span className="text-xs font-black text-white">
                      {index + 1}. {entry.label}
                    </span>
                    <span className="text-[10px] leading-tight text-slate-400">{entry.hint}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4">
                <SectionLabel>Cars</SectionLabel>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CAR_TYPES.map((car) => (
                  <div key={car.id} className="rounded-2xl border border-white/10 bg-white/5 p-2 text-center">
                    <span aria-hidden className="block text-2xl">
                      {CAR_ICONS[car.id]}
                    </span>
                    <span className="block text-xs font-black text-white">{car.id === "taxi" ? "Matatu" : car.id === "saloon" ? "Saloon" : car.name}</span>
                    <span className="block font-mono text-sm font-black text-amber-200">{formatCoins(car.pay)}</span>
                    <span className="block text-[10px] text-slate-400">
                      {car.zones} panels · {car.seconds / 60} min
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-slate-400">
                500 soap comes off each car. Under 70% clean, the driver won&apos;t pay. 4 paid cars a day.
              </p>
            </>
          )}
          {player && (
            <div className="mt-4 grid grid-cols-2 gap-1.5 text-xs">
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Balance</span>
                <span className="font-mono font-black text-amber-200">{formatCoins(player.balance)}</span>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Energy</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono font-black text-white">{energy}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span className={`block h-full rounded-full ${energy < 25 ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${energy}%` }} />
                  </span>
                </span>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs font-bold text-rose-300">{error}</p>}
          <div className="mt-4 flex gap-2">
            <BackToBase />
            <ActionButton
              variant="primary"
              className="min-w-0 flex-[2] whitespace-normal"
              disabled={busy || !player || (gig === "rolex" && player.balance < packPrice)}
              onClick={() => onStart(spot, pack)}
            >
              {busy ? "Opening…" : gig === "rolex" ? `Buy stock and open · ${formatCoins(packPrice)}` : "🧽 Start washing"}
            </ActionButton>
          </div>
        </div>
      </AdaptivePanel>
    </div>
  )
}

const RolexStall3D = dynamic(() => import("@/components/rolex/RolexStall3D").then((module) => ({ default: module.RolexStall3D })), {
  ssr: false
})

const EMPTY_PREP: RolexPrep = { customerId: null, eggs: 0, veg: false, whisked: false, crackAt: 0, vegAt: 0, whiskAt: 0 }

const STEP_TEXT: Record<RolexStep, { icon: string; label: string; hint: string }> = {
  pick: { icon: "🧑🏾", label: "Take an order", hint: "Tap a customer at the counter" },
  crack: { icon: "🥚", label: "Crack an egg", hint: "Two eggs into the bowl" },
  veg: { icon: "🍅", label: "Add the veg", hint: "Tomato, onion and cabbage" },
  whisk: { icon: "🥄", label: "Whisk it", hint: "Beat the eggs and veg together" },
  pour: { icon: "🍳", label: "Pour on the pan", hint: "Fry it on the hot plate" },
  wait: { icon: "⏳", label: "Pan's busy", hint: "Flip the egg that's cooking first" },
  flip: { icon: "🔄", label: "Flip & roll", hint: "Flip when it turns golden" },
  empty: { icon: "📦", label: "Out of stock", hint: "Close up and count your money" }
}

/** The 3D rolex stand with its HUD: take an order, prep the egg, fry, flip, roll. */
function RolexStand({ state, now, send }: { state: StallState; now: number; send(type: string, payload?: unknown): void }) {
  const loadout = useMyLoadout()
  const [prep, setPrep] = useState<RolexPrep>(EMPTY_PREP)
  const [hint, setHint] = useState<{ text: string; at: number } | null>(null)
  const customers = state.customers

  // Drop the order if that customer walked off.
  const selected = customers.find((customer) => customer.id === prep.customerId) ?? null
  useEffect(() => {
    if (prep.customerId && !customers.some((customer) => customer.id === prep.customerId)) {
      setPrep((current) => ({ ...current, customerId: null }))
    }
  }, [customers, prep.customerId])

  // Remember who the egg on the plate is for, so the rolled rolex goes to them.
  const lastCooking = useRef<string | null>(null)
  if (state.cooking) lastCooking.current = state.cooking.customerId
  const [flip, setFlip] = useState<RolexFlip | null>(null)
  useEffect(() => {
    const last = state.lastFlip
    if (!last || last.agoMs > 3000) return
    const at = state.receivedAt - last.agoMs
    setFlip((current) => (current && Math.abs(current.at - at) < 400 ? current : { result: last.result, at, customerId: lastCooking.current }))
  }, [state.lastFlip, state.receivedAt])

  const cookingSince = state.cooking ? state.receivedAt - state.cooking.elapsedMs : null
  const cookingSeconds = cookingSince === null ? 0 : (now - cookingSince) / 1000
  const progress = Math.min(1, cookingSeconds / COOK_TOTAL)
  const windowStart = ROLEX_FLIP_WINDOW.start / COOK_TOTAL
  const windowEnd = ROLEX_FLIP_WINDOW.end / COOK_TOTAL
  const inWindow = cookingSeconds >= ROLEX_FLIP_WINDOW.start && cookingSeconds <= ROLEX_FLIP_WINDOW.end
  const flipText = flip && now - flip.at < 2500 ? FLIP_TEXT[flip.result] : null

  // What the bowl needs next (you can prep the next rolex while one fries).
  const prepStep: RolexStep =
    state.stock <= 0 ? "empty" : prep.eggs < 2 ? "crack" : !prep.veg ? "veg" : !prep.whisked ? "whisk" : state.cooking ? "wait" : "pour"
  const step: RolexStep = state.cooking ? "flip" : prepStep === "pour" && !selected && customers.length !== 1 ? "pick" : prepStep
  const target: RolexTarget | null =
    step === "flip" || step === "pour" ? "pan" : step === "crack" ? "tray" : step === "veg" ? "board" : step === "whisk" ? "bowl" : null

  const say = (text: string) => setHint({ text, at: Date.now() })

  const pour = () => {
    const customer = selected ?? (customers.length === 1 ? customers[0]! : null)
    if (!customer) return say("Tap the customer you're cooking for.")
    send("cook", customer.id)
    // Keep their order open if they asked for two.
    const stillWants = customer.wants - customer.served - 1 > 0
    setPrep({ ...EMPTY_PREP, customerId: stillWants ? customer.id : null })
  }

  const doStep = (wanted: RolexTarget) => {
    const at = Date.now()
    if (wanted === "pan") {
      if (state.cooking) return send("flip")
      if (prepStep === "pour") return pour()
      return say(prepStep === "empty" ? "You're out of stock." : `First: ${STEP_TEXT[prepStep].label.toLowerCase()}.`)
    }
    if (state.stock <= 0) return say("You're out of stock.")
    if (wanted === "tray") {
      if (prep.eggs >= 2) return say("Two eggs is enough.")
      return setPrep((current) => ({ ...current, eggs: current.eggs + 1, crackAt: at }))
    }
    if (wanted === "board") {
      if (prep.eggs < 2) return say("Crack two eggs first.")
      if (prep.veg) return say("The veg is in.")
      return setPrep((current) => ({ ...current, veg: true, vegAt: at }))
    }
    if (prep.eggs < 2 || !prep.veg) return say(prep.eggs < 2 ? "Crack two eggs first." : "Add the veg first.")
    setPrep((current) => ({ ...current, whisked: true, whiskAt: at }))
  }

  const pick = (customerId: string) => setPrep((current) => ({ ...current, customerId }))
  const shownStep = STEP_TEXT[step]
  const hintText = hint && now - hint.at < 2200 ? hint.text : null

  return (
    <div className="fixed inset-0 z-10">
      <RolexStall3D
        customers={customers}
        received={state.receivedAt}
        prep={prep}
        next={target}
        cooking={state.cooking && cookingSince !== null ? { since: cookingSince, customerId: state.cooking.customerId } : null}
        flip={flip}
        loadout={loadout}
        onPick={pick}
        onTap={doStep}
      />
      {/* Top: what to do next. */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] mx-auto w-[min(94vw,40rem)] px-1">
        <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-2xl">
              {shownStep.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-white">{shownStep.label}</div>
              <div className="text-[11px] text-slate-300">{hintText ?? (customers.length === 0 && step !== "flip" ? "Prep while you wait for customers" : shownStep.hint)}</div>
            </div>
            {flipText && <span className={`text-right text-xs font-black ${flipText.tone}`}>{flipText.text}</span>}
          </div>
          {/* The bowl: two eggs, veg, whisked */}
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold">
            {[
              { done: prep.eggs >= 1, label: "🥚" },
              { done: prep.eggs >= 2, label: "🥚" },
              { done: prep.veg, label: "🍅🧅🥬" },
              { done: prep.whisked, label: "🥄" }
            ].map((item, index) => (
              <span key={index} className={`rounded-full px-2 py-0.5 ${item.done ? "bg-emerald-400/20 text-emerald-200" : "bg-white/5 text-slate-500 grayscale"}`}>
                {item.label}
              </span>
            ))}
            <span className="ml-auto text-slate-400">
              {selected ? `Cooking for 🧑🏾 ${selected.served}/${selected.wants}` : customers.length ? `${customers.length} waiting` : "No customers yet"}
            </span>
          </div>
        </div>
      </div>
      {/* Bottom: the timing bar and the next action. */}
      <div className="absolute inset-x-0 bottom-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-[min(100%,40rem)] flex-col gap-2">
          {state.cooking && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-2 backdrop-blur-md">
              <div className="relative h-4 w-full overflow-hidden rounded-full bg-white/10">
                <span className="absolute inset-y-0 bg-emerald-400/40" style={{ left: `${windowStart * 100}%`, width: `${(windowEnd - windowStart) * 100}%` }} />
                <span className="absolute inset-y-0 left-0 bg-amber-300/80" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="mt-1 text-center text-[11px] text-slate-300">Flip when the bar is in the green and the egg is golden.</p>
            </div>
          )}
          <ActionButton
            variant="primary"
            size="lg"
            className={`w-full ${inWindow ? "ring-4 ring-emerald-300/60" : ""}`}
            disabled={step === "empty" || step === "wait"}
            onClick={() => (step === "pick" ? say("Tap a customer at the counter.") : target && doStep(target))}
          >
            {shownStep.icon} {step === "crack" ? `${shownStep.label} (${prep.eggs}/2)` : shownStep.label}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

const TOOLS: Array<{ id: WashTool; icon: string; label: string; hint: string }> = [
  { id: "soap", icon: "🧴", label: "Soap", hint: "Spray foam on the mud" },
  { id: "scrub", icon: "🧽", label: "Scrub", hint: "Rub the soapy mud off" },
  { id: "rinse", icon: "💦", label: "Rinse", hint: "Wash the foam away" }
]

/** The 3D washing bay with its HUD: drag on the car to work, drag around it to walk. */
function CarWash({ state, now, send }: { state: StallState; now: number; send(type: string, payload?: unknown): void }) {
  const loadout = useMyLoadout()
  const [tool, setTool] = useState<WashTool>("soap")
  const car = state.car
  const type = car ? findCarType(car.type) ?? CAR_TYPES[0] : null
  const left = car ? Math.max(0, car.leftMs - (now - state.receivedAt)) : 0
  const clean = car ? car.zones.filter((zone) => zone.clean).length : 0
  const share = car ? clean / car.zones.length : 0
  // The panel you last worked on, so you can see how far along it is.
  const [focus, setFocus] = useState<number | null>(null)
  const labels = useMemo(() => (car ? carLayout(car.type, car.id).zones.map((zone) => zone.label) : []), [car?.type, car?.id])
  useEffect(() => setFocus(null), [car?.id])
  const focused = car && focus !== null ? car.zones[focus] : null
  // Stable for the memoised 3D bay (this screen re-renders every 80 ms).
  const onWash = useCallback(
    (zone: number, washTool: WashTool) => {
      setFocus(zone)
      send("wash", { zone, tool: washTool })
    },
    [send]
  )
  return (
    <div className="fixed inset-0 z-10">
      <CarWashBay
        carId={car?.id ?? null}
        carType={car?.type ?? null}
        zones={car?.zones ?? NO_ZONES}
        tool={tool}
        loadout={loadout}
        onWash={onWash}
      />
      {/* Top: the car, the clock and how clean it is. */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] mx-auto w-[min(94vw,40rem)] px-1">
        {car && type ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-3 backdrop-blur-md">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-black text-white">
                {car.type === "taxi" ? "🚐" : car.type === "suv" ? "🚙" : "🚗"} {type.name}
              </span>
              <span className="font-mono text-sm font-black text-amber-200">{formatCoins(type.pay)}</span>
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <span>
                Time <span className="font-mono normal-case text-slate-200">{Math.floor(left / 60_000)}:{String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}</span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full" style={{ width: `${(left / (type.seconds * 1000)) * 100}%`, background: left < 15_000 ? "#f43f5e" : "#38bdf8" }} />
              </span>
              <span>Clean</span>
              <span className="h-2 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${share * 100}%` }} />
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-300">
              {clean}/{car.zones.length} parts clean · soap it, scrub the mud off, then rinse
            </p>
            {focused && focus !== null && <PanelStatus label={labels[focus] ?? "Panel"} zone={focused} />}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-3 text-center text-sm text-slate-300 backdrop-blur-md">
            🚿 Bay is empty. Next car coming… <span className="block text-[11px] text-slate-500">{state.carsDone} washed this shift</span>
          </div>
        )}
      </div>
      {/* Bottom: tools and finishing. */}
      <div className="absolute inset-x-0 bottom-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-[min(100%,40rem)] items-stretch gap-2">
          {TOOLS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTool(entry.id)}
              aria-pressed={tool === entry.id}
              title={entry.hint}
              className={`flex min-h-[64px] flex-1 flex-col items-center justify-center rounded-2xl border text-xs font-black transition ${
                tool === entry.id ? "border-amber-300 bg-amber-400 text-slate-950" : "border-white/15 bg-slate-950/85 text-white"
              }`}
            >
              <span aria-hidden className="text-xl">
                {entry.icon}
              </span>
              {entry.label}
            </button>
          ))}
          <ActionButton variant="primary" className="flex-[1.4] text-xs" disabled={!car} onClick={() => send("finishCar")}>
            ✅ Done, call the driver
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

/** How far along the panel you're working on is, and what it needs next. */
function PanelStatus({ label, zone }: { label: string; zone: { soap: number; dirt: number; clean: boolean } }) {
  const mud = Math.round(zone.dirt * 100)
  const next = zone.clean
    ? "✨ Clean! Move to the next part"
    : zone.dirt > WASH_RINSE_DIRT
      ? zone.soap >= 0.25
        ? "🧽 Scrub the mud off"
        : "🧴 Soap it first"
      : "💦 Rinse the foam off"
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5 text-[11px]">
      <span className="font-black text-white">{label}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-amber-700 transition-[width]" style={{ width: `${zone.clean ? 0 : mud}%` }} />
      </span>
      <span className="text-slate-400">{zone.clean ? "no mud" : `mud ${mud}%`}</span>
      <span className={`ml-auto font-bold ${zone.clean ? "text-emerald-300" : "text-amber-200"}`}>{next}</span>
    </div>
  )
}

function Summary({ state, onAgain }: { state: StallState; onAgain(): void }) {
  const { summary } = state
  const profit = summary.earned - summary.spent - summary.fined
  return (
    <Card className="mx-auto w-full max-w-md">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">Shift over</div>
      <div className="mt-1 text-lg font-black text-white">{OUTCOME_TEXT[summary.outcome] ?? "Shift over."}</div>
      <dl className="mt-3 flex flex-col gap-1 font-mono text-sm">
        <div className="flex justify-between text-slate-300">
          <dt>
            Earned ({summary.served} {state.stall === "rolex" ? "customer" : "car"}
            {summary.served === 1 ? "" : "s"})
          </dt>
          <dd className="text-emerald-300">+{formatCoins(summary.earned)}</dd>
        </div>
        {summary.spent > 0 && (
          <div className="flex justify-between text-slate-300">
            <dt>Stock</dt>
            <dd className="text-rose-300">−{formatCoins(summary.spent)}</dd>
          </div>
        )}
        {summary.fined > 0 && (
          <div className="flex justify-between text-slate-300">
            <dt>KCCA fine</dt>
            <dd className="text-rose-300">−{formatCoins(summary.fined)}</dd>
          </div>
        )}
        {summary.spoiled > 0 && (
          <div className="flex justify-between text-slate-400">
            <dt>Spoiled</dt>
            <dd>{summary.spoiled} rolex{summary.spoiled === 1 ? "" : "es"} of stock</dd>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-black">
          <dt className="text-white">{profit >= 0 ? "Profit" : "Loss"}</dt>
          <dd className={profit >= 0 ? "text-amber-200" : "text-rose-300"}>
            {profit >= 0 ? "+" : "−"}
            {formatCoins(Math.abs(profit))}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex gap-2">
        <BackToBase />
        <ActionButton variant="primary" className="flex-1" onClick={onAgain}>
          Another shift
        </ActionButton>
      </div>
    </Card>
  )
}

// The stall screen for mini-game hustles (rolex stand, car wash). No map.
export function StallScreen({ gig }: { gig: "rolex" | "carwash" }) {
  const { connected, stall, stallEvent, startStall, sendStall, leaveRoom } = useColyseusContext()
  const now = useTicker(80)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The spot/pack chosen on the start card, sent once the room is open.
  const [pending, setPending] = useState<{ spot: string; pack: string } | null>(null)

  useEffect(() => {
    if (pending && stall?.phase === "setup") {
      sendStall("buyStock", pending)
      setPending(null)
    }
  }, [pending, stall?.phase, sendStall])

  // A refused purchase (no money, daily limit) leaves the room unopened.
  useEffect(() => {
    if (stallEvent?.kind === "notice" && stall?.phase === "setup") {
      setError(stallEvent.text)
      setBusy(false)
      leaveRoom()
    }
  }, [stallEvent, stall?.phase, leaveRoom])

  useEffect(() => {
    if (stall && stall.phase !== "setup") setBusy(false)
  }, [stall])

  const start = async (spot: string, pack: string) => {
    setBusy(true)
    setError(null)
    // A finished shift may still be connected: leave it first.
    if (connected) leaveRoom()
    try {
      if (gig === "rolex") setPending({ spot, pack })
      await startStall(gig)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the stall")
      setBusy(false)
    }
  }

  const info = findHustle(stall?.stall ?? gig)!
  const toast = stallEvent && now - stallEvent.at < 3000 ? stallEvent : null
  const spot = stall ? findRolexSpot(stall.spot) : null

  return (
    <main className="tiral-game relative min-h-dvh w-screen overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        {!connected || !stall || stall.phase === "setup" || (stall.phase === "closed" && stall.stall !== gig) ? (
          <div className="pt-6">
            <StartCard gig={gig} onStart={(s, p) => void start(s, p)} busy={busy} error={error} />
          </div>
        ) : stall.phase === "closed" ? (
          <div className="pt-6">
            <Summary
              state={stall}
              onAgain={() => {
                leaveRoom()
                setError(null)
              }}
            />
          </div>
        ) : (
          <>
            <div className="relative z-20 flex min-h-[48px] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/85 py-1 pl-3 pr-1">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black">
                  {info.icon} {info.name}
                  {spot && stall.stall === "rolex" ? ` · ${spot.name}` : ""}
                </div>
                <div className="truncate font-mono text-[11px] text-cyan-300">
                  {stall.stall === "rolex" ? `${stall.stock} rolexes of stock left · ` : `${stall.carsDone} cars · `}+
                  {formatCoins(stall.summary.earned)} BNG
                </div>
              </div>
              <button
                type="button"
                onClick={() => sendStall("close")}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-rose-300/30 px-3 text-xs font-bold text-rose-200"
              >
                {stall.stall === "rolex" ? "Close stall" : "End shift"}
              </button>
            </div>
            {stall.stall === "rolex" ? <RolexStand state={stall} now={now} send={sendStall} /> : <CarWash state={stall} now={now} send={sendStall} />}
          </>
        )}

        {toast && stall?.phase !== "closed" && (
          <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+9.5rem)] z-50 mx-auto w-[min(90vw,340px)] rounded-2xl border border-white/15 bg-slate-950/95 px-4 py-3 text-center text-sm font-bold shadow-2xl">
            {toast.kind === "sale" ? (
              <span className="text-emerald-300">
                +{formatCoins(toast.amount)} BNG · {toast.rolexes} rolex{toast.rolexes === 1 ? "" : "es"} sold
              </span>
            ) : toast.kind === "customer_left" ? (
              <span className="text-rose-300">A customer got tired of waiting and left.</span>
            ) : toast.kind === "car_done" ? (
              toast.paid ? (
                <span className="text-emerald-300">
                  +{formatCoins(toast.net)} BNG
                  <span className="block text-[11px] font-normal text-slate-300">
                    {formatCoins(toast.pay)} wash{toast.tip ? ` + ${formatCoins(toast.tip)} tip` : ""} − {formatCoins(toast.soap)} soap
                  </span>
                </span>
              ) : toast.limit ? (
                <span className="text-amber-300">That&apos;s 4 cars today: no more paid washes until tomorrow.</span>
              ) : toast.unpaid === "guest" ? (
                <span className="text-amber-300">Sign in to get paid for washes.</span>
              ) : toast.unpaid === "error" ? (
                <span className="text-rose-300">The driver was happy, but the payment didn&apos;t go through. Try the next car.</span>
              ) : (
                <span className="text-rose-300">Only {Math.round(toast.cleanShare * 100)}% clean: the driver refused to pay.</span>
              )
            ) : (
              <span className="text-amber-200">{toast.text}</span>
            )}
          </div>
        )}
      </div>

      {stall?.phase === "raid" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-rose-950/85 p-6 text-center">
          <div>
            <div className="text-5xl">🚨</div>
            <div className="mt-2 text-3xl font-black">KCCA! Pack up!</div>
            <p className="mt-1 text-sm text-rose-100">
              Run now or lose your stall and pay a fine. {Math.ceil(Math.max(0, (stall.raidInMs ?? 0) - (now - stall.receivedAt)) / 1000)}s
            </p>
            <ActionButton variant="primary" size="lg" className="mt-5 w-56" onClick={() => sendStall("run")}>
              🏃 RUN
            </ActionButton>
          </div>
        </div>
      )}
    </main>
  )
}
