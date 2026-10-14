"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  CAR_TYPES,
  ROLEX_FLIP_WINDOW,
  ROLEX_PACKS,
  ROLEX_PATIENCE_SECONDS,
  ROLEX_SPOTS,
  findCarType,
  findHustle,
  findRolexSpot
} from "@tiral/game-core"
import { useColyseusContext } from "@/components/ColyseusProvider"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import type { StallState } from "@/lib/useColyseus"
import { ActionButton, Card, SectionLabel } from "@/components/ui"
import { useMyLoadout } from "@/lib/useMyLoadout"
import { WASH_RINSE_DIRT, type WashTool } from "@tiral/game-core"
import { carLayout } from "@/components/carwash/carLayout"

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
  const { connected, leaveRoom } = useColyseusContext()
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

function StartCard({ gig, onStart, busy, error }: { gig: "rolex" | "carwash"; onStart(spot: string, pack: string): void; busy: boolean; error: string | null }) {
  const { player } = usePlayer()
  const info = findHustle(gig)!
  const [spot, setSpot] = useState<string>(ROLEX_SPOTS[0].id)
  const [pack, setPack] = useState<string>(ROLEX_PACKS[1].id)
  const packPrice = ROLEX_PACKS.find((candidate) => candidate.id === pack)?.price ?? 0
  return (
    <Card className="mx-auto w-full max-w-md !bg-slate-950/95 shadow-2xl">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">Hustle</div>
      <h1 className="mt-1 text-xl font-black">
        {info.icon} {info.name}
      </h1>
      {gig === "rolex" ? (
        <>
          <p className="mt-1 text-sm leading-snug text-slate-300">
            Buy ingredients, then cook rolexes to order: flip the egg at the right moment. Unsold stock spoils, and KCCA
            raids stalls. 2 shifts a day.
          </p>
          <SectionLabel>Where</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {ROLEX_SPOTS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setSpot(candidate.id)}
                aria-pressed={spot === candidate.id}
                className={`rounded-xl border p-2 text-left text-xs ${spot === candidate.id ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-white/5"}`}
              >
                <span className="block font-black text-white">{candidate.name}</span>
                <span className="block text-[10px] text-slate-400">
                  {candidate.customersPerMinute >= 5 ? "busiest" : candidate.customersPerMinute >= 4 ? "busy" : "quieter"} · KCCA{" "}
                  {Math.round(candidate.raidChance * 100)}%
                </span>
              </button>
            ))}
          </div>
          <SectionLabel>Stock</SectionLabel>
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
        <p className="mt-1 text-sm leading-snug text-slate-300">
          Cars pull into the washing bay: soap each muddy panel, scrub the mud off and rinse it, all before the driver loses
          patience. Saloon 8,000 · SUV 12,000 · taxi 15,000, minus 500 soap. 4 paid cars a day.
        </p>
      )}
      {player && (
        <p className="mt-2 text-xs text-slate-400">
          Balance <span className="font-mono font-bold text-amber-200">{formatCoins(player.balance)}</span> · energy{" "}
          {Math.round(player.needs.energy)}/100
        </p>
      )}
      {error && <p className="mt-2 text-xs font-bold text-rose-300">{error}</p>}
      <div className="mt-4 flex gap-2">
        <BackToBase />
        <ActionButton
          variant="primary"
          className="flex-[2]"
          disabled={busy || !player || (gig === "rolex" && player.balance < packPrice)}
          onClick={() => onStart(spot, pack)}
        >
          {busy ? "Opening…" : gig === "rolex" ? `Buy stock and open · ${formatCoins(packPrice)}` : "Start washing"}
        </ActionButton>
      </div>
    </Card>
  )
}

function RolexStand({ state, now, send }: { state: StallState; now: number; send(type: string, payload?: unknown): void }) {
  const cookingSeconds = state.cooking ? (state.cooking.elapsedMs + (now - state.receivedAt)) / 1000 : 0
  const progress = Math.min(1, cookingSeconds / COOK_TOTAL)
  const windowStart = ROLEX_FLIP_WINDOW.start / COOK_TOTAL
  const windowEnd = ROLEX_FLIP_WINDOW.end / COOK_TOTAL
  const inWindow = cookingSeconds >= ROLEX_FLIP_WINDOW.start && cookingSeconds <= ROLEX_FLIP_WINDOW.end
  const flip = state.lastFlip && state.lastFlip.agoMs + (now - state.receivedAt) < 2500 ? FLIP_TEXT[state.lastFlip.result] : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel aside={<span>tap someone to cook for them</span>}>Customers</SectionLabel>
        {state.customers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-slate-400">Waiting for customers…</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {state.customers.map((customer) => {
              const left = Math.max(0, customer.leavesInMs - (now - state.receivedAt))
              const active = state.cooking?.customerId === customer.id
              return (
                <li key={customer.id}>
                  <button
                    type="button"
                    disabled={state.cooking !== null || state.stock <= 0}
                    onClick={() => send("cook", customer.id)}
                    className={`flex w-full flex-col items-center gap-1 rounded-2xl border p-2 text-center transition disabled:cursor-default ${
                      active ? "border-amber-300 bg-amber-300/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span aria-hidden className="text-2xl">🧑🏾</span>
                    <span className="text-xs font-black text-white">
                      {customer.served}/{customer.wants} rolex{customer.wants > 1 ? "es" : ""}
                    </span>
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(left / (ROLEX_PATIENCE_SECONDS * 1000)) * 100}%`, background: left < 10_000 ? "#f43f5e" : "#34d399" }}
                      />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Card className="flex flex-col items-center gap-3">
        <div
          aria-hidden
          className="relative grid h-32 w-32 place-items-center rounded-full border-4 border-slate-600 bg-slate-800 shadow-inner"
        >
          {state.cooking ? (
            <span
              className="grid h-20 w-20 place-items-center rounded-full text-3xl transition-colors"
              style={{ background: progress > windowEnd ? "#7c2d12" : progress > windowStart ? "#facc15" : "#fef3c7" }}
            >
              🍳
            </span>
          ) : (
            <span className="text-xs text-slate-500">pan</span>
          )}
        </div>
        <div className="w-full">
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-white/10">
            <span
              className="absolute inset-y-0 bg-emerald-400/40"
              style={{ left: `${windowStart * 100}%`, width: `${(windowEnd - windowStart) * 100}%` }}
            />
            <span className="absolute inset-y-0 left-0 bg-amber-300/80" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-1 text-center text-[11px] text-slate-400">Flip when the bar is in the green.</p>
        </div>
        <ActionButton
          variant="primary"
          size="lg"
          className={`w-full ${inWindow ? "ring-4 ring-emerald-300/50" : ""}`}
          disabled={!state.cooking}
          onClick={() => send("flip")}
        >
          {state.cooking ? "🔄 Flip & roll" : "Pick a customer"}
        </ActionButton>
        {flip && <p className={`text-sm font-black ${flip.tone}`}>{flip.text}</p>}
      </Card>
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
  return (
    <div className="fixed inset-0 z-10">
      <CarWashBay
        carId={car?.id ?? null}
        carType={car?.type ?? null}
        zones={car?.zones ?? []}
        tool={tool}
        loadout={loadout}
        onWash={(zone, washTool) => {
          setFocus(zone)
          send("wash", { zone, tool: washTool })
        }}
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
          <div role="status" className="fixed inset-x-0 top-6 z-50 mx-auto w-[min(90vw,340px)] rounded-2xl border border-white/15 bg-slate-950/95 px-4 py-3 text-center text-sm font-bold shadow-2xl">
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
