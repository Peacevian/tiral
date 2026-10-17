import { describe, expect, it } from "vitest"
import { NO_LADDER_PROGRESS, gigLockedText, isGigUnlocked, ladderSteps, type LadderCounts } from "./ladder.js"

const counts = (partial: Partial<LadderCounts>): LadderCounts => ({ ...NO_LADDER_PROGRESS, ...partial })

describe("hustle ladder", () => {
  it("starts everyone as a porter, everything else closed", () => {
    const steps = ladderSteps(NO_LADDER_PROGRESS)
    expect(steps.map((step) => [step.gig, step.unlocked])).toEqual([
      ["porter", true],
      ["carwash", false],
      ["boda", false],
      ["rolex", false],
      ["live", false]
    ])
  })

  it("opens the car wash after 5 porter loads", () => {
    expect(isGigUnlocked("carwash", counts({ porter: 4 }))).toBe(false)
    expect(isGigUnlocked("carwash", counts({ porter: 5 }))).toBe(true)
  })

  it("counts porter loads and cars washed together for the boda", () => {
    expect(isGigUnlocked("boda", counts({ porter: 10, carwash: 4 }))).toBe(false)
    expect(isGigUnlocked("boda", counts({ porter: 10, carwash: 5 }))).toBe(true)
  })

  it("opens the rolex stand after 20 boda trips, and live after 5 rolex shifts", () => {
    expect(isGigUnlocked("rolex", counts({ boda: 19 }))).toBe(false)
    expect(isGigUnlocked("rolex", counts({ boda: 20 }))).toBe(true)
    expect(isGigUnlocked("live", counts({ rolexShifts: 5 }))).toBe(true)
  })

  it("never gates gigs that aren't on the ladder (and the porter)", () => {
    expect(isGigUnlocked("porter", NO_LADDER_PROGRESS)).toBe(true)
    expect(isGigUnlocked("race", NO_LADDER_PROGRESS)).toBe(true)
  })

  it("caps progress at the target and says what's left", () => {
    const boda = ladderSteps(counts({ porter: 40 })).find((step) => step.gig === "boda")!
    expect(boda.progress).toEqual({ have: 15, need: 15, label: "jobs" })
    expect(gigLockedText("carwash", counts({ porter: 2 }))).toBe("Do 3 more porter loads to wash cars.")
    expect(gigLockedText("carwash", counts({ porter: 4 }))).toBe("Do 1 more porter load to wash cars.")
    expect(gigLockedText("carwash", counts({ porter: 5 }))).toBeNull()
  })

  it("marks LivTok as needing TikTok", () => {
    const live = ladderSteps(NO_LADDER_PROGRESS).find((step) => step.gig === "live")!
    expect(live.needsTikTok).toBe(true)
    expect(live.comingSoon).toBe(false)
  })
})
