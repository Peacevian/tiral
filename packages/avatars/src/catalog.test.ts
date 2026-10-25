import { describe, expect, it } from "vitest"
import {
  DEFAULT_LOADOUT,
  isValidLoadout,
  itemRarity,
  loadoutRarity,
  resolveLoadout,
  sanitizeLoadout
} from "./catalog.js"

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

  it("accepts loadouts saved before shoes and glasses existed", () => {
    const { shoes, glasses, ...legacy } = DEFAULT_LOADOUT
    expect(shoes).toBeDefined()
    expect(glasses).toBeDefined()
    expect(isValidLoadout(legacy)).toBe(true)
  })

  it("accepts loadouts saved before hair, outfits and trails existed", () => {
    const { hair, hairColor, outfit, trail, ...legacy } = DEFAULT_LOADOUT
    expect([hair, hairColor, outfit, trail].every((v) => v !== undefined)).toBe(true)
    expect(isValidLoadout(legacy)).toBe(true)
  })

  it("validates optional hair, outfit and trail when present", () => {
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, hair: "mohawk" })).toBe(false)
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, hairColor: "#000001" })).toBe(false)
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, outfit: "tuxedo" })).toBe(false)
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, trail: "rainbow" })).toBe(false)
    expect(
      isValidLoadout({ ...DEFAULT_LOADOUT, hair: "locs", outfit: "kanzu", trail: "flag", hat: "headwrap" })
    ).toBe(true)
  })

  it("validates optional shoes and glasses when present", () => {
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, shoes: "#000001" })).toBe(false)
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, glasses: "monocle" })).toBe(false)
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, shoes: "#b91c1c", glasses: "round" })).toBe(true)
  })

  it("accepts either body and rejects others", () => {
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, body: "female" })).toBe(true)
    expect(isValidLoadout({ ...DEFAULT_LOADOUT, body: "robot" })).toBe(false)
    const { body: _body, ...legacy } = DEFAULT_LOADOUT
    expect(isValidLoadout(legacy)).toBe(true)
    expect(resolveLoadout(legacy).body).toBe("male")
  })
})

describe("resolveLoadout", () => {
  it("fills missing hair, outfit and trail with defaults", () => {
    const resolved = resolveLoadout({ ...DEFAULT_LOADOUT, hair: undefined, outfit: undefined, trail: undefined })
    expect(resolved.hair).toBe("short")
    expect(resolved.outfit).toBe("shirt")
    expect(resolved.trail).toBe("none")
  })

  it("fills missing shoes and glasses with defaults", () => {
    const { shoes, glasses, ...legacy } = DEFAULT_LOADOUT
    const resolved = resolveLoadout(legacy)
    expect(resolved.shoes).toBe(DEFAULT_LOADOUT.shoes)
    expect(resolved.glasses).toBe("none")
  })
})

describe("rarity", () => {
  it("treats unlisted items as common", () => {
    expect(itemRarity("outfit", "shirt")).toBe("common")
    expect(loadoutRarity(DEFAULT_LOADOUT)).toBe("common")
  })

  it("takes the highest rarity across equipped items", () => {
    expect(loadoutRarity({ ...DEFAULT_LOADOUT, hair: "afro" })).toBe("rare")
    expect(loadoutRarity({ ...DEFAULT_LOADOUT, hair: "afro", trail: "fire" })).toBe("legendary")
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
