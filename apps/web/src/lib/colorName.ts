// Plain-language names for picker colours ("dark green", not "#166534"), for
// screen readers and tooltips. Named from hue, saturation and lightness.

function hsl(hex: string): [h: number, s: number, l: number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const digits = match[1]!.length === 3 ? [...match[1]!].map((d) => d + d).join("") : match[1]!
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h, s, l]
}

export function colorName(hex: string): string {
  const parsed = hsl(hex)
  if (!parsed) return hex
  const [h, s, l] = parsed
  if (l < 0.12) return "black"
  if (l > 0.94) return "white"
  if (s < 0.15) return l < 0.35 ? "dark grey" : l > 0.7 ? "light grey" : "grey"

  let name: string
  if (s < 0.4 && h >= 190 && h < 260) name = "slate"
  else if (h < 15 || h >= 335) name = l < 0.3 ? "maroon" : "red"
  else if (h < 40) name = l < 0.42 ? "brown" : s < 0.5 && l > 0.7 ? "beige" : "orange"
  else if (h < 65) name = l < 0.35 ? "olive" : s < 0.5 && l > 0.75 ? "cream" : h < 45 ? "amber" : "yellow"
  else if (h < 160) name = "green"
  else if (h < 195) name = "teal"
  else if (h < 220) name = "sky blue"
  else if (h < 255) name = l < 0.3 ? "navy" : "blue"
  else if (h < 290) name = "purple"
  else name = "pink"

  if (["maroon", "brown", "olive", "navy", "beige", "cream"].includes(name)) return name
  if (l < 0.3) return `dark ${name}`
  if (l > 0.75) return `light ${name}`
  return name
}

/** Skin tones by lightness ("medium-dark skin"): hue names would call them all orange. */
export function skinToneName(hex: string): string {
  const parsed = hsl(hex)
  if (!parsed) return hex
  const l = parsed[2]
  const tone = l > 0.72 ? "light" : l > 0.6 ? "medium-light" : l > 0.45 ? "medium" : l > 0.3 ? "medium-dark" : "dark"
  return `${tone} skin`
}
