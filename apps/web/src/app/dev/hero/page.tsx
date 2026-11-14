"use client"

import { useEffect, useState } from "react"
import { notFound } from "next/navigation"
import dynamic from "next/dynamic"
import {
  BACKPACK_COLORS,
  GLASSES_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  HAT_COLORS,
  HAT_STYLES,
  OUTFITS,
  PANTS_COLORS,
  SHIRT_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  type AvatarLoadout
} from "@tiral/avatars"
import { CAST_CLIPS, NEW_CAST, type CastClip } from "@/components/film/NewCast"
import { crowdLook } from "@/components/city/StreetCrowd"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })
const ThreeLayer = dynamic(() => import("@/components/ThreeLayer").then((m) => m.ThreeLayer), { ssr: false })
const City = dynamic(() => import("@/components/city/City").then((m) => m.City), { ssr: false })
const NewCast = dynamic(() => import("@/components/film/NewCast").then((m) => m.NewCast), { ssr: false })
const Studio = dynamic(() => import("@/components/film/Studio").then((m) => m.Studio), { ssr: false })

// The code-made characters (scripts/characters) in the city, beside the
// current avatar: left the game's avatar, then the new young man and woman.
// Each button plays that animation; "Walk around" sends them round a loop;
// "Shuffle" dresses the new pair in random picks from the game's (colours,
// hair, hats, glasses and outfits; hats and glasses one time in three).
// "Hats", "Hair", "Outfits", "Glasses": a man and a woman in each one, in a row.
// "Crowd": twelve passers-by as the street crowd dresses them.
// ?studio=1: the same in a plain room, close up, without the city.
// Development only.

const VIEW = { lat: 0.31318, lng: 32.58345, zoom: 23.4, pitch: 65, bearing: 65 }
const ANCHOR = { lat: VIEW.lat, lng: VIEW.lng }

export default function HeroBench() {
  if (process.env.NODE_ENV === "production") notFound()
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [clip, setClip] = useState<CastClip>("breathing_idle")
  const [roam, setRoam] = useState(false)
  const [cast, setCast] = useState<AvatarLoadout[]>(NEW_CAST)
  const [studio, setStudio] = useState(false)
  useEffect(() => setStudio(new URLSearchParams(window.location.search).get("studio") === "1"), [])
  return (
    <main className="relative h-dvh w-screen bg-sheet">
      {studio ? (
        <Studio cast={cast} clip={clip} />
      ) : (
        <MapView center={ANCHOR} zoom={18} pitch={VIEW.pitch} bearing={VIEW.bearing} onMapReady={(ready) => {
          // Closer than the game allows, to see faces.
          ready.setMaxZoom(24)
          ready.jumpTo({ zoom: VIEW.zoom })
          ;(window as unknown as { __devMap?: maplibregl.Map }).__devMap = ready
          setMap(ready)
        }} />
      )}
      {map && !studio && (
        <ThreeLayer map={map}>
          <City map={map} />
          <NewCast anchor={ANCHOR} facing={VIEW.bearing + 180} clip={clip} roam={roam} cast={cast} />
        </ThreeLayer>
      )}
      <div className="absolute left-2 top-2 z-10 flex max-w-[95vw] flex-wrap gap-1">
        <button type="button" onClick={() => setRoam(!roam)} className={`rounded px-2 py-1 text-xs font-bold ${roam ? "bg-flame text-white" : "bg-white"}`}>
          Walk around
        </button>
        <button type="button" onClick={() => setCast(cast.map(shuffled))} className="rounded bg-white px-2 py-1 text-xs font-bold">
          Shuffle
        </button>
        <button
          type="button"
          onClick={() => setCast(Array.from({ length: 12 }, () => crowdLook(Math.random()).loadout))}
          className="rounded bg-white px-2 py-1 text-xs font-bold"
        >
          Crowd
        </button>
        {(["hat", "hair", "outfit", "glasses"] as const).map((slot) => (
          <button key={slot} type="button" onClick={() => setCast(lineup(slot))} className="rounded bg-white px-2 py-1 text-xs font-bold">
            {{ hat: "Hats", hair: "Hair", outfit: "Outfits", glasses: "Glasses" }[slot]}
          </button>
        ))}
        {CAST_CLIPS.map((name) => (
          <button key={name} type="button" onClick={() => setClip(name)} className={`rounded px-2 py-1 text-xs font-bold ${clip === name ? "bg-flame text-white" : "bg-white"}`}>
            {name.replaceAll("_", " ")}
          </button>
        ))}
      </div>
    </main>
  )
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!

function shuffled(loadout: AvatarLoadout): AvatarLoadout {
  return {
    ...loadout,
    skin: pick(SKIN_TONES),
    shirt: pick(SHIRT_COLORS),
    pants: pick(PANTS_COLORS),
    shoes: pick(SHOE_COLORS),
    hairColor: pick(HAIR_COLORS),
    backpack: pick(BACKPACK_COLORS),
    hair: pick(HAIR_STYLES),
    hat: Math.random() < 0.33 ? pick(HAT_STYLES) : "none",
    hatColor: pick(HAT_COLORS),
    glasses: Math.random() < 0.33 ? pick(GLASSES_STYLES) : "none",
    outfit: pick(OUTFITS)
  }
}

/** The new pair in every option of one slot (hats over short hair). */
function lineup(slot: "hat" | "hair" | "outfit" | "glasses"): AvatarLoadout[] {
  const options: readonly string[] = { hat: HAT_STYLES, hair: HAIR_STYLES, outfit: OUTFITS, glasses: GLASSES_STYLES }[slot]
  return options.flatMap((option) =>
    NEW_CAST.map((loadout) => ({ ...loadout, hair: "short" as const, hairColor: "#2b2118", hatColor: "#b91c1c", [slot]: option }))
  )
}
