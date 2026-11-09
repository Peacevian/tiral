import { describe, expect, it } from "vitest"
import { buildChart } from "./chart"
import type { PartId } from "./parts"
import { advance, createRound, marketCap, tap, type Round } from "./round"

function play(taps: { at: number; part: PartId }[], until = 60_000, seed = 1): Round {
  let state = createRound(seed)
  let time = 0
  for (const step of taps) {
    state = advance(state, step.at - time)
    time = state.t
    if (state.ended) return state
    state = tap(state, step.part)
    if (state.ended) return state
  }
  if (!state.ended && until > state.t) state = advance(state, until - state.t)
  return state
}

const clean = [
  { at: 4_500, part: "pea" as const },
  { at: 8_500, part: "dick" as const },
  { at: 17_000, part: "icp" as const },
  { at: 22_500, part: "plug" as const },
  { at: 26_500, part: "anal" as const },
  { at: 34_500, part: "boobs" as const },
  { at: 42_500, part: "sh1t" as const },
  { at: 48_500, part: "pea" as const },
  { at: 52_500, part: "dick" as const },
  { at: 56_000, part: "cum" as const }
]

describe("a clean round", () => {
  const state = play(clean, 56_000)

  it("finishes in the end zone", () => {
    expect(state.ended).toBe("clear")
    expect(state.cumFired).toBe(true)
    expect(state.plugIn).toBe(false)
    expect(state.health).toBe(3)
  })

  it("keeps the multiplier from the seated plug", () => {
    expect(state.multiplier).toBeGreaterThanOrEqual(2)
  })

  it("writes the teamwork chart", () => {
    const chart = buildChart(state)
    expect(chart.title).toBe("Teamwork.")
    expect(chart.close).toBe("The body finished in one piece.")
    expect(chart.findings).toContainEqual({ part: "$DICK", text: "claims he carried" })
    expect(chart.findings).toContainEqual({ part: "$BOOBS", text: "claims she carried" })
    expect(chart.findings).toContainEqual({ part: "$AGENTCUCK", text: "claims he carried" })
    expect(chart.findings).toContainEqual({ part: "$PLUG", text: "removed on order" })
    expect(chart.findings).toContainEqual({ part: "$ANAL", text: "shortcut clear" })
    expect(chart.findings).toContainEqual({ part: "$DOMX", text: "orders followed, 7 of 7" })
  })
})

describe("endings", () => {
  it("ends early when $CUM is pressed before the end zone", () => {
    const state = play([{ at: 1_000, part: "cum" }], 1_000)
    const chart = buildChart(state)
    expect(state.ended).toBe("early")
    expect(chart.title).toBe("Early.")
    expect(chart.close).toBe("Time of death: early.")
    expect(chart.findings).toContainEqual({ part: "$CUM", text: "early" })
    expect(chart.findings).toContainEqual({ part: "$AGENTCUCK", text: "I was watching." })
  })

  it("pays the month bonus when the body waits the minute out", () => {
    const state = play(clean.slice(0, -1))
    const chart = buildChart(state)
    expect(state.ended).toBe("clear")
    expect(state.cumFired).toBe(false)
    expect(chart.title).toBe("Lasted.")
    expect(chart.findings).toContainEqual({ part: "$NONUT", text: "lasted" })
    expect(marketCap(state)).toBeGreaterThan(marketCap({ ...state, cumFired: true, ended: "clear" }))
  })

  it("goes down if every hit lands", () => {
    const state = play([])
    expect(state.ended).toBe("down")
    expect(state.health).toBe(0)
    expect(buildChart(state).title).toBe("Down.")
  })
})

describe("the plug", () => {
  it("pops at 36s and takes the multiplier with it", () => {
    const before = play([], 35_900)
    const after = advance(before, 200)
    expect(before.plugIn).toBe(true)
    expect(before.ended).toBeNull()
    expect(after.plugIn).toBe(false)
    expect(after.log.some((line) => line.text === "The plug left.")).toBe(true)
    expect(marketCap(after)).toBeLessThan(marketCap(before))
    expect(buildChart(after).findings).toContainEqual({ part: "$PLUG", text: "left on its own" })
  })

  it("refuses the shortcut while the plug is seated", () => {
    const state = play([
      { at: 4_500, part: "pea" },
      { at: 8_500, part: "dick" },
      { at: 17_000, part: "icp" },
      { at: 26_500, part: "anal" }
    ], 26_500)
    expect(state.log.some((line) => line.text === "The plug is in.")).toBe(true)
    expect(state.plugIn).toBe(true)
    expect(state.ended).toBeNull()
  })
})

describe("$FUCK", () => {
  it("either cancels the next problem or flattens the multiplier", () => {
    const state = play([{ at: 1_000, part: "fuck" }], 1_000)
    const cancelled = state.beats.some((beat) => beat.status === "cancelled")
    const locked = state.multiplierLocked
    expect(cancelled || locked).toBe(true)
    expect(state.log.some((line) => line.text === "No fucks.")).toBe(true)
  })
})
