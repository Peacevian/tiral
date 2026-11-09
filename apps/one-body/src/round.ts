import { COURSE_01, PROMPTS, type Beat, type BeatKind } from "./course"
import { PARTS, type PartId } from "./parts"

export const ROUND_MS = 60_000
export const END_ZONE_MS = 55_000
export const PLUG_POP_MS = 36_000

const SPEED = 14
const SLOW_SPEED = 3
const CARRY_SPEED = 5
const BLADDER_PER_MS = 3.75 / 1000
const PRESSURE_PER_MS = 100 / PLUG_POP_MS
const WARN_BONUS_MS = 600
const BANNER_MS = 1_800
const EPS = 1e-4

export type BeatStatus = "pending" | "open" | "done" | "missed" | "cancelled"

export type BeatState = Beat & { status: BeatStatus }

export type LogKind = "success" | "blame" | "note"

export type LogLine = {
  at: number
  part: PartId
  kind: LogKind
  text: string
}

export type Ending = "clear" | "early" | "down"

export type Round = {
  t: number
  position: number
  multiplier: number
  plugIn: boolean
  plugPressure: number
  bladder: number
  bladderSettled: boolean
  carrying: boolean
  health: number
  pobReady: boolean
  deeReady: boolean
  bepeesUntil: number
  warned: boolean
  flatNext: boolean
  multiplierLocked: boolean
  cumFired: boolean
  ended: Ending | null
  dickUntil: number
  slowUntil: number
  ordersTotal: number
  ordersHit: number
  seed: number
  beats: BeatState[]
  log: LogLine[]
  banner: { part: PartId; text: string; until: number } | null
}

export function createRound(seed = 1): Round {
  return {
    t: 0,
    position: 0,
    multiplier: 1,
    plugIn: true,
    plugPressure: 0,
    bladder: 10,
    bladderSettled: false,
    carrying: false,
    health: 3,
    pobReady: true,
    deeReady: true,
    bepeesUntil: 0,
    warned: false,
    flatNext: false,
    multiplierLocked: false,
    cumFired: false,
    ended: null,
    dickUntil: 0,
    slowUntil: 0,
    ordersTotal: 0,
    ordersHit: 0,
    seed: seed >>> 0,
    beats: COURSE_01.map((beat) => ({ ...beat, status: "pending" })),
    log: [],
    banner: null
  }
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function formatRemaining(ms: number): string {
  return formatClock(Math.ceil(Math.max(0, ms) / 1000) * 1000)
}

export function formatCap(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString("en-US")
}

export function marketCap(round: Round): number {
  let cap = Math.round(round.position * Math.max(1, round.multiplier))
  if (round.ended === "clear") cap += 180
  if (round.ended === "clear" && !round.cumFired) cap += 400
  return cap
}

export function openBeat(round: Round): BeatState | undefined {
  return round.beats.find((beat) => beat.status === "open")
}

export function hotParts(round: Round): PartId[] {
  if (round.ended) return []
  const open = openBeat(round)
  if (!open) return []
  const hot: PartId[] = [open.part, "domx"]
  if (open.kind === "impact") {
    if (round.pobReady) hot.push("pob")
    if (round.deeReady) hot.push("dee")
  }
  return hot
}

export function partLabel(round: Round, part: PartId): string {
  const open = openBeat(round)
  if (!round.ended && open?.part === part) return "TAP"
  if (part === "dick" && round.dickUntil > round.t) {
    return `${Math.ceil((round.dickUntil - round.t) / 1000)}s`
  }
  if (part === "pob") return round.pobReady ? "SOAK" : "OUT"
  if (part === "dee") return round.deeReady ? "DECOY" : "USED"
  if (part === "plug") return round.plugIn ? "SEATED" : "OUT"
  if (part === "icp") return round.bladder >= 65 ? "HIGH" : "FINE"
  if (part === "sh1t") return round.carrying ? "HOLDING" : "READY"
  if (part === "domx") return open && !round.ended ? "SPEAKING" : "QUIET"
  if (part === "fuck") return "PANIC"
  if (part === "nonut") return !round.cumFired && round.t >= END_ZONE_MS ? "LASTED" : "QUIET"
  if (part === "cum") return round.ended === "early" ? "EARLY" : "WEN"
  if (part === "pea") return "WATCHING"
  if (part === "anal") return "SHORTCUT"
  return "READY"
}

export type PartTone = "hot" | "cool" | "warn" | "cum" | "idle"

export function partTone(round: Round, part: PartId): PartTone {
  if (part === "cum") return "cum"
  const label = partLabel(round, part)
  if (label === "TAP" || label === "SPEAKING") return "hot"
  if (label === "HIGH") return "warn"
  if (label === "OUT" || label === "USED" || /^\d+s$/.test(label)) return "cool"
  return "idle"
}

export function subtitle(round: Round): { ticker: string; line: string } {
  if (round.banner && round.t < round.banner.until) {
    return { ticker: PARTS[round.banner.part].ticker, line: round.banner.text }
  }
  const open = openBeat(round)
  if (open) return PROMPTS[open.kind]
  if (!round.ended && round.t >= END_ZONE_MS) return { ticker: "$NONUT", line: "Lasted." }
  if (round.ended === "early") return { ticker: "$CUM", line: "Early." }
  if (round.ended === "down") return { ticker: "$BEPEES", line: "Still making noise." }
  if (round.ended === "clear") return { ticker: "$DOMX", line: "Good." }
  return { ticker: "$DOMX", line: "Hold." }
}

export function healthLabel(round: Round): string {
  if (round.health >= 3) return "whole"
  if (round.health === 2) return "tender"
  if (round.health === 1) return "barely"
  return "down"
}

export function advance(round: Round, ms: number): Round {
  if (ms <= 0 || round.ended) return round
  let state = round
  let left = ms
  let guard = 0
  while (left > EPS && !state.ended && state.t < ROUND_MS - EPS && guard < 80) {
    guard += 1
    state = resolveDue(state)
    if (state.ended) break
    const wait = Math.min(left, timeUntilDue(state))
    if (wait <= EPS) break
    state = drift(state, wait)
    left -= wait
  }
  if (!state.ended) state = resolveDue(state)
  return state
}

export function tap(round: Round, part: PartId): Round {
  if (round.ended) return round
  if (part === "cum") return pressCum(round)
  if (part === "fuck") return pressFuck(round)
  if (part === "domx" || part === "nonut" || part === "agentcuck" || part === "bepees") return round

  if (part === "plug" && round.plugIn) return pullPlug(round)

  const open = openBeat(round)
  if (open?.kind === "impact" && (part === "pob" || part === "dee")) {
    return soak(round, open, part)
  }
  if (open && open.part === part) return succeed(round, open)
  if (open) return disobey(round)
  return round
}

function drift(round: Round, dt: number): Round {
  let speed = SPEED
  if (round.carrying) speed = CARRY_SPEED
  if (round.t < round.slowUntil) speed = SLOW_SPEED

  let plugPressure = round.plugPressure
  let multiplier = round.multiplier
  if (round.plugIn) {
    plugPressure = Math.min(100, round.plugPressure + PRESSURE_PER_MS * dt)
    multiplier = round.multiplierLocked ? 1 : Math.min(4, 1 + Math.floor(plugPressure / 25))
  }

  let bladder = round.bladder
  if (!round.bladderSettled) {
    bladder = Math.min(100, round.bladder + BLADDER_PER_MS * dt)
  }

  return {
    ...round,
    t: round.t + dt,
    position: round.position + (speed * dt) / 1000,
    plugPressure,
    multiplier,
    bladder
  }
}

function timeUntilDue(round: Round): number {
  const times = [Math.max(0, ROUND_MS - round.t)]
  for (const beat of round.beats) {
    if (beat.status === "pending") times.push(beat.at - round.t)
    if (beat.status === "open") times.push(beat.at + beat.window - round.t)
  }
  if (round.plugIn && round.plugPressure < 100) {
    times.push((100 - round.plugPressure) / PRESSURE_PER_MS)
  }
  const future = times.filter((time) => time > EPS)
  return future.length === 0 ? ROUND_MS : Math.min(...future)
}

function resolveDue(round: Round): Round {
  let state = round
  if (state.plugIn && state.plugPressure >= 100 - EPS) {
    state = popPlug(state)
    if (state.ended) return state
  }
  state = openDue(state)
  state = closeDue(state)
  if (!state.ended && state.t >= ROUND_MS - EPS) state = finishClear(state, false)
  return state
}

function openDue(round: Round): Round {
  let state = round
  for (const beat of round.beats) {
    if (beat.status !== "pending" || beat.at > state.t + EPS) continue
    let window = beat.window
    let warned = state.warned
    if (beat.kind === "wall" && warned) {
      window += WARN_BONUS_MS
      warned = false
    }
    const opened: BeatState = { ...beat, window, status: "open" }
    const ordersTotal = beat.kind === "warn" ? state.ordersTotal : state.ordersTotal + 1
    state = { ...state, warned, ordersTotal, beats: replaceBeat(state.beats, opened) }
    if (beat.kind === "unplug" && !state.plugIn) {
      state = complete(state, opened, "success", "Already out.")
    }
  }
  return state
}

function closeDue(round: Round): Round {
  let state = round
  for (const beat of [...state.beats]) {
    if (state.ended) break
    if (beat.status !== "open") continue
    if (state.t + EPS < beat.at + beat.window) continue
    state = miss(state, beat)
  }
  return state
}

function succeed(round: Round, beat: BeatState): Round {
  if (beat.kind === "shortcut" && round.plugIn) {
    return say(round, "anal", "blame", "The plug is in.")
  }
  return complete(round, beat, "success", successText(beat.kind))
}

function miss(round: Round, beat: BeatState): Round {
  return complete(round, beat, "miss", missText(round, beat.kind))
}

function complete(round: Round, beat: BeatState, how: "success" | "miss", text: string): Round {
  const status: BeatStatus = how === "success" ? "done" : "missed"
  let state: Round = {
    ...round,
    beats: replaceBeat(round.beats, { ...beat, status }),
    ordersHit: how === "success" && beat.kind !== "warn" ? round.ordersHit + 1 : round.ordersHit
  }
  const part = speaker(beat.kind, how)
  state = say(state, part, how === "success" ? "success" : "blame", text)
  if (how === "miss") return applyMiss(state, beat.kind)
  return applySuccess(state, beat.kind)
}

function applySuccess(round: Round, kind: BeatKind): Round {
  if (kind === "warn") return { ...round, warned: true }
  if (kind === "wall") {
    const moved = gain(round, 100)
    return { ...moved, dickUntil: round.t + 2_000 }
  }
  if (kind === "release") return { ...gain(round, 60), bladder: 15, bladderSettled: true }
  if (kind === "unplug") return { ...round, plugIn: false }
  if (kind === "shortcut") return gain(round, 140)
  if (kind === "impact") return round
  if (kind === "puddle") return { ...round, carrying: false }
  return round
}

function applyMiss(round: Round, kind: BeatKind): Round {
  if (kind === "warn") return round
  if (kind === "wall" || kind === "impact") return strike({ ...round, slowUntil: round.t + 2_000 })
  if (kind === "release") {
    return { ...round, bladder: 40, bladderSettled: true, slowUntil: round.t + 2_000 }
  }
  if (kind === "unplug") return { ...round, flatNext: true }
  if (kind === "shortcut") return { ...round, slowUntil: round.t + 1_500 }
  if (kind === "puddle") return { ...round, carrying: true }
  return round
}

function soak(round: Round, beat: BeatState, part: "pob" | "dee"): Round {
  if (part === "pob" && !round.pobReady) return disobey(round)
  if (part === "dee" && !round.deeReady) return disobey(round)
  let state = complete(round, beat, "success", part === "dee" ? "Deez." : "Absorbed.")
  if (part === "pob") state = { ...state, pobReady: false }
  if (part === "dee") state = { ...state, deeReady: false }
  return state
}

function pullPlug(round: Round): Round {
  const open = openBeat(round)
  const next = { ...round, plugIn: false }
  if (open?.kind === "unplug") return complete(next, open, "success", "On order.")
  return say(next, "plug", "note", "Out early.")
}

function popPlug(round: Round): Round {
  return say({ ...round, plugIn: false, multiplier: 1 }, "plug", "blame", "The plug left.")
}

function pressCum(round: Round): Round {
  if (round.t >= END_ZONE_MS) return finishClear(round, true)
  return say({ ...round, cumFired: true, ended: "early" }, "cum", "blame", "Early.")
}

function finishClear(round: Round, fired: boolean): Round {
  const text = fired ? "Wen." : "Lasted."
  const part: PartId = fired ? "cum" : "nonut"
  return say({ ...round, cumFired: fired, ended: "clear" }, part, "success", text)
}

function pressFuck(round: Round): Round {
  const rolled = nextRoll(round.seed)
  let state: Round = { ...round, seed: rolled.seed }
  if (rolled.roll < 0.5) {
    const open = state.beats.find((beat) => beat.status === "open")
    const pending = state.beats.find((beat) => beat.status === "pending")
    const target = open ?? pending
    if (target) {
      state = {
        ...state,
        beats: replaceBeat(state.beats, { ...target, status: "cancelled" })
      }
    }
  } else {
    state = { ...state, multiplier: 1, multiplierLocked: true }
  }
  return say(state, "fuck", "note", "No fucks.")
}

function disobey(round: Round): Round {
  const open = openBeat(round)
  const text = open?.kind === "unplug" ? "I said unplug." : "Listen."
  return say({ ...round, flatNext: true }, "domx", "blame", text)
}

function strike(round: Round): Round {
  if (round.health <= 1) {
    return say({ ...round, health: 0, ended: "down", bepeesUntil: round.t + 3_000 }, "bepees", "blame", "Still making noise.")
  }
  return { ...round, health: round.health - 1, bepeesUntil: round.t + 3_000 }
}

function gain(round: Round, amount: number): Round {
  if (round.flatNext) return { ...round, flatNext: false }
  return { ...round, position: round.position + amount }
}

function say(round: Round, part: PartId, kind: LogKind, text: string): Round {
  return {
    ...round,
    log: [...round.log, { at: round.t, part, kind, text }],
    banner: { part, text, until: round.t + BANNER_MS }
  }
}

function successText(kind: BeatKind): string {
  if (kind === "warn") return "Wall."
  if (kind === "wall") return "In charge."
  if (kind === "release") return "In the green."
  if (kind === "unplug") return "On order."
  if (kind === "shortcut") return "Clear."
  if (kind === "impact") return "Blocked."
  return "Dropped."
}

function missText(round: Round, kind: BeatKind): string {
  if (kind === "warn") return "I blinked."
  if (kind === "wall") return "Finished before the wall."
  if (kind === "release") return "I see it."
  if (kind === "unplug") return "I said unplug."
  if (kind === "shortcut") return round.plugIn ? "The plug is in." : "Clearance 99%."
  if (kind === "impact") return "Watched."
  return "Still carrying."
}

function speaker(kind: BeatKind, how: "success" | "miss"): PartId {
  if (kind === "warn") return "pea"
  if (kind === "wall") return "dick"
  if (kind === "release") return "icp"
  if (kind === "unplug") return how === "success" ? "plug" : "domx"
  if (kind === "shortcut") return "anal"
  if (kind === "impact") return "boobs"
  return "sh1t"
}

function replaceBeat(beats: BeatState[], next: BeatState): BeatState[] {
  return beats.map((beat) => (beat.id === next.id ? next : beat))
}

function nextRoll(seed: number): { roll: number; seed: number } {
  let state = seed >>> 0
  state = (state + 0x6d2b79f5) >>> 0
  let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
  const roll = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  return { roll, seed: state }
}
