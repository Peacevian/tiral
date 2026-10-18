"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  FLEET_ENERGY,
  FLEET_MAX_BIKES,
  FLEET_MODELS,
  FLEET_SHIFT_SECONDS,
  TRACKER_PRICE,
  findBikeModel,
  fleetBikePrice,
  fleetBikeValue,
  fleetServiceCost
} from "@tiral/game-core"
import { useColyseusContext, useColyseusStatus } from "@/components/ColyseusProvider"
import { usePlayer } from "@/lib/player"
import { formatCoins } from "@/lib/useCoins"
import type { FleetBikeState, FleetState } from "@/lib/useColyseus"
import { ActionButton, Card, SectionLabel } from "@/components/ui"
import { useNow } from "@/components/hustle/JobBoard"
import { PageLoader } from "@/components/loader/Loader"

// Boda fleet (tier 3): the office (your bikes and riders, servicing, buying
// more), then a shift: send riders out, they come back with dues, and things
// happen that need a quick decision. The game server runs the riders.

type Bike = FleetState["bikes"][number]

const STATE_TEXT: Record<FleetBikeState, string> = {
  idle: "Waiting",
  road: "On the road",
  garage: "In the garage",
  impounded: "Held by police",
  hire: "Special hire",
  stolen: "Stolen"
}

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
      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-sheet-line bg-sheet-card text-sm font-bold text-sheet-ink"
    >
      Back to base
    </button>
  )
}

/** Remaining time from a server "…Ms" field, counted down locally. */
function msLeft(state: FleetState, value: number | null, now: number) {
  return value === null ? null : Math.max(0, value - (now - state.receivedAt))
}

function clock(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function modelName(model: string) {
  return findBikeModel(model)?.name ?? model
}

function WearBar({ wear }: { wear: number }) {
  const tone = wear >= 70 ? "bg-red-500" : wear >= 40 ? "bg-amber-500" : "bg-leaf"
  return (
    <span
      role="meter"
      aria-label={`Wear ${wear}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={wear}
      className="block h-1.5 w-full overflow-hidden rounded-full bg-sheet-line"
    >
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(4, wear)}%` }} />
    </span>
  )
}

/**
 * Leaving the page (the app's navigation is on screen here) closes the room,
 * like Back to base: a shift or live in progress ends and is paid.
 */
function useLeaveRoomOnExit(open: boolean) {
  const { leaveRoom } = useColyseusStatus()
  const openRef = useRef(open)
  openRef.current = open
  useEffect(
    () => () => {
      if (openRef.current) leaveRoom()
    },
    [leaveRoom]
  )
}

export function FleetScreen() {
  const { player } = usePlayer()
  const { connected, fleet, startFleet, leaveRoom } = useColyseusContext()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const tier = player?.career?.tier
  const allowed = tier !== undefined && tier !== "street" && tier !== "small"
  useLeaveRoomOnExit(fleet !== null)

  // Open the office as soon as we know you're allowed in.
  useEffect(() => {
    if (!player || !allowed || fleet || started.current) return
    started.current = true
    if (connected) leaveRoom()
    startFleet().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Couldn't open the fleet office")
      started.current = false
    })
  }, [player, allowed, fleet, connected, leaveRoom, startFleet])

  return (
    <main className="min-h-dvh w-full overflow-y-auto bg-sheet px-3 pb-[calc(var(--shell-bottom)+1.5rem)] pt-[calc(var(--shell-top)+1rem)] text-sheet-ink">
      <div className="mx-auto w-full max-w-md md:max-w-4xl">
        {!player ? null : !allowed ? (
          <Closed />
        ) : !fleet ? (
          error ? (
            <Card className="mt-2 text-center text-sm text-sheet-mute">{error}</Card>
          ) : (
            <PageLoader label="Opening the fleet office…" />
          )
        ) : fleet.phase === "shift" ? (
          <Shift fleet={fleet} />
        ) : fleet.phase === "closed" && fleet.summary ? (
          <Receipt fleet={fleet} />
        ) : (
          <Office fleet={fleet} />
        )}
      </div>
    </main>
  )
}

function Closed() {
  return (
    <Card className="mt-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Town business</div>
      <h1 className="mt-1 text-xl font-black">🛵 Boda fleet</h1>
      <p className="mt-2 text-sm text-sheet-mute">
        Move up to Town business first: do 10 LivTok lives and save 5,000,000, then move up from Earn BNG in the Race sidebar.
      </p>
      <div className="mt-4 flex">
        <BackToBase />
      </div>
    </Card>
  )
}

function Toast() {
  const { fleetEvent } = useColyseusContext()
  const now = useNow(500)
  if (!fleetEvent || now - fleetEvent.at > 6000 || fleetEvent.kind !== "notice") return null
  return (
    <p role="alert" className="mt-2 rounded-lg bg-flame-soft px-3 py-2 text-xs font-bold text-flame-deep">
      {fleetEvent.text}
    </p>
  )
}

function Office({ fleet }: { fleet: FleetState }) {
  const { player } = usePlayer()
  const { sendStall } = useColyseusContext()
  const balance = player?.balance ?? 0
  const value = fleet.bikes.reduce((sum, bike) => sum + fleetBikeValue(bike.model, bike.wear), 0)
  const full = fleet.bikes.length >= FLEET_MAX_BIKES
  return (
    <>
      <Card>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Town business</div>
            <h1 className="mt-0.5 text-xl font-black">🛵 Boda fleet</h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-base font-black text-sheet-blue">{formatCoins(value)}</div>
            <div className="text-[11px] text-sheet-mute">fleet value</div>
          </div>
        </div>
        <p className="mt-1 text-sm text-sheet-mute">
          A {FLEET_SHIFT_SECONDS / 60}-minute shift: send your riders out, they come back with dues. Crashes, the police and riders asking
          for money need quick decisions. Worn bikes earn less and break down more.
        </p>
        <Toast />
        <div className="mt-4 flex gap-2">
          <BackToBase />
          <ActionButton variant="flame" size="lg" className="flex-[2]" disabled={fleet.bikes.length === 0 || fleet.busy} onClick={() => sendStall("startShift")}>
            🛵 Start shift
          </ActionButton>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-sheet-mute">Takes {FLEET_ENERGY} energy</p>
      </Card>

      <div className="mt-4">
        <SectionLabel aside={<span className="font-mono text-[11px]">{fleet.bikes.length} / {FLEET_MAX_BIKES}</span>}>Your bikes and riders</SectionLabel>
        <ul className="grid gap-2 md:grid-cols-2">
          {fleet.bikes.map((bike) => {
            const service = fleetServiceCost(bike.wear)
            return (
              <li key={bike.id} className="rounded-xl border border-sheet-line bg-sheet-card p-3">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-xl">
                    🛵
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black">
                      {bike.rider} <span className="font-normal text-sheet-mute">· {modelName(bike.model)}</span>
                    </div>
                    <div className="text-[11px] text-sheet-mute">
                      Rider {Math.round(bike.skill * 100)}%{bike.tracker ? " · 📡 tracker" : ""} · wear {bike.wear}%
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <WearBar wear={bike.wear} />
                </div>
                <div className="mt-2 flex gap-2">
                  <ActionButton
                    variant="sheet"
                    className="flex-1"
                    disabled={fleet.busy || service <= 0 || balance < service}
                    onClick={() => sendStall("service", bike.id)}
                  >
                    🔧 {service > 0 ? `Service · ${formatCoins(service)}` : "Like new"}
                  </ActionButton>
                  {!bike.tracker && (
                    <ActionButton variant="sheet" className="flex-1" disabled={fleet.busy || balance < TRACKER_PRICE} onClick={() => sendStall("tracker", bike.id)}>
                      📡 Tracker · {formatCoins(TRACKER_PRICE)}
                    </ActionButton>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="mt-4">
        <SectionLabel aside={player ? <span className="font-mono">🪙 {formatCoins(balance)}</span> : null}>Buy a bike (comes with a rider)</SectionLabel>
        <ul className="grid gap-2 md:grid-cols-3">
          {FLEET_MODELS.map((model) => {
            const price = fleetBikePrice(model.id)
            return (
              <li key={model.id} className="flex items-center gap-3 rounded-xl border border-sheet-line bg-sheet-card p-3 md:flex-col md:items-start">
                <span aria-hidden className="text-2xl">
                  {model.id === "zemboE" ? "⚡" : "🛵"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black">{modelName(model.id)}</div>
                  <div className="text-xs text-sheet-mute">
                    ~{formatCoins(model.duesPerMinute)} a minute on the road · {model.blurb}
                  </div>
                </div>
                <ActionButton variant="sheet" className="md:w-full" disabled={fleet.busy || full || balance < price} onClick={() => sendStall("buyBike", model.id)}>
                  {formatCoins(price)}
                </ActionButton>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-[11px] text-sheet-mute">A new bike pays for itself in about 20 minutes on the road. Trackers get most stolen bikes back.</p>
      </div>
    </>
  )
}

function BikeCard({ fleet, bike, now }: { fleet: FleetState; bike: Bike; now: number }) {
  const { sendStall } = useColyseusContext()
  const left = msLeft(fleet, bike.leftMs, now)
  const idle = bike.state === "idle"
  const tone =
    bike.state === "road"
      ? "border-leaf/50 bg-leaf-soft"
      : idle
        ? "border-flame bg-flame-soft"
        : bike.state === "stolen" || bike.state === "impounded"
          ? "border-red-300 bg-red-50 opacity-70"
          : "border-sheet-line bg-sheet-card"
  return (
    <li className={`flex flex-col rounded-xl border-2 p-2.5 ${tone}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-sm font-black">{bike.rider}</span>
        <span className="shrink-0 font-mono text-[11px] font-bold text-sheet-blue">+{formatCoins(bike.earned + bike.pending)}</span>
      </div>
      <div className="text-[11px] text-sheet-mute">
        {modelName(bike.model)} · wear {bike.wear}%{bike.sulking ? " · 😤" : ""}
      </div>
      {idle ? (
        <button
          type="button"
          onClick={() => sendStall("send", bike.id)}
          className="mt-2 min-h-[44px] rounded-lg bg-flame text-sm font-black text-white active:scale-95"
        >
          Send out
        </button>
      ) : (
        <div className="mt-2 flex min-h-[44px] items-center justify-between rounded-lg bg-white/70 px-2 text-xs font-bold">
          <span>{STATE_TEXT[bike.state]}</span>
          {left !== null && <span className="font-mono">{clock(left)}</span>}
        </div>
      )}
    </li>
  )
}

function Shift({ fleet }: { fleet: FleetState }) {
  const { sendStall } = useColyseusContext()
  const now = useNow(250)
  const left = msLeft(fleet, fleet.leftMs, now) ?? 0
  const fuel = msLeft(fleet, fleet.fuelSpikeMs, now)
  const event = fleet.event
  const eventLeft = event ? Math.max(0, event.leftMs - (now - fleet.receivedAt)) : 0
  const idle = fleet.bikes.filter((bike) => bike.state === "idle").length
  return (
    <>
      <div className="sticky top-[calc(var(--shell-top)+0.25rem)] z-10 flex items-center gap-2 rounded-2xl border border-sheet-line bg-sheet-card px-3 py-2 shadow">
        <span className="font-mono text-base font-black">{clock(left)}</span>
        <span className="ml-auto text-right">
          <span className="block font-mono text-base font-black text-leaf">+{formatCoins(fleet.dues + fleet.pending)}</span>
          {fleet.costs > 0 && <span className="block font-mono text-[11px] font-bold text-flame-deep">−{formatCoins(fleet.costs)} costs</span>}
        </span>
      </div>
      {fuel !== null && fuel > 0 && (
        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">⛽ Fuel prices up: petrol bikes −20% for {clock(fuel)}</p>
      )}

      {event && (
        <div role="alertdialog" aria-label={event.title} className="mt-2 rounded-2xl border-2 border-flame bg-sheet-card p-3 shadow-lg">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-flame-deep">{event.title}</span>
            <span className="font-mono text-xs font-bold text-flame-deep">{Math.ceil(eventLeft / 1000)}s</span>
          </div>
          <p className="mt-1 text-sm font-bold">{event.text}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {event.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={event.resolving}
                onClick={() => sendStall("choose", option.id)}
                className={`min-h-[44px] rounded-xl px-3 text-sm font-black disabled:opacity-50 ${
                  option.id === "pay" ? "bg-flame text-white" : "border border-sheet-line bg-sheet text-sheet-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {event.options.length > 1 && <p className="mt-1 text-[11px] text-sheet-mute">No answer = the second choice.</p>}
        </div>
      )}
      <Toast />

      <div className="mt-3 flex items-center justify-between">
        <SectionLabel>Your riders</SectionLabel>
        {idle > 1 && (
          <button type="button" onClick={() => sendStall("sendAll")} className="min-h-[40px] rounded-lg px-2 text-xs font-black text-flame-deep">
            Send all {idle} out ›
          </button>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {fleet.bikes.map((bike) => (
          <BikeCard key={bike.id} fleet={fleet} bike={bike} now={now} />
        ))}
      </ul>

      <ul aria-live="polite" className="mt-3 flex flex-col gap-1 text-xs">
        {[...fleet.log].reverse().map((line) => (
          <li key={line.id} className={line.tone === "good" ? "text-leaf" : line.tone === "bad" ? "font-bold text-flame-deep" : "text-sheet-mute"}>
            {line.text}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => sendStall("end")} className="min-h-[44px] px-2 text-sm font-bold text-flame-deep">
          End shift
        </button>
      </div>
    </>
  )
}

function Receipt({ fleet }: { fleet: FleetState }) {
  const { sendStall } = useColyseusContext()
  const summary = fleet.summary!
  const profit = summary.net - summary.costs
  return (
    <Card className="mx-auto max-w-md">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-flame-deep">Shift over</div>
      <h1 className="mt-1 text-xl font-black">{profit >= 0 ? `+${formatCoins(profit)} BNG` : `−${formatCoins(-profit)} BNG`}</h1>
      <dl className="mt-3 flex flex-col gap-1 text-sm">
        {[
          ["Runs", `${summary.runs}`],
          ["Dues from riders", formatCoins(summary.dues)],
          ["Special hires", formatCoins(summary.bonuses)],
          ["Advances paid back", formatCoins(summary.repaid)],
          ["Paid to you now", formatCoins(summary.net)],
          ["Repairs, fines and advances", `−${formatCoins(summary.costs)}`],
          ["Profit this shift", `${profit >= 0 ? "+" : "−"}${formatCoins(Math.abs(profit))}`],
          ["Breakdowns", `${summary.breakdowns}`],
          ["Bikes stolen", `${summary.stolen}`]
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-sheet-line pb-1 last:border-0">
            <dt className="text-sheet-mute">{label}</dt>
            <dd className="font-mono font-bold text-sheet-blue">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex gap-2">
        <BackToBase />
        <ActionButton variant="flame" className="flex-[2]" onClick={() => sendStall("again")}>
          Back to the office
        </ActionButton>
      </div>
    </Card>
  )
}
