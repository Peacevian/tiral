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

export const HAT_STYLES = ["cap", "beanie", "safari", "none"] as const
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

export type AvatarLoadout = {
  skin: string
  shirt: string
  pants: string
  hat: HatStyle
  hatColor: string
  backpack: string
}

export const DEFAULT_LOADOUT: AvatarLoadout = {
  skin: "#f2bd8c",
  shirt: "#f59e0b",
  pants: "#27364d",
  hat: "cap",
  hatColor: "#92400e",
  backpack: "#92400e"
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
}

export function isValidLoadout(value: unknown): value is AvatarLoadout {
  if (typeof value !== "object" || value === null) return false
  const loadout = value as Record<string, unknown>
  const keys = ["skin", "shirt", "pants", "hat", "hatColor", "backpack"]
  if (!keys.every((key) => key in loadout)) return false
  return (
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
  )
}

export function sanitizeLoadout(value: unknown): AvatarLoadout {
  return isValidLoadout(value) ? value : { ...DEFAULT_LOADOUT }
}
