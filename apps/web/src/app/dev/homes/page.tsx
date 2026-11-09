"use client"

import { useEffect, useState } from "react"
import { notFound } from "next/navigation"
import { DEFAULT_HOUSE } from "@tiral/houses"
import { DEFAULT_LOADOUT } from "@tiral/avatars"
import { HOUSING_TIERS } from "@tiral/game-core"
import { HERO } from "@/components/film/hero"
import { HousePreview } from "@/components/house/HousePreview"
import type { HouseView } from "@/components/house/roomSpots"

// Development-only bench for the home buildings: ?home=kololo&view=inside.
// ?hero=1: the trailer hero, without the buttons.
export default function HomesBench() {
  if (process.env.NODE_ENV === "production") notFound()
  const [home, setHome] = useState("kisenyi")
  const [view, setView] = useState<HouseView>("outside")
  const [roof, setRoof] = useState(false)
  const [hero, setHero] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setHome(params.get("home") ?? "kisenyi")
    setView((params.get("view") as HouseView | null) ?? "outside")
    setRoof(params.get("roof") === "1")
    setHero(params.get("hero") === "1")
  }, [])
  return (
    <main className="relative h-dvh w-screen bg-sheet">
      <HousePreview fill house={DEFAULT_HOUSE} home={home} view={view} showRoof={roof} avatarLoadout={hero ? HERO : DEFAULT_LOADOUT} />
      <div className={`absolute left-2 top-2 z-10 ${hero ? "hidden" : ""}`}>
        {HOUSING_TIERS.map((tier) => (
          <button key={tier.id} type="button" onClick={() => setHome(tier.id)} className={`rounded px-2 py-1 text-xs font-bold ${home === tier.id ? "bg-flame text-white" : "bg-white"}`}>
            {tier.id}
          </button>
        ))}
        <button type="button" onClick={() => setView(view === "inside" ? "outside" : "inside")} className="rounded bg-white px-2 py-1 text-xs font-bold">
          {view}
        </button>
      </div>
    </main>
  )
}
