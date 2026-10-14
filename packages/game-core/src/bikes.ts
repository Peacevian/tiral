// Bikes: the boda you ride on hustles. Made-up names modelled on the bikes
// that fill Kampala's stages. Decorations are cosmetic only — they never
// change speed, pay or anything else. See docs/economy-progress.md §16.10.

export type BikeStats = {
  /** 1–5: how fast trips go. */
  speed: number
  /** 1–5: higher = cheaper per km. */
  economy: number
  /** 1–5: passengers stay patient longer and tip better. */
  comfort: number
  /** 1–5: higher = fewer breakdowns. */
  durability: number
}

export type BikeBuild = {
  /** Tank silhouette. */
  tank: "boxy" | "round" | "sport"
  wheelRadius: number
  electric: boolean
  /** Factory colours. */
  paint: string
  trim: string
}

export const BIKE_MODELS = [
  {
    id: "rental",
    name: "Stage rental",
    basedOn: "a tired 100cc that has seen everything",
    stats: { speed: 2, economy: 2, comfort: 1, durability: 1 },
    price: null,
    rentPerDay: 10_000,
    acquire: "rent",
    build: { tank: "boxy", wheelRadius: 0.29, electric: false, paint: "#7f1d1d", trim: "#1f2937" }
  },
  {
    id: "boxa100",
    name: "Boxa 100",
    basedOn: "the stage workhorse",
    stats: { speed: 3, economy: 4, comfort: 2, durability: 4 },
    price: 450_000,
    rentPerDay: null,
    acquire: "buy_or_lease",
    build: { tank: "boxy", wheelRadius: 0.29, electric: false, paint: "#1d4ed8", trim: "#0f172a" }
  },
  {
    id: "star125",
    name: "Star 125",
    basedOn: "a comfy 125 commuter",
    stats: { speed: 3, economy: 3, comfort: 3, durability: 3 },
    price: 550_000,
    rentPerDay: null,
    acquire: "buy_or_lease",
    build: { tank: "round", wheelRadius: 0.3, electric: false, paint: "#0f172a", trim: "#b91c1c" }
  },
  {
    id: "dragon150",
    name: "Dragon 150",
    basedOn: "a loud Chinese 150cc",
    stats: { speed: 4, economy: 2, comfort: 2, durability: 2 },
    price: 600_000,
    rentPerDay: null,
    acquire: "buy",
    build: { tank: "sport", wheelRadius: 0.31, electric: false, paint: "#dc2626", trim: "#111827" }
  },
  {
    id: "zemboE",
    name: "Zembo E",
    basedOn: "an electric boda with swappable batteries",
    stats: { speed: 3, economy: 5, comfort: 3, durability: 4 },
    price: 700_000,
    rentPerDay: null,
    acquire: "lease",
    build: { tank: "round", wheelRadius: 0.3, electric: true, paint: "#f8fafc", trim: "#0ea5e9" }
  }
] as const satisfies ReadonlyArray<{
  id: string
  name: string
  basedOn: string
  stats: BikeStats
  price: number | null
  rentPerDay: number | null
  acquire: "rent" | "buy" | "lease" | "buy_or_lease"
  build: BikeBuild
}>

export type BikeModelId = (typeof BIKE_MODELS)[number]["id"]

export function findBikeModel(id: string) {
  return BIKE_MODELS.find((bike) => bike.id === id) ?? BIKE_MODELS[0]
}

// ---------------------------------------------------------------------------
// Decorations (cosmetic only).
export const BIKE_PAINTS = [
  { id: "factory", name: "Factory", color: null },
  { id: "red", name: "Boda red", color: "#b91c1c" },
  { id: "black", name: "Gloss black", color: "#0b0f19" },
  { id: "blue", name: "Royal blue", color: "#1d4ed8" },
  { id: "yellow", name: "Cranes yellow", color: "#facc15" },
  { id: "green", name: "Matooke green", color: "#15803d" },
  { id: "chrome", name: "Chrome", color: "#cbd5e1" },
  { id: "matte", name: "Matte grey", color: "#4b5563" }
] as const

export const SEAT_COVERS = [
  { id: "plain", name: "Plain black", color: "#111827", pattern: "plain" },
  { id: "fluffy", name: "Fluffy", color: "#f5f5f4", pattern: "fluffy" },
  { id: "fluffy-pink", name: "Fluffy pink", color: "#f9a8d4", pattern: "fluffy" },
  { id: "leopard", name: "Leopard", color: "#d97706", pattern: "leopard" },
  { id: "tartan", name: "Tartan", color: "#991b1b", pattern: "tartan" },
  { id: "team-red", name: "Team red & white", color: "#dc2626", pattern: "stripes" },
  { id: "team-blue", name: "Team blue & white", color: "#2563eb", pattern: "stripes" }
] as const

/** The 20 mudflap slogans (a fixed list; no free text). */
export const MUDFLAP_SLOGANS = [
  "God's Plan",
  "Maama's Prayers",
  "Mukama Yamba",
  "No Hurry in Africa",
  "Sente Ziruma",
  "Mpola Mpola",
  "Tugende",
  "Webale Katonda",
  "Hustle Hard",
  "Blessed",
  "Patience Pays",
  "Kampala Boy",
  "Never Give Up",
  "Life Goes On",
  "Respect the Boda",
  "Jesus Drives",
  "Inshallah",
  "Pray & Ride",
  "Mama Said Go Slow",
  "Small Small"
] as const

export const GRIP_COLORS = ["#111827", "#dc2626", "#facc15", "#22c55e", "#3b82f6", "#ec4899"] as const

export type BikeLook = {
  model: BikeModelId
  /** BIKE_PAINTS id. */
  paint: string
  /** SEAT_COVERS id. */
  seat: string
  /** Index into MUDFLAP_SLOGANS, or null for a plain flap. */
  slogan: number | null
  grips: string
  tassels: boolean
  rack: boolean
  crashBars: boolean
  /** LED underglow colour, or null. */
  underglow: string | null
}

export const RENTAL_BIKE_LOOK: BikeLook = {
  model: "rental",
  paint: "factory",
  seat: "plain",
  slogan: 0,
  grips: "#111827",
  tassels: false,
  rack: true,
  crashBars: false,
  underglow: null
}

export function bikePaintColor(look: BikeLook): string {
  const paint = BIKE_PAINTS.find((candidate) => candidate.id === look.paint)
  return paint?.color ?? findBikeModel(look.model).build.paint
}

export function findSeatCover(id: string) {
  return SEAT_COVERS.find((seat) => seat.id === id) ?? SEAT_COVERS[0]
}

// ---------------------------------------------------------------------------
// Ownership, stats in play, wear (H2a).

/** Lease-to-own terms per bike (Zembo E is lease-only, like real e-boda schemes). */
export const LEASE_TERMS: Partial<Record<BikeModelId, { deposit: number; weekly: number; weeks: number }>> = {
  boxa100: { deposit: 50_000, weekly: 70_000, weeks: 6 },
  star125: { deposit: 60_000, weekly: 85_000, weeks: 6 },
  zemboE: { deposit: 80_000, weekly: 90_000, weeks: 8 }
}

export function leaseTerms(model: string) {
  return LEASE_TERMS[model as BikeModelId] ?? null
}

/** A missed lease payment has this long (one game week, in hours) before repossession. */
export const LEASE_GRACE_HOURS = 48

export function canBuy(model: string) {
  const bike = findBikeModel(model)
  return bike.acquire === "buy" || bike.acquire === "buy_or_lease"
}

export function canLease(model: string) {
  const bike = findBikeModel(model)
  return (bike.acquire === "lease" || bike.acquire === "buy_or_lease") && leaseTerms(model) !== null
}

/** Bike speed vs walking. The scruffy rental (speed 2) is 2×; a Dragon (4) 2.3×. */
export function bikeSpeedFactor(stats: BikeStats) {
  return 1.7 + 0.15 * stats.speed
}

/** Fuel (or battery) cost per metre. Rental 0.6; Boxa 0.42; Zembo 0.33. */
export function bikeFuelPerMeter(stats: BikeStats) {
  return Math.round(0.6 * (1.3 - 0.15 * stats.economy) * 1000) / 1000
}

/** Passengers stay patient longer on a comfier bike. */
export function bikePatienceFactor(stats: BikeStats) {
  return 0.85 + 0.1 * stats.comfort
}

/** And tip a little more. */
export function bikeTipFactor(stats: BikeStats) {
  return 0.8 + 0.1 * stats.comfort
}

/** Wear added per km ridden (tougher bikes wear slower). */
export function bikeWearPerKm(stats: BikeStats) {
  return Math.round((1.4 - 0.2 * stats.durability) * 100) / 100
}

/** Rentals are always half worn out. */
export const RENTAL_WEAR = 50

/** Chance of a breakdown per km ridden with a passenger. */
export function breakdownChancePerKm(stats: BikeStats, wear: number) {
  const worn = Math.max(0, Math.min(100, wear)) / 100
  return 0.003 + 0.05 * worn * worn * (1.4 - 0.2 * stats.durability)
}

/** Cost of a garage service (wear back to 0). */
export function serviceCost(model: string) {
  const bike = findBikeModel(model)
  if (bike.build.electric) return 6_000
  return bike.stats.speed >= 4 ? 15_000 : bike.stats.comfort >= 3 ? 10_000 : 7_000
}

/** Roadside repair after a breakdown. */
export const BREAKDOWN_REPAIR = 8_000

// ---------------------------------------------------------------------------
// Decoration shop (H2b). Buy an item once, then use it on any of your bikes.
// Cosmetic only. Item ids: "paint:red", "seat:leopard", "slogan:3",
// "grips:#dc2626", "extra:tassels", "underglow:#22d3ee".

export type BikeItemRarity = "common" | "rare" | "epic"
export type BikeItemKind = "paint" | "seat" | "slogan" | "grips" | "extra" | "underglow"

export type BikeItem = {
  id: string
  kind: BikeItemKind
  name: string
  price: number
  rarity: BikeItemRarity
}

const PAINT_PRICES: Record<string, [number, BikeItemRarity]> = {
  red: [15_000, "common"],
  black: [15_000, "common"],
  blue: [15_000, "common"],
  yellow: [20_000, "rare"],
  green: [20_000, "rare"],
  matte: [25_000, "rare"],
  chrome: [40_000, "epic"]
}

const SEAT_PRICES: Record<string, [number, BikeItemRarity]> = {
  fluffy: [8_000, "common"],
  "fluffy-pink": [10_000, "common"],
  tartan: [10_000, "common"],
  leopard: [12_000, "rare"],
  "team-red": [15_000, "rare"],
  "team-blue": [15_000, "rare"]
}

export const UNDERGLOW_COLORS = [
  { color: "#22d3ee", name: "Cyan" },
  { color: "#ec4899", name: "Pink" },
  { color: "#22c55e", name: "Green" },
  { color: "#f59e0b", name: "Amber" }
] as const

export const BIKE_ITEMS: BikeItem[] = [
  ...BIKE_PAINTS.filter((paint) => paint.color !== null).map((paint) => {
    const [price, rarity] = PAINT_PRICES[paint.id] ?? [15_000, "common" as const]
    return { id: `paint:${paint.id}`, kind: "paint" as const, name: paint.name, price, rarity }
  }),
  ...SEAT_COVERS.filter((seat) => seat.id !== "plain").map((seat) => {
    const [price, rarity] = SEAT_PRICES[seat.id] ?? [8_000, "common" as const]
    return { id: `seat:${seat.id}`, kind: "seat" as const, name: seat.name, price, rarity }
  }),
  ...MUDFLAP_SLOGANS.map((slogan, index) => ({
    id: `slogan:${index}`,
    kind: "slogan" as const,
    name: slogan,
    price: 3_000,
    rarity: "common" as const
  })),
  ...GRIP_COLORS.filter((color) => color !== "#111827").map((color) => ({
    id: `grips:${color}`,
    kind: "grips" as const,
    name: "Coloured grips",
    price: 2_000,
    rarity: "common" as const
  })),
  { id: "extra:tassels", kind: "extra", name: "Tassels", price: 4_000, rarity: "common" },
  { id: "extra:rack", kind: "extra", name: "Carrier rack", price: 6_000, rarity: "common" },
  { id: "extra:crashBars", kind: "extra", name: "Crash bars", price: 12_000, rarity: "rare" },
  ...UNDERGLOW_COLORS.map((glow) => ({
    id: `underglow:${glow.color}`,
    kind: "underglow" as const,
    name: `${glow.name} underglow`,
    price: 25_000,
    rarity: "epic" as const
  }))
]

export function findBikeItem(id: string) {
  return BIKE_ITEMS.find((item) => item.id === id) ?? null
}

/** The shop items a look uses (free defaults — factory paint, plain seat, black grips, plain flap — need none). */
export function lookItemIds(look: BikeLook): string[] {
  const ids: string[] = []
  if (look.paint !== "factory") ids.push(`paint:${look.paint}`)
  if (look.seat !== "plain") ids.push(`seat:${look.seat}`)
  if (look.slogan !== null) ids.push(`slogan:${look.slogan}`)
  if (look.grips !== "#111827") ids.push(`grips:${look.grips}`)
  if (look.tassels) ids.push("extra:tassels")
  if (look.rack) ids.push("extra:rack")
  if (look.crashBars) ids.push("extra:crashBars")
  if (look.underglow) ids.push(`underglow:${look.underglow}`)
  return ids
}

/** A look is valid if every item it uses exists in the shop. */
export function isValidBikeLook(look: BikeLook): boolean {
  return lookItemIds(look).every((id) => findBikeItem(id) !== null)
}

/** What a look costs given the items you already own. */
export function lookCost(look: BikeLook, owned: ReadonlySet<string>): { items: BikeItem[]; total: number } {
  const items = lookItemIds(look)
    .filter((id) => !owned.has(id))
    .map((id) => findBikeItem(id))
    .filter((item): item is BikeItem => item !== null)
  return { items, total: items.reduce((sum, item) => sum + item.price, 0) }
}

/**
 * A fresh bike's look: plain everything. (The stage rental's rack and slogan
 * belong to the stage owner, not to bikes you buy.)
 */
export function plainBikeLook(model: BikeModelId): BikeLook {
  return { model, paint: "factory", seat: "plain", slogan: null, grips: "#111827", tassels: false, rack: false, crashBars: false, underglow: null }
}
