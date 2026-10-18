"use client"

import { useEffect, useState } from "react"
import { notFound } from "next/navigation"
import dynamic from "next/dynamic"
import type { VenueTime } from "@/components/venue/KyadondoScene"

const KyadondoScene = dynamic(() => import("@/components/venue/KyadondoScene").then((module) => module.KyadondoScene), { ssr: false })

const VIEWS = {
  gate: { camera: [-60, 11, -80], look: [-42, 2, -30] },
  aerial: { camera: [30, 110, 120], look: [0, 0, 0] },
  stage: { camera: [20, 8, 27], look: [18, 2.5, 47] },
  road: { camera: [-30, 18, -110], look: [-10, 2, -40] }
} as const

// Development-only preview of the Kyadondo venue: ?time=day|evening&view=gate|aerial|stage|road. Tap the grass to walk.
export default function KyadondoBench() {
  if (process.env.NODE_ENV === "production") notFound()
  const [time, setTime] = useState<VenueTime>("evening")
  const [view, setView] = useState<keyof typeof VIEWS>("gate")
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("time") === "day") setTime("day")
    const asked = params.get("view") as keyof typeof VIEWS | null
    if (asked && asked in VIEWS) setView(asked)
    setReady(true)
  }, [])
  return (
    <main className="relative h-dvh w-screen bg-sheet">
      {ready && <KyadondoScene key={`${time}${view}`} time={time} camera={[...VIEWS[view].camera]} look={[...VIEWS[view].look]} />}
      <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
        {(Object.keys(VIEWS) as Array<keyof typeof VIEWS>).map((candidate) => (
          <button key={candidate} type="button" onClick={() => setView(candidate)} className={`rounded px-2 py-1 text-xs font-bold ${view === candidate ? "bg-flame text-white" : "bg-white"}`}>
            {candidate}
          </button>
        ))}
        <button type="button" onClick={() => setTime(time === "day" ? "evening" : "day")} className="rounded bg-white px-2 py-1 text-xs font-bold">
          {time}
        </button>
      </div>
    </main>
  )
}
