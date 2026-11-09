import type { PartId } from "./parts"

export type BeatKind = "warn" | "wall" | "release" | "unplug" | "shortcut" | "impact" | "puddle"

export type Beat = {
  id: string
  at: number
  window: number
  part: PartId
  kind: BeatKind
}

// One authored minute. The plug pops at 36s if it is still in.
// The end zone opens at 55s. $CUM before that ends the round.
export const COURSE_01: Beat[] = [
  { id: "warn-1", at: 4_000, window: 1_600, part: "pea", kind: "warn" },
  { id: "wall-1", at: 8_000, window: 1_600, part: "dick", kind: "wall" },
  { id: "release-1", at: 16_000, window: 4_000, part: "icp", kind: "release" },
  { id: "unplug-1", at: 22_000, window: 2_500, part: "plug", kind: "unplug" },
  { id: "shortcut-1", at: 26_000, window: 1_800, part: "anal", kind: "shortcut" },
  { id: "impact-1", at: 34_000, window: 1_600, part: "boobs", kind: "impact" },
  { id: "puddle-1", at: 42_000, window: 2_000, part: "sh1t", kind: "puddle" },
  { id: "warn-2", at: 48_000, window: 1_400, part: "pea", kind: "warn" },
  { id: "wall-2", at: 52_000, window: 1_600, part: "dick", kind: "wall" }
]

export const PROMPTS: Record<BeatKind, { ticker: string; line: string }> = {
  warn: { ticker: "$PEA", line: "Wall." },
  wall: { ticker: "$DOMX", line: "Charge." },
  release: { ticker: "$DOMX", line: "Release." },
  unplug: { ticker: "$DOMX", line: "Unplug. Now." },
  shortcut: { ticker: "$ANAL", line: "I can make that." },
  impact: { ticker: "$DOMX", line: "Shield." },
  puddle: { ticker: "$SH1TCOIN", line: "That was mine." }
}
