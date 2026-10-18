import { describe, expect, it } from "vitest"
import { FURNITURE, FURNITURE_GRADES, type HouseLoadout, DEFAULT_HOUSE } from "./catalog.js"
import { FLOOR_FEE, FURNITURE_PRICES, PAINT_FEE, homeComfort, houseChangeFee, movingFee, sellBackPrice } from "./shop.js"

describe("Furniture shop", () => {
  it("prices every piece at every market, rising with the grade", () => {
    for (const spec of FURNITURE) {
      const prices = FURNITURE_GRADES.map((grade) => FURNITURE_PRICES[spec.id][grade])
      expect([...prices].sort((a, b) => a - b)).toEqual(prices)
      expect(prices[0]).toBeGreaterThan(0)
    }
  })

  it("buys back at half, in whole thousands", () => {
    expect(sellBackPrice(120_000)).toBe(60_000)
    expect(sellBackPrice(15_000)).toBe(7_000)
    expect(sellBackPrice(-5)).toBe(0)
  })

  it("charges the painter and the fundi only for what changed", () => {
    const after: HouseLoadout = { ...DEFAULT_HOUSE, colors: { ...DEFAULT_HOUSE.colors, wall: "#000000" } }
    expect(houseChangeFee(DEFAULT_HOUSE, DEFAULT_HOUSE)).toEqual({ paint: 0, floor: 0 })
    expect(houseChangeFee(DEFAULT_HOUSE, after)).toEqual({ paint: PAINT_FEE, floor: 0 })
    expect(houseChangeFee(DEFAULT_HOUSE, { ...DEFAULT_HOUSE, floorMaterial: "wood" })).toEqual({ paint: 0, floor: FLOOR_FEE })
    expect(houseChangeFee(null, after)).toEqual({ paint: 0, floor: 0 })
  })

  it("moves more things by bigger transport", () => {
    expect(movingFee(0).fee).toBe(0)
    expect(movingFee(2).by).toBe("a boda")
    expect(movingFee(8).by).toBe("a pickup")
    expect(movingFee(20).by).toBe("a lorry")
  })

  it("a better bed rests you faster; a sofa and TV calm you", () => {
    const at = { x: 0, z: 0, rot: 0 as const, color: "#7f1d1d" }
    expect(homeComfort([]).restFactor).toBeLessThan(1)
    expect(homeComfort([{ id: "a", item: "bed", ...at }]).restFactor).toBe(1)
    expect(homeComfort([{ id: "a", item: "bed", grade: "owino", ...at }, { id: "b", item: "bed", grade: "acacia", ...at }]).restFactor).toBe(1.3)
    expect(homeComfort([]).calmFactor).toBe(1)
    expect(homeComfort([{ id: "s", item: "sofa", grade: "kikuubo", ...at }, { id: "t", item: "television", grade: "acacia", ...at }]).calmFactor).toBe(1.7)
  })
})
