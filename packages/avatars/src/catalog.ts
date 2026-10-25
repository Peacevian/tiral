export const SKIN_TONES = [
  "#f2bd8c",
  "#e0a173",
  "#c68642",
  "#8d5524",
  "#5c3836"
] as const

export const SHIRT_COLORS = [
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#e7e5e4"
] as const

export const PANTS_COLORS = [
  "#27364d",
  "#1c1917",
  "#3f6212",
  "#0c4a6e",
  "#713f12",
  "#831843"
] as const

export const HAT_STYLES = ["cap", "beanie", "safari", "helmet", "headwrap", "none"] as const
export type HatStyle = (typeof HAT_STYLES)[number]

export const HAT_COLORS = [
  "#92400e",
  "#b91c1c",
  "#15803d",
  "#1d4ed8",
  "#6b21a8",
  "#be185d",
  "#0f766e",
  "#292524"
] as const

export const BACKPACK_COLORS = [
  "#92400e",
  "#7f1d1d",
  "#14532d",
  "#1e3a8a",
  "#581c87",
  "#78350f"
] as const

export const SHOE_COLORS = [
  "#26211c",
  "#e7e5e4",
  "#b91c1c",
  "#1e3a8a",
  "#14532d",
  "#f59e0b"
] as const

// The figure itself: the young man or the young woman (the realistic
// characters). Older loadouts have none and get the man.
export const BODIES = ["male", "female"] as const
export type Body = (typeof BODIES)[number]

export const GLASSES_STYLES = ["none", "round", "square"] as const
export type GlassesStyle = (typeof GLASSES_STYLES)[number]

export const HAIR_STYLES = ["short", "fade", "afro", "locs", "braids", "bald"] as const
export type HairStyle = (typeof HAIR_STYLES)[number]

export const HAIR_COLORS = ["#1c1410", "#2b2118", "#4a2f1d", "#8a5a2b", "#d4a017", "#b91c1c"] as const

// Outfits change the body shape, not just the colour. Most are tinted by the
// shirt colour; "cranes" (Uganda kit) and "bodavest" carry fixed colours.
export const OUTFITS = [
  "shirt",
  "jersey",
  "tracksuit",
  "hoodie",
  "kitenge",
  "bodavest",
  "kanzu",
  "gomesi",
  "cranes"
] as const
export type Outfit = (typeof OUTFITS)[number]

// Race-only effect left behind while running.
export const TRAILS = ["none", "dust", "sparks", "fire", "flag"] as const
export type Trail = (typeof TRAILS)[number]

export const RARITIES = ["common", "rare", "epic", "legendary"] as const
export type Rarity = (typeof RARITIES)[number]

export const RARITY_COLORS: Record<Rarity, string> = {
  common: "#94a3b8",
  rare: "#38bdf8",
  epic: "#c084fc",
  legendary: "#fbbf24"
}

// Rarity per item, keyed "<slot>:<id>". Anything unlisted is common.
// Everything is free today; rarity sets the glow and future BNG prices.
export const ITEM_RARITY: Record<string, Rarity> = {
  "outfit:jersey": "rare",
  "outfit:tracksuit": "rare",
  "outfit:hoodie": "rare",
  "outfit:kitenge": "epic",
  "outfit:bodavest": "rare",
  "outfit:kanzu": "epic",
  "outfit:gomesi": "epic",
  "outfit:cranes": "legendary",
  "hair:afro": "rare",
  "hair:locs": "epic",
  "hair:braids": "epic",
  "hat:helmet": "rare",
  "hat:headwrap": "rare",
  "trail:dust": "rare",
  "trail:sparks": "epic",
  "trail:fire": "legendary",
  "trail:flag": "legendary"
}

export function itemRarity(slot: "outfit" | "hair" | "hat" | "trail" | "glasses", id: string): Rarity {
  return ITEM_RARITY[`${slot}:${id}`] ?? "common"
}

/** Highest rarity across everything equipped — drives the in-race glow. */
export function loadoutRarity(loadout: AvatarLoadout): Rarity {
  const resolved = resolveLoadout(loadout)
  const ranks = [
    itemRarity("outfit", resolved.outfit),
    itemRarity("hair", resolved.hair),
    itemRarity("hat", resolved.hat),
    itemRarity("trail", resolved.trail),
    itemRarity("glasses", resolved.glasses)
  ].map((rarity) => RARITIES.indexOf(rarity))
  return RARITIES[Math.max(...ranks)] ?? "common"
}

export type AvatarLoadout = {
  body?: Body
  skin: string
  shirt: string
  pants: string
  hat: HatStyle
  hatColor: string
  backpack: string
  shoes?: string
  glasses?: GlassesStyle
  hair?: HairStyle
  hairColor?: string
  outfit?: Outfit
  trail?: Trail
}

export const DEFAULT_LOADOUT: AvatarLoadout = {
  body: "male",
  skin: "#f2bd8c",
  shirt: "#f59e0b",
  pants: "#27364d",
  hat: "cap",
  hatColor: "#92400e",
  backpack: "#92400e",
  shoes: "#26211c",
  glasses: "none",
  hair: "short",
  hairColor: "#2b2118",
  outfit: "shirt",
  trail: "none"
}

export function resolveLoadout(loadout: AvatarLoadout): Required<AvatarLoadout> {
  return {
    ...DEFAULT_LOADOUT,
    ...loadout,
    body: loadout.body ?? DEFAULT_LOADOUT.body ?? "male",
    shoes: loadout.shoes ?? DEFAULT_LOADOUT.shoes ?? "#26211c",
    glasses: loadout.glasses ?? DEFAULT_LOADOUT.glasses ?? "none",
    hair: loadout.hair ?? DEFAULT_LOADOUT.hair ?? "short",
    hairColor: loadout.hairColor ?? DEFAULT_LOADOUT.hairColor ?? "#2b2118",
    outfit: loadout.outfit ?? DEFAULT_LOADOUT.outfit ?? "shirt",
    trail: loadout.trail ?? DEFAULT_LOADOUT.trail ?? "none"
  }
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
}

export function isValidLoadout(value: unknown): value is AvatarLoadout {
  if (typeof value !== "object" || value === null) return false
  const loadout = value as Record<string, unknown>
  const keys = ["skin", "shirt", "pants", "hat", "hatColor", "backpack"]
  if (!keys.every((key) => key in loadout)) return false
  const baseValid =
    (SKIN_TONES as readonly string[]).includes(loadout.skin as string) &&
    (SHIRT_COLORS as readonly string[]).includes(loadout.shirt as string) &&
    (PANTS_COLORS as readonly string[]).includes(loadout.pants as string) &&
    (HAT_STYLES as readonly string[]).includes(loadout.hat as string) &&
    (HAT_COLORS as readonly string[]).includes(loadout.hatColor as string) &&
    (BACKPACK_COLORS as readonly string[]).includes(loadout.backpack as string) &&
    isHexColor(loadout.skin) &&
    isHexColor(loadout.shirt) &&
    isHexColor(loadout.pants) &&
    isHexColor(loadout.hatColor) &&
    isHexColor(loadout.backpack)
  if (!baseValid) return false
  const shoesValid =
    loadout.shoes === undefined ||
    (isHexColor(loadout.shoes) && (SHOE_COLORS as readonly string[]).includes(loadout.shoes))
  const glassesValid =
    loadout.glasses === undefined ||
    (GLASSES_STYLES as readonly string[]).includes(loadout.glasses as GlassesStyle)
  const optionalIn = (key: string, allowed: readonly string[]) =>
    loadout[key] === undefined || allowed.includes(loadout[key] as string)
  return (
    shoesValid &&
    glassesValid &&
    optionalIn("body", BODIES) &&
    optionalIn("hair", HAIR_STYLES) &&
    optionalIn("hairColor", HAIR_COLORS) &&
    optionalIn("outfit", OUTFITS) &&
    optionalIn("trail", TRAILS)
  )
}

export function sanitizeLoadout(value: unknown): AvatarLoadout {
  return isValidLoadout(value) ? value : { ...DEFAULT_LOADOUT }
}
