"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps
} from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  CAR_MIN_CLEAN_SHARE,
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
import { ActionButton, Card, ConfirmButton, SectionLabel, actionButtonClass } from "@/components/ui"
import { AdaptivePanel } from "@/components/ui/AdaptivePanel"
import { Modal } from "@/components/ui/Modal"
import { useMyLoadout } from "@/lib/useMyLoadout"
import type { AvatarLoadout } from "@tiral/avatars"
import { WASH_RINSE_DIRT, type WashTool } from "@tiral/game-core"
import { carLayout } from "@/components/carwash/carLayout"
import type { RolexFlip, RolexPrep, RolexStep, RolexTarget } from "@/components/rolex/RolexStall3D"

const CarWashBay = dynamic(() => import("@/components/carwash/CarWashBay").then((module) => ({ default: module.CarWashBay })), {
  ssr: false
})

const RolexStall3D = dynamic(() => import("@/components/rolex/RolexStall3D").then((module) => ({ default: module.RolexStall3D })), {
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
  perfect: { text: "Perfect! +500 tip", tone: "text-leaf" },
  good: { text: "Good rolex", tone: "text-leaf" },
  raw: { text: "Too early: raw, half price", tone: "text-flame-deep" },
  burnt: { text: "Burnt! Ingredients wasted", tone: "text-flame-deep" }
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
      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-sheet-line text-sm font-bold text-sheet-ink"
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
 * One 3D scene for the whole stall: the start card shows it as a backdrop and
 * the shift plays in it, so starting a shift doesn't throw away the canvas and
 * build a new one (WebGL context, shaders, the avatar) on a slow phone.
 * Each screen publishes the scene it wants with useStage() and draws its HUD
 * into the stage's layer.
 */
type StageScene =
  | { kind: "carwash"; backdrop?: string; props: ComponentProps<typeof CarWashBay> }
  | { kind: "rolex"; backdrop?: string; props: ComponentProps<typeof RolexStall3D> }

function shallowEqual(a: object, b: object) {
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => Object.is(left[key], right[key]))
}

function createStageStore() {
  let scene: StageScene | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => scene,
    set(next: StageScene | null) {
      // The screens re-render on a fast clock: only redraw the scene when its
      // props actually change (a canvas re-rendered too often can stall setup).
      if (scene === next) return
      if (scene && next && scene.kind === next.kind && scene.backdrop === next.backdrop && shallowEqual(scene.props, next.props)) return
      scene = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

type StageStore = ReturnType<typeof createStageStore>
const StageContext = createContext<{ store: StageStore; host: HTMLElement | null } | null>(null)

/** Show this scene on the stall stage; returns the layer to portal the HUD into. */
function useStage(scene: StageScene) {
  const stage = useContext(StageContext)
  useLayoutEffect(() => {
    stage?.store.set(scene)
  })
  return stage?.host ?? null
}

function StallStage({ store, onHost }: { store: StageStore; onHost(element: HTMLElement | null): void }) {
  const scene = useSyncExternalStore(store.subscribe, store.get, () => null)
  useEffect(() => () => store.set(null), [store])
  return (
    <div className="fixed inset-0 z-10">
      {scene && (
        <div key={scene.kind} className={`absolute inset-0 ${scene.backdrop ?? ""}`}>
          {scene.kind === "carwash" ? <CarWashBay {...scene.props} /> : <RolexStall3D {...scene.props} />}
        </div>
      )}
      <div ref={onHost} className="contents" />
    </div>
  )
}

/** The start card's backdrop: the bay (or stall), empty and slowly turning. */
function startScene(gig: "rolex" | "carwash", loadout: AvatarLoadout): StageScene {
  return gig === "carwash"
    ? {
        kind: "carwash",
        backdrop: "bg-[radial-gradient(ellipse_at_70%_60%,#EEF4FB,#CFE2F7_70%)]",
        props: { showcase: true, carId: "showcase", carType: "saloon", zones: NO_CUSTOMERS, tool: "soap", loadout, onWash: noop }
      }
    : {
        kind: "rolex",
        backdrop: "pointer-events-none bg-[linear-gradient(to_bottom,#7dd3fc,#bae6fd_45%,#8a5a3c_55%,#6b4430)]",
        props: {
          showcase: true,
          customers: NO_CUSTOMERS,
          received: 0,
          prep: EMPTY_PREP,
          next: null,
          cooking: null,
          flip: null,
          loadout,
          onPick: noop,
          onTap: noop
        }
      }
}

/** Before a shift: the bay (or stall) behind, and a card to start from. */
function StartCard({ gig, onStart, busy, error }: { gig: "rolex" | "carwash"; onStart(spot: string, pack: string): void; busy: boolean; error: string | null }) {
  const { player } = usePlayer()
  const loadout = useMyLoadout()
  const info = findHustle(gig)!
  const [spot, setSpot] = useState<string>(ROLEX_SPOTS[0].id)
  const [pack, setPack] = useState<string>(ROLEX_PACKS[1].id)
  const packPrice = ROLEX_PACKS.find((candidate) => candidate.id === pack)?.price ?? 0
  const energy = player ? Math.round(player.needs.energy) : 0
  const host = useStage(startScene(gig, loadout))
  if (!host) return null
  return createPortal(
    <>
      {/* The same panel as every other screen: docked on the right on wide
          screens, a bottom sheet on phones. */}
      <AdaptivePanel label={info.name} initial="half" peekHeight={260}>
        <div className="flex flex-col pb-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flame-deep">
            Hustle{gig === "carwash" ? " · Nakivubo washing bay" : ""}
          </div>
          <h1 className="mt-1 text-2xl font-black text-sheet-ink">
            {info.icon} {info.name}
          </h1>
          {gig === "rolex" ? (
            <>
              <p className="mt-1 text-sm leading-snug text-sheet-mute">
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
                    className={`min-w-0 rounded-xl border p-2 text-left text-xs ${spot === candidate.id ? "border-flame bg-flame-soft" : "border-sheet-line bg-sheet-card"}`}
                  >
                    <span className="block font-black text-sheet-ink">{candidate.name}</span>
                    <span className="block text-[11px] text-sheet-mute">
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
                    className={`rounded-xl border p-2 text-left text-xs ${pack === candidate.id ? "border-flame bg-flame-soft" : "border-sheet-line bg-sheet-card"}`}
                  >
                    <span className="block font-black text-sheet-ink">{candidate.rolexes} rolexes</span>
                    <span className="block font-mono text-sheet-blue">{formatCoins(candidate.price)} BNG</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-sheet-mute">Each rolex sells for 2,000 (+500 tip if perfect).</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm leading-snug text-sheet-mute">
                Drivers pull in covered in Kampala mud. Wash every panel before they lose patience.
              </p>
              <ol className="mt-4 grid grid-cols-3 gap-1.5">
                {TOOLS.map((entry, index) => (
                  <li key={entry.id} className="flex flex-col items-center rounded-2xl border border-sheet-line bg-sheet-card px-1 py-2 text-center">
                    <span aria-hidden className="text-xl">
                      {entry.icon}
                    </span>
                    <span className="text-xs font-black text-sheet-ink">
                      {index + 1}. {entry.label}
                    </span>
                    <span className="text-[11px] leading-tight text-sheet-mute">{entry.hint}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4">
                <SectionLabel>Cars</SectionLabel>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CAR_TYPES.map((car) => (
                  <div key={car.id} className="rounded-2xl border border-sheet-line bg-sheet-card p-2 text-center">
                    <span aria-hidden className="block text-2xl">
                      {CAR_ICONS[car.id]}
                    </span>
                    <span className="block text-xs font-black text-sheet-ink">{car.id === "taxi" ? "Matatu" : car.id === "saloon" ? "Saloon" : car.name}</span>
                    <span className="block font-mono text-sm font-black text-sheet-blue">{formatCoins(car.pay)}</span>
                    <span className="block text-[11px] text-sheet-mute">
                      {car.zones} panels · {car.seconds / 60} min
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-sheet-mute">
                500 soap comes off each car. Under 70% clean, the driver won&apos;t pay. 4 paid cars a day.
              </p>
            </>
          )}
          {player && (
            <div className="mt-4 grid grid-cols-2 gap-1.5 text-xs">
              <div className="rounded-xl bg-sheet-card px-3 py-2">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-sheet-mute">Balance</span>
                <span className="font-mono font-black text-sheet-blue">{formatCoins(player.balance)}</span>
              </div>
              <div className="rounded-xl bg-sheet-card px-3 py-2">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-sheet-mute">Energy</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono font-black text-sheet-ink">{energy}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sheet-soft">
                    <span className={`block h-full rounded-full ${energy < 25 ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${energy}%` }} />
                  </span>
                </span>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs font-bold text-flame-deep">{error}</p>}
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
    </>,
    host
  )
}

const EMPTY_PREP: RolexPrep = { customerId: null, eggs: 0, veg: false, whisked: false, crackAt: 0, vegAt: 0, whiskAt: 0 }

const STEP_TEXT: Record<RolexStep, { icon: string; label: string; hint: string }> = {
  pick: { icon: "🧑🏾", label: "Take an order", hint: "Tap a customer at the counter or below" },
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

  const host = useStage({
    kind: "rolex",
    props: {
      customers,
      received: state.receivedAt,
      prep,
      next: target,
      cooking: state.cooking && cookingSince !== null ? { since: cookingSince, customerId: state.cooking.customerId } : null,
      flip,
      loadout,
      onPick: pick,
      onTap: doStep
    }
  })
  if (!host) return null
  return createPortal(
    <>
      {/* Top: what to do next. */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] mx-auto w-[min(94vw,40rem)] px-1">
        <div className="rounded-2xl border border-sheet-line bg-sheet-card/95 p-3 md:backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-2xl">
              {shownStep.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-sheet-ink">{shownStep.label}</div>
              <div className="text-[11px] text-sheet-mute">{hintText ?? (customers.length === 0 && step !== "flip" ? "Prep while you wait for customers" : shownStep.hint)}</div>
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
              <span key={index} className={`rounded-full px-2 py-0.5 ${item.done ? "bg-leaf-soft text-leaf" : "bg-sheet-card text-sheet-mute grayscale"}`}>
                {item.label}
              </span>
            ))}
            <span className="ml-auto text-sheet-mute">
              {selected ? `Cooking for 🧑🏾 ${selected.served}/${selected.wants}` : customers.length ? `${customers.length} waiting` : "No customers yet"}
            </span>
          </div>
        </div>
      </div>
      {/* Bottom: the timing bar and the next action. */}
      <div className="absolute inset-x-0 bottom-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-[min(100%,40rem)] flex-col gap-2">
          {state.cooking && (
            <div className="rounded-2xl border border-sheet-line bg-sheet-card/95 p-2 md:backdrop-blur-md">
              <div className="relative h-4 w-full overflow-hidden rounded-full bg-sheet-soft">
                <span className="absolute inset-y-0 bg-emerald-400/40" style={{ left: `${windowStart * 100}%`, width: `${(windowEnd - windowStart) * 100}%` }} />
                <span className="absolute inset-y-0 left-0 bg-amber-300/80" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="mt-1 text-center text-[11px] text-sheet-mute">Flip when the bar is in the green and the egg is golden.</p>
            </div>
          )}
          {/* The queue as buttons too: picking a customer shouldn't need a precise 3D tap. */}
          {customers.length > 0 && !state.cooking && (
            <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Customers waiting">
              {customers.map((customer, index) => {
                const secondsLeft = Math.max(0, Math.ceil((customer.leavesInMs - (now - state.receivedAt)) / 1000))
                const chosen = selected?.id === customer.id
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => pick(customer.id)}
                    aria-pressed={chosen}
                    className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${
                      chosen ? "border-flame bg-flame-soft text-flame-deep" : "border-sheet-line bg-sheet-card/95 text-sheet-ink"
                    }`}
                  >
                    <span aria-hidden>🧑🏾</span>
                    <span>
                      Customer {index + 1}: {customer.served}/{customer.wants}
                    </span>
                    <span className={secondsLeft <= 10 ? "text-flame-deep" : "text-sheet-mute"}>{secondsLeft}s</span>
                  </button>
                )
              })}
            </div>
          )}
          <ActionButton
            variant="primary"
            size="lg"
            className={`w-full ${inWindow ? "ring-4 ring-emerald-300/60" : ""}`}
            disabled={step === "empty" || step === "wait"}
            onClick={() => (step === "pick" ? say("Pick a customer: tap one at the counter or in the list.") : target && doStep(target))}
          >
            {shownStep.icon} {step === "crack" ? `${shownStep.label} (${prep.eggs}/2)` : shownStep.label}
          </ActionButton>
        </div>
      </div>
    </>,
    host
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
  const host = useStage({
    kind: "carwash",
    props: { carId: car?.id ?? null, carType: car?.type ?? null, zones: car?.zones ?? NO_ZONES, tool, loadout, onWash }
  })
  if (!host) return null
  return createPortal(
    <>
      {/* Top: the car, the clock and how clean it is. */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] mx-auto w-[min(94vw,40rem)] px-1">
        {car && type ? (
          <div className="rounded-2xl border border-sheet-line bg-sheet-card/95 p-3 md:backdrop-blur-md">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-black text-sheet-ink">
                {car.type === "taxi" ? "🚐" : car.type === "suv" ? "🚙" : "🚗"} {type.name}
              </span>
              <span className="font-mono text-sm font-black text-sheet-blue">{formatCoins(type.pay)}</span>
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-wide text-sheet-mute">
              <span>
                Time <span className="font-mono normal-case text-sheet-ink">{Math.floor(left / 60_000)}:{String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}</span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-sheet-soft">
                <span className="block h-full rounded-full" style={{ width: `${(left / (type.seconds * 1000)) * 100}%`, background: left < 15_000 ? "#f43f5e" : "#38bdf8" }} />
              </span>
              <span>Clean</span>
              <span className="h-2 overflow-hidden rounded-full bg-sheet-soft">
                <span className="block h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${share * 100}%` }} />
              </span>
            </div>
            <p className="mt-1 text-[11px] text-sheet-mute">
              {clean}/{car.zones.length} parts clean · soap it, scrub the mud off, then rinse
            </p>
            {focused && focus !== null && <PanelStatus label={labels[focus] ?? "Panel"} zone={focused} />}
          </div>
        ) : (
          <div className="rounded-2xl border border-sheet-line bg-sheet-card/95 p-3 text-center text-sm text-sheet-mute md:backdrop-blur-md">
            🚿 Bay is empty. Next car coming… <span className="block text-[11px] text-sheet-mute">{state.carsDone} washed this shift</span>
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
                tool === entry.id ? "border-flame bg-flame text-white" : "border-sheet-line bg-sheet-card/95 text-sheet-ink"
              }`}
            >
              <span aria-hidden className="text-xl">
                {entry.icon}
              </span>
              {entry.label}
            </button>
          ))}
          {/* Below the pay line the driver won't pay: make sure that's meant. */}
          <ConfirmButton
            className={`${actionButtonClass("flame")} flex-[1.4] text-xs`}
            armedClassName="!bg-flame-deep !text-white"
            disabled={!car}
            confirm={!!car && car.zones.filter((zone) => zone.clean).length / car.zones.length < CAR_MIN_CLEAN_SHARE}
            confirmLabel={`Under ${Math.round(CAR_MIN_CLEAN_SHARE * 100)}% clean: no pay. Tap again`}
            onConfirm={() => send("finishCar")}
          >
            ✅ Done, call the driver
          </ConfirmButton>
        </div>
      </div>
    </>,
    host
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
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-sheet-card px-2 py-1.5 text-[11px]">
      <span className="font-black text-sheet-ink">{label}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-sheet-soft">
        <span className="block h-full rounded-full bg-amber-700 transition-[width]" style={{ width: `${zone.clean ? 0 : mud}%` }} />
      </span>
      <span className="text-sheet-mute">{zone.clean ? "no mud" : `mud ${mud}%`}</span>
      <span className={`ml-auto font-bold ${zone.clean ? "text-leaf" : "text-sheet-blue"}`}>{next}</span>
    </div>
  )
}

function Summary({ state, onAgain }: { state: StallState; onAgain(): void }) {
  const { summary } = state
  const profit = summary.earned - summary.spent - summary.fined
  return (
    <Card className="mx-auto w-full max-w-md">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-flame-deep">Shift over</div>
      <div className="mt-1 text-lg font-black text-sheet-ink">{OUTCOME_TEXT[summary.outcome] ?? "Shift over."}</div>
      <dl className="mt-3 flex flex-col gap-1 font-mono text-sm">
        <div className="flex justify-between text-sheet-mute">
          <dt>
            Earned ({summary.served} {state.stall === "rolex" ? "customer" : "car"}
            {summary.served === 1 ? "" : "s"})
          </dt>
          <dd className="text-leaf">+{formatCoins(summary.earned)}</dd>
        </div>
        {summary.spent > 0 && (
          <div className="flex justify-between text-sheet-mute">
            <dt>Stock</dt>
            <dd className="text-flame-deep">−{formatCoins(summary.spent)}</dd>
          </div>
        )}
        {summary.fined > 0 && (
          <div className="flex justify-between text-sheet-mute">
            <dt>KCCA fine</dt>
            <dd className="text-flame-deep">−{formatCoins(summary.fined)}</dd>
          </div>
        )}
        {summary.spoiled > 0 && (
          <div className="flex justify-between text-sheet-mute">
            <dt>Spoiled</dt>
            <dd>{summary.spoiled} rolex{summary.spoiled === 1 ? "" : "es"} of stock</dd>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-sheet-line pt-1 font-black">
          <dt className="text-sheet-ink">{profit >= 0 ? "Profit" : "Loss"}</dt>
          <dd className={profit >= 0 ? "text-sheet-blue" : "text-flame-deep"}>
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
  const [stageStore] = useState(createStageStore)
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null)
  const stage = useMemo(() => ({ store: stageStore, host: stageHost }), [stageStore, stageHost])

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

  const starting = !connected || !stall || stall.phase === "setup" || (stall.phase === "closed" && stall.stall !== gig)

  return (
    <StageContext.Provider value={stage}>
      <main className="tiral-game relative min-h-dvh w-screen overflow-y-auto bg-gradient-to-b from-sheet-soft to-[#EEF4FB] text-sheet-ink">
        {/* Kept across the start card and the shift (not the summary). */}
        {(starting || stall?.phase !== "closed") && <StallStage store={stageStore} onHost={setStageHost} />}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
          {starting ? (
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
              <div className="relative z-20 flex min-h-[48px] items-center gap-2 rounded-2xl border border-sheet-line bg-sheet-card/95 py-1 pl-3 pr-1">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black">
                    {info.icon} {info.name}
                    {spot && stall.stall === "rolex" ? ` · ${spot.name}` : ""}
                  </div>
                  <div className="truncate font-mono text-[11px] text-sheet-blue">
                    {stall.stall === "rolex" ? `${stall.stock} rolexes of stock left · ` : `${stall.carsDone} cars · `}+
                    {formatCoins(stall.summary.earned)} BNG
                  </div>
                </div>
                <ConfirmButton
                  onConfirm={() => sendStall("close")}
                  confirmLabel={stall.stall === "rolex" ? "Tap again to close" : "Tap again to end"}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-flame-deep/30 px-3 text-xs font-bold text-flame-deep"
                  armedClassName="!border-rose-400 !bg-flame-deep !text-white"
                >
                  {stall.stall === "rolex" ? "Close stall" : "End shift"}
                </ConfirmButton>
              </div>
              {stall.stall === "rolex" ? <RolexStand state={stall} now={now} send={sendStall} /> : <CarWash state={stall} now={now} send={sendStall} />}
            </>
          )}

          {toast && stall?.phase !== "closed" && (
            <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+9.5rem)] z-50 mx-auto w-[min(90vw,340px)] rounded-2xl border border-sheet-line bg-sheet px-4 py-3 text-center text-sm font-bold shadow-2xl">
              {toast.kind === "sale" ? (
                <span className="text-leaf">
                  +{formatCoins(toast.amount)} BNG · {toast.rolexes} rolex{toast.rolexes === 1 ? "" : "es"} sold
                </span>
              ) : toast.kind === "customer_left" ? (
                <span className="text-flame-deep">A customer got tired of waiting and left.</span>
              ) : toast.kind === "car_done" ? (
                toast.paid ? (
                  <span className="text-leaf">
                    +{formatCoins(toast.net)} BNG
                    <span className="block text-[11px] font-normal text-sheet-mute">
                      {formatCoins(toast.pay)} wash{toast.tip ? ` + ${formatCoins(toast.tip)} tip` : ""} − {formatCoins(toast.soap)} soap
                    </span>
                  </span>
                ) : toast.limit ? (
                  <span className="text-flame-deep">That&apos;s 4 cars today: no more paid washes until tomorrow.</span>
                ) : toast.unpaid === "guest" ? (
                  <span className="text-flame-deep">Sign in to get paid for washes.</span>
                ) : toast.unpaid === "error" ? (
                  <span className="text-flame-deep">The driver was happy, but the payment didn&apos;t go through. Try the next car.</span>
                ) : (
                  <span className="text-flame-deep">Only {Math.round(toast.cleanShare * 100)}% clean: the driver refused to pay.</span>
                )
              ) : (
                <span className="text-sheet-blue">{toast.text}</span>
              )}
            </div>
          )}
        </div>

        {stall?.phase === "raid" && (
          <Modal
            alert
            labelledBy="kcca-title"
            backdropClassName="fixed inset-0 z-50 grid place-items-center bg-flame-soft p-6 text-center"
            className=""
          >
            <div aria-hidden className="text-5xl">🚨</div>
            <div id="kcca-title" className="mt-2 text-3xl font-black">KCCA! Pack up!</div>
            <p className="mt-1 text-sm text-flame-deep">
              Run now or lose your stall and pay a fine. {Math.ceil(Math.max(0, (stall.raidInMs ?? 0) - (now - stall.receivedAt)) / 1000)}s
            </p>
            <ActionButton variant="primary" size="lg" className="mt-5 w-56" onClick={() => sendStall("run")}>
              🏃 RUN
            </ActionButton>
          </Modal>
        )}
      </main>
    </StageContext.Provider>
  )
}
