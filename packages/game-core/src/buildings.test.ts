import { describe, expect, it } from "vitest"
import { BUILDING_DESIGNS, BUILDING_DESIGN_IDS, PLOT_SIZE_METERS, ROOF_COLOURS, WALL_COLOURS, buildProgress, buildingCost, checkPlan, cleanSign, ownHouseLook, readBuilding } from "./index.js"

const wall = WALL_COLOURS[0]
const roof = ROOF_COLOURS[0]

describe("building designs", () => {
  it("all fit on a plot, set back from the street", () => {
    for (const id of BUILDING_DESIGN_IDS) {
      const d = BUILDING_DESIGNS[id]
      expect(d.width).toBeLessThanOrEqual(PLOT_SIZE_METERS - 2)
      expect(d.depth + d.setback).toBeLessThanOrEqual(PLOT_SIZE_METERS - 1)
      expect(d.minFloors).toBeLessThanOrEqual(d.maxFloors)
    }
  })

  it("cost more with more floors", () => {
    expect(buildingCost(BUILDING_DESIGNS.flats, 2)).toBe(1_500_000)
    expect(buildingCost(BUILDING_DESIGNS.flats, 6)).toBe(3_500_000)
    expect(buildingCost(BUILDING_DESIGNS.office, 10)).toBe(16_000_000)
  })
})

describe("plans", () => {
  it("accepts a good plan and tidies the sign", () => {
    const check = checkPlan({ design: "shop", floors: 2, wall, roof, sign: "  Mama   Rose  Shop " })
    expect(check.ok && check.plan.sign).toBe("Mama Rose Shop")
    expect(check.ok && check.cost).toBe(600_000)
  })

  it("refuses floors out of range, unknown colours and designs", () => {
    expect(checkPlan({ design: "flats", floors: 7, wall, roof }).ok).toBe(false)
    expect(checkPlan({ design: "house", floors: 1.5, wall, roof }).ok).toBe(false)
    expect(checkPlan({ design: "shop", floors: 1, wall: "#123456", roof }).ok).toBe(false)
    expect(checkPlan({ design: "castle", floors: 1, wall, roof }).ok).toBe(false)
  })

  it("keeps signs short and clean, and only on designs that have one", () => {
    expect(cleanSign("Kampala Best Rolex")).toBe("Kampala Best Rolex")
    expect(cleanSign("x".repeat(25))).toBeNull()
    expect(cleanSign("<script>")).toBeNull()
    expect(cleanSign("Fuck this")).toBeNull()
    expect(cleanSign("Dickson's Hardware")).toBe("Dickson's Hardware")
    const house = checkPlan({ design: "house", floors: 1, wall, roof, sign: "My house" })
    expect(house.ok && house.plan.sign).toBeNull()
  })
})

describe("construction", () => {
  it("goes from 0 to ready over the build time", () => {
    const b = { startedAt: "2026-10-24T00:00:00Z", readyAt: "2026-10-24T10:00:00Z" }
    expect(buildProgress(b, new Date("2026-10-24T05:00:00Z"))).toEqual({ progress: 0.5, ready: false })
    expect(buildProgress(b, new Date("2026-10-24T11:00:00Z"))).toEqual({ progress: 1, ready: true })
  })

  it("reads back what was stored, and nothing broken", () => {
    const stored = { design: "bar", floors: 1, wall, roof, sign: "Club 7", cost: 1_500_000, startedAt: "a", readyAt: "b" }
    expect(readBuilding(stored)?.sign).toBe("Club 7")
    expect(readBuilding({ ...stored, design: "castle" })).toBeNull()
    expect(readBuilding(null)).toBeNull()
  })

  it("a one-floor house looks like a bungalow, two floors a house with a garden", () => {
    expect(ownHouseLook(1)).toBe("ntinda")
    expect(ownHouseLook(2)).toBe("muyenga")
  })
})
