"use client"

import { useState } from "react"
import { notFound } from "next/navigation"
import dynamic from "next/dynamic"
import { CAST_CLIPS, type CastClip } from "@/components/film/NewCast"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })
const ThreeLayer = dynamic(() => import("@/components/ThreeLayer").then((m) => m.ThreeLayer), { ssr: false })
const City = dynamic(() => import("@/components/city/City").then((m) => m.City), { ssr: false })
const NewCast = dynamic(() => import("@/components/film/NewCast").then((m) => m.NewCast), { ssr: false })

// The code-made characters (scripts/characters) in the city, beside the
// current avatar: left the game's avatar, then the new young man and woman.
// Each button plays that animation; "Walk around" sends them round a loop.
// Development only.

const VIEW = { lat: 0.31318, lng: 32.58345, zoom: 23.4, pitch: 65, bearing: 65 }
const ANCHOR = { lat: VIEW.lat, lng: VIEW.lng }

export default function HeroBench() {
  if (process.env.NODE_ENV === "production") notFound()
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [clip, setClip] = useState<CastClip>("breathing_idle")
  const [roam, setRoam] = useState(false)
  return (
    <main className="relative h-dvh w-screen bg-sheet">
      <MapView center={ANCHOR} zoom={18} pitch={VIEW.pitch} bearing={VIEW.bearing} onMapReady={(ready) => {
        // Closer than the game allows, to see faces.
        ready.setMaxZoom(24)
        ready.jumpTo({ zoom: VIEW.zoom })
        ;(window as unknown as { __devMap?: maplibregl.Map }).__devMap = ready
        setMap(ready)
      }} />
      {map && (
        <ThreeLayer map={map}>
          <City map={map} />
          <NewCast anchor={ANCHOR} facing={VIEW.bearing + 180} clip={clip} roam={roam} />
        </ThreeLayer>
      )}
      <div className="absolute left-2 top-2 z-10 flex max-w-[95vw] flex-wrap gap-1">
        <button type="button" onClick={() => setRoam(!roam)} className={`rounded px-2 py-1 text-xs font-bold ${roam ? "bg-flame text-white" : "bg-white"}`}>
          Walk around
        </button>
        {CAST_CLIPS.map((name) => (
          <button key={name} type="button" onClick={() => setClip(name)} className={`rounded px-2 py-1 text-xs font-bold ${clip === name ? "bg-flame text-white" : "bg-white"}`}>
            {name.replaceAll("_", " ")}
          </button>
        ))}
      </div>
    </main>
  )
}
