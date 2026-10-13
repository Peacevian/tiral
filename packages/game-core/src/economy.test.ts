import { describe, expect, it } from "vitest"
import {
  DAILY_RACE_EARNINGS_CAP,
  computeRaceEarnings,
  kampalaDay,
  kampalaDayStart,
  streakDaysIncludingToday,
  type RaceEarningInput
} from "./economy.js"

const base: RaceEarningInput = {
  position: 1,
  fieldSize: 4,
  earnedToday: 0,
  wonToday: false,
  firstFinishToday: false,
  streakDays: 1
}

const total = (input: RaceEarningInput) =>
  computeRaceEarnings(input).reduce((sum, earning) => sum + earning.amount, 0)

describe("kampalaDay", () => {
  it("uses UTC+3", () => {
    expect(kampalaDay(new Date("2026-10-14T20:59:00Z"))).toBe("2026-10-14")
    expect(kampalaDay(new Date("2026-10-14T21:00:00Z"))).toBe("2026-10-15")
    expect(kampalaDayStart("2026-10-15").toISOString()).toBe("2026-10-14T21:00:00.000Z")
  })
})

describe("streakDaysIncludingToday", () => {
  it("counts consecutive earlier days", () => {
    expect(streakDaysIncludingToday("2026-10-14", [])).toBe(1)
    expect(streakDaysIncludingToday("2026-10-14", ["2026-10-13", "2026-10-12"])).toBe(3)
    expect(streakDaysIncludingToday("2026-10-14", ["2026-10-12"])).toBe(1)
  })
})

describe("computeRaceEarnings", () => {
  it("pays nothing for solo races", () => {
    expect(computeRaceEarnings({ ...base, fieldSize: 1 })).toEqual([])
  })

  it("pays finish + podium + first win of the day for a winner", () => {
    expect(computeRaceEarnings(base)).toEqual([
      { reason: "race_finish", amount: 1_000 },
      { reason: "race_podium", amount: 5_000 },
      { reason: "first_win_of_day", amount: 2_000 }
    ])
  })

  it("gives no podium bonus to whoever finished last", () => {
    expect(computeRaceEarnings({ ...base, position: 2, fieldSize: 2 })).toEqual([
      { reason: "race_finish", amount: 1_000 }
    ])
    expect(computeRaceEarnings({ ...base, position: 3, fieldSize: 5 })).toContainEqual({
      reason: "race_podium",
      amount: 1_500
    })
  })

  it("pays the first-win bonus once a day", () => {
    expect(total({ ...base, wonToday: true })).toBe(6_000)
  })

  it("pays a capped streak bonus on the first finish of the day", () => {
    expect(computeRaceEarnings({ ...base, position: 4, firstFinishToday: true, streakDays: 3 })).toContainEqual({
      reason: "race_streak",
      amount: 1_500
    })
    expect(computeRaceEarnings({ ...base, position: 4, firstFinishToday: true, streakDays: 30 })).toContainEqual({
      reason: "race_streak",
      amount: 3_500
    })
    expect(
      computeRaceEarnings({ ...base, position: 4, firstFinishToday: false, streakDays: 3 }).some(
        (earning) => earning.reason === "race_streak"
      )
    ).toBe(false)
  })

  it("clips to the daily cap", () => {
    expect(total({ ...base, earnedToday: DAILY_RACE_EARNINGS_CAP - 1_500 })).toBe(1_500)
    expect(computeRaceEarnings({ ...base, earnedToday: DAILY_RACE_EARNINGS_CAP })).toEqual([])
  })
})
