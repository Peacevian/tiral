import { describe, expect, it } from "vitest"
import {
  DEFAULT_HOUSE,
  MAX_ITEMS,
  isValidHouseLoadout,
  sanitizeHouseLoadout,
  type HouseLoadout
} from "./catalog.js"

describe("isValidHouseLoadout", () => {
  it("accepts the default house", () => {
    expect(isValidHouseLoadout(structuredClone(DEFAULT_HOUSE))).toBe(true)
  })

  it("rejects null, arrays, and primitives", () => {
    for (const value of [null, undefined, 42, "house", [], [DEFAULT_HOUSE]]) {
      expect(isValidHouseLoadout(value)).toBe(false)
    }
  })

  it("rejects missing fields", () => {
    const { items, ...withoutItems } = DEFAULT_HOUSE
    // Everyone starts with an empty room.
    expect(items).toEqual([])
    expect(isValidHouseLoadout(withoutItems)).toBe(false)
  })

  it("rejects off-catalog materials and colors", () => {
    expect(isValidHouseLoadout({ ...DEFAULT_HOUSE, wallMaterial: "gold" })).toBe(false)
    expect(
      isValidHouseLoadout({ ...DEFAULT_HOUSE, colors: { ...DEFAULT_HOUSE.colors, wall: "#000001" } })
    ).toBe(false)
  })

  it("rejects unknown and duplicate furniture ids", () => {
    const unknown = { ...DEFAULT_HOUSE, items: [{ id: "a", item: "throne", x: 0, z: 0, rot: 0, color: "#7f1d1d" }] }
    expect(isValidHouseLoadout(unknown)).toBe(false)
    const duplicate = {
      ...DEFAULT_HOUSE,
      items: [
        { id: "same", item: "chair", x: 0, z: 0, rot: 0, color: "#78350f" },
        { id: "same", item: "lamp", x: 1, z: 0, rot: 0, color: "#f59e0b" }
      ]
    }
    expect(isValidHouseLoadout(duplicate)).toBe(false)
  })

  it("rejects items placed outside the room grid", () => {
    const outOfBounds = {
      ...DEFAULT_HOUSE,
      items: [{ id: "a", item: "chair", x: 6, z: 0, rot: 0, color: "#78350f" }]
    }
    expect(isValidHouseLoadout(outOfBounds)).toBe(false)
  })

  it("rejects items whose footprint overflows the grid", () => {
    const overflow = {
      ...DEFAULT_HOUSE,
      items: [{ id: "a", item: "bed", x: 5, z: 5, rot: 0, color: "#7f1d1d" }]
    }
    expect(isValidHouseLoadout(overflow)).toBe(false)
  })

  it("accounts for rotated footprints", () => {
    const rotated = {
      ...DEFAULT_HOUSE,
      items: [{ id: "a", item: "sofa", x: 4, z: 0, rot: 90, color: "#0f766e" }]
    }
    expect(isValidHouseLoadout(rotated)).toBe(true)
  })

  it("rejects more than the item cap", () => {
    const items = Array.from({ length: MAX_ITEMS + 1 }, (_, index) => ({
      id: `item-${index}`,
      item: "chair" as const,
      x: 0,
      z: 0,
      rot: 0 as const,
      color: "#78350f"
    }))
    expect(isValidHouseLoadout({ ...DEFAULT_HOUSE, items })).toBe(false)
  })
})

describe("sanitizeHouseLoadout", () => {
  it("returns the value when valid", () => {
    const house: HouseLoadout = { ...DEFAULT_HOUSE, wallMaterial: "brick" }
    expect(sanitizeHouseLoadout(house)).toEqual(house)
  })

  it("returns a detached default copy when invalid", () => {
    const sanitized = sanitizeHouseLoadout({ wallMaterial: "gold" })
    expect(sanitized).toEqual(DEFAULT_HOUSE)
    expect(sanitized).not.toBe(DEFAULT_HOUSE)
  })
})
