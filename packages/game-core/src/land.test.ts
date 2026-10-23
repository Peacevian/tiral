import { describe, expect, it } from "vitest"
import {
  MAX_RENT_WEEKS_AHEAD,
  PLOT_AREAS,
  RENT_WEEK_MS,
  allPlots,
  claimCost,
  findPlot,
  plotId,
  rentState,
  rentWeeksPayable,
  weeklyGroundRent
} from "./land.js"

describe("land plots", () => {
  const plots = allPlots()

  it("has plots in both areas, each with a unique id and a price", () => {
    expect(plots.some((p) => p.area === "central")).toBe(true)
    expect(plots.some((p) => p.area === "lugogo")).toBe(true)
    expect(new Set(plots.map((p) => p.id)).size).toBe(plots.length)
    for (const p of plots) expect(p.price).toBeGreaterThan(0)
  })

  it("puts every plot inside its area, about 20 m across", () => {
    for (const p of plots) {
      const b = PLOT_AREAS[p.area].bounds
      expect(p.center.lat).toBeGreaterThan(b.south)
      expect(p.center.lat).toBeLessThan(b.north)
      expect(p.center.lng).toBeGreaterThan(b.west)
      expect(p.center.lng).toBeLessThan(b.east)
      const [nw, ne, , sw] = p.corners
      const wide = (ne.lng - nw.lng) * 111_320 * Math.cos((p.center.lat * Math.PI) / 180)
      const tall = (nw.lat - sw.lat) * 110_574
      expect(wide).toBeGreaterThan(19.5)
      expect(wide).toBeLessThan(20.5)
      expect(tall).toBeGreaterThan(19.5)
      expect(tall).toBeLessThan(20.5)
    }
  })

  it("finds plots by id", () => {
    const p = plots[0]!
    expect(findPlot(plotId(p.gx, p.gy))).toEqual(p)
    expect(findPlot("9999_9999")).toBeNull()
  })

  it("prices main-road plots above back plots in the same area", () => {
    const central = plots.filter((p) => p.area === "central")
    const top = Math.max(...central.filter((p) => p.frontage === "main").map((p) => p.price))
    const back = Math.max(...central.filter((p) => p.frontage === "back").map((p) => p.price))
    expect(top).toBeGreaterThan(back)
  })
})

describe("ground rent", () => {
  it("is 1% a week, rounded, and claiming pays the first week", () => {
    expect(weeklyGroundRent(2_000_000)).toBe(20_000)
    expect(weeklyGroundRent(50_000)).toBe(1_000)
    expect(claimCost({ price: 2_000_000 })).toBe(2_020_000)
  })

  it("is paid, then overdue for four weeks, then lapsed", () => {
    const now = new Date("2026-10-24T12:00:00Z")
    const at = (weeks: number) => new Date(now.getTime() + weeks * RENT_WEEK_MS)
    expect(rentState(at(1), now)).toBe("paid")
    expect(rentState(at(-1), now)).toBe("overdue")
    expect(rentState(at(-4), now)).toBe("overdue")
    expect(rentState(at(-4.01), now)).toBe("lapsed")
  })

  it("can be paid up to eight weeks ahead, owed weeks included, never once lapsed", () => {
    const now = new Date("2026-10-24T12:00:00Z")
    const at = (weeks: number) => new Date(now.getTime() + weeks * RENT_WEEK_MS)
    expect(rentWeeksPayable(at(1), now)).toBe(MAX_RENT_WEEKS_AHEAD - 1)
    expect(rentWeeksPayable(at(-2), now)).toBe(MAX_RENT_WEEKS_AHEAD + 2)
    expect(rentWeeksPayable(at(MAX_RENT_WEEKS_AHEAD), now)).toBe(0)
    expect(rentWeeksPayable(at(-5), now)).toBe(0)
  })
})
