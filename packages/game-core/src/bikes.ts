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
