// Shapes of the cars at the washing bay, in metres, facing +Z with the ground
// at y = 0. The washable surface is split into flat zones (the server knows
// only their count, from @tiral/game-core CAR_TYPES); each zone is a plane laid
// just outside the body so dirt and foam can be painted onto it.

export type ZonePanel = {
  id: number
  label: string
  position: [number, number, number]
  rotation: [number, number, number]
  size: [number, number]
}

export type CarLayout = {
  length: number
  width: number
  lowerBottom: number
  lowerTop: number
  cabin: { zStart: number; zEnd: number; top: number; inset: number }
  wheelRadius: number
  paint: string
  stripe: string | null
  zones: ZonePanel[]
}

type Params = {
  length: number
  width: number
  lowerBottom: number
  lowerTop: number
  cabin: { zStart: number; zEnd: number; top: number; inset: number }
  sideSegments: number
  roofSegments: number
  hood: boolean
  trunk: boolean
  wheelRadius: number
  stripe: string | null
}

const PARAMS: Record<string, Params> = {
  saloon: {
    length: 4.2,
    width: 1.75,
    lowerBottom: 0.35,
    lowerTop: 0.95,
    cabin: { zStart: -1.15, zEnd: 0.7, top: 1.45, inset: 0.12 },
    sideSegments: 3,
    roofSegments: 2,
    hood: true,
    trunk: true,
    wheelRadius: 0.32,
    stripe: null
  },
  suv: {
    length: 4.6,
    width: 1.9,
    lowerBottom: 0.42,
    lowerTop: 1.15,
    cabin: { zStart: -1.95, zEnd: 0.9, top: 1.85, inset: 0.08 },
    sideSegments: 4,
    roofSegments: 4,
    hood: true,
    trunk: true,
    wheelRadius: 0.38,
    stripe: null
  },
  taxi: {
    length: 4.7,
    width: 1.75,
    lowerBottom: 0.35,
    lowerTop: 1.15,
    cabin: { zStart: -2.35, zEnd: 1.95, top: 2.15, inset: 0 },
    sideSegments: 6,
    roofSegments: 5,
    hood: true,
    trunk: false,
    wheelRadius: 0.32,
    stripe: "#1d4ed8"
  }
}

const PAINTS: Record<string, string[]> = {
  saloon: ["#e5e7eb", "#9ca3af", "#b91c1c", "#1e3a8a", "#065f46"],
  suv: ["#111827", "#374151", "#f8fafc", "#78350f"],
  taxi: ["#f8fafc"]
}

const OUT = 0.006

export function carLayout(type: string, seed: string): CarLayout {
  const p = PARAMS[type] ?? PARAMS.saloon!
  const paints = PAINTS[type] ?? PAINTS.saloon!
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const paint = paints[hash % paints.length]!
  const zones: ZonePanel[] = []
  const add = (label: string, position: [number, number, number], rotation: [number, number, number], size: [number, number]) =>
    zones.push({ id: zones.length, label, position, rotation, size })

  const halfL = p.length / 2
  const halfW = p.width / 2
  const lowerH = p.lowerTop - p.lowerBottom
  const lowerY = (p.lowerTop + p.lowerBottom) / 2
  const segment = p.length / p.sideSegments
  // Sides: segments from front to back, on both sides.
  for (const side of [1, -1]) {
    for (let i = 0; i < p.sideSegments; i++) {
      const z = halfL - segment * (i + 0.5)
      add(
        `${side > 0 ? "Left" : "Right"} side ${i + 1}`,
        [side * (halfW + OUT), lowerY, z],
        [0, side * (Math.PI / 2), 0],
        [segment, lowerH]
      )
    }
  }
  // Roof over the cabin.
  const cabinLength = p.cabin.zEnd - p.cabin.zStart
  const roofSegment = cabinLength / p.roofSegments
  const roofWidth = p.width - p.cabin.inset * 2
  for (let i = 0; i < p.roofSegments; i++) {
    const z = p.cabin.zEnd - roofSegment * (i + 0.5)
    add(`Roof ${i + 1}`, [0, p.cabin.top + OUT, z], [-Math.PI / 2, 0, 0], [roofWidth, roofSegment])
  }
  if (p.hood) {
    const length = halfL - p.cabin.zEnd
    add("Bonnet", [0, p.lowerTop + OUT, p.cabin.zEnd + length / 2], [-Math.PI / 2, 0, 0], [p.width, length])
  }
  if (p.trunk) {
    const length = p.cabin.zStart + halfL
    add("Boot", [0, p.lowerTop + OUT, -halfL + length / 2], [-Math.PI / 2, 0, 0], [p.width, length])
  }
  add("Front", [0, lowerY, halfL + OUT], [0, 0, 0], [p.width, lowerH])
  add("Back", [0, lowerY, -halfL - OUT], [0, Math.PI, 0], [p.width, lowerH])

  return {
    length: p.length,
    width: p.width,
    lowerBottom: p.lowerBottom,
    lowerTop: p.lowerTop,
    cabin: p.cabin,
    wheelRadius: p.wheelRadius,
    paint,
    stripe: p.stripe,
    zones
  }
}
