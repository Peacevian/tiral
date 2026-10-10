import { describe, expect, it } from "vitest"
import { DEFAULT_LOADOUT, isValidLoadout, sanitizeLoadout } from "./catalog.js"

describe("isValidLoadout", () => {
  it("accepts the default loadout", () => {
    expect(isValidLoadout({ ...DEFAULT_LOADOUT })).toBe(true)
  })

  it("rejects null, arrays, and primitives", () => {
    for (const value of [null, undefined, 42, "cap", [], [DEFAULT_LOADOUT]]) {
      expect(isValidLoadout(value)).toBe(false)
    }
  })

  it("rejects missing fields", () => {
    const { hat, ...withoutHat } = DEFAULT_LOADOUT
    expect(hat).toBe("cap")
    expect(isValidLoadout(withoutHat)).toBe(false)
  })

  it("rejects off-catalog colors and unknown hats", () => {
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, shirt: "#000001" })).toBe(false)
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, hat: "crown" })).toBe(false)
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, skin: "red" })).toBe(false)
  })

  it("rejects extra fields only when a required field is invalid", () => {
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, pet: "dog" })).toBe(true)
  })
})

describe("sanitizeLoadout", () => {
  it("returns the value when valid", () => {
    const loadout = { ...DEFAULT_LOADOUT, hat: "safari" as const }
    expect(sanitizeLoadout(loadout)).toEqual(loadout)
  })

  it("returns a default copy when invalid", () => {
    const sanitized = sanitizeLoadout({ shirt: "#000001" })
    expect(sanitized).toEqual(DEFAULT_LOADOUT)
    expect(sanitized).not.toBe(DEFAULT_LOADOUT)
  })
})
