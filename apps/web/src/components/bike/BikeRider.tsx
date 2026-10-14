"use client"

import type { AvatarLoadout } from "@tiral/avatars"
import type { BikeLook } from "@tiral/game-core"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import { Bike3D } from "./Bike3D"

// Model-space offsets that put the standing model's hips (≈0.98 m up) on the
// seat: the rider just behind the tank, the passenger on the back.
export const RIDER_OFFSET: [number, number, number] = [0, -0.16, -0.12]
export const PASSENGER_OFFSET: [number, number, number] = [0, -0.1, -0.52]

// The passenger is a plain dummy person (not a player): simple clothes, no hat
// or accessories, a few colour variations so they don't all look the same.
const DUMMY_LOOKS: AvatarLoadout[] = [
  { skin: "#8d5524", shirt: "#e5e7eb", pants: "#374151", hat: "none", hatColor: "#000000", backpack: "#000000", outfit: "shirt", hair: "short", hairColor: "#1c1917" },
  { skin: "#6b4423", shirt: "#60a5fa", pants: "#1f2937", hat: "none", hatColor: "#000000", backpack: "#000000", outfit: "shirt", hair: "short", hairColor: "#1c1917" },
  { skin: "#a16207", shirt: "#9ca3af", pants: "#44403c", hat: "none", hatColor: "#000000", backpack: "#000000", outfit: "shirt", hair: "short", hairColor: "#1c1917" },
  { skin: "#7c4a21", shirt: "#fca5a5", pants: "#1e293b", hat: "none", hatColor: "#000000", backpack: "#000000", outfit: "shirt", hair: "short", hairColor: "#1c1917" }
]

export function passengerDummy(seed = "") {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return DUMMY_LOOKS[hash % DUMMY_LOOKS.length]!
}

/** A boda with its rider (and optionally a dummy passenger), in metres, facing +Z. */
export function BikeRider({
  look,
  rider,
  passenger = false,
  passengerSeed,
  speed = 0,
  lean = 0,
  plateSeed,
  mirroredText = false
}: {
  look: BikeLook
  rider: AvatarLoadout
  /** Show a dummy person on the back. */
  passenger?: boolean
  /** Picks which dummy look (e.g. the passenger's job id). */
  passengerSeed?: string
  speed?: number
  lean?: number
  plateSeed?: string
  mirroredText?: boolean
}) {
  return (
    <group>
      <Bike3D look={look} speed={speed} lean={lean} plateSeed={plateSeed} mirroredText={mirroredText} />
      <group position={RIDER_OFFSET}>
        <RealisticAvatar loadout={rider} moving={false} ride="rider" />
      </group>
      {passenger && (
        <group position={PASSENGER_OFFSET}>
          <RealisticAvatar loadout={passengerDummy(passengerSeed)} moving={false} ride="passenger" />
        </group>
      )}
    </group>
  )
}
