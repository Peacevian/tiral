"use client"

import { useEffect, useState } from "react"
import { notFound } from "next/navigation"
import { DEFAULT_LOADOUT } from "@tiral/avatars"
import { RolexStall3D, type RolexPrep } from "@/components/rolex/RolexStall3D"

// Development-only bench for the 3D rolex stall, with pretend customers.
// ?stage=prep (bowl half done) | cook (egg frying) | flip (rolled and handed over)
export default function RolexBench() {
  const [started] = useState(() => Date.now())
  const [stage, setStage] = useState("prep")
  useEffect(() => setStage(new URLSearchParams(window.location.search).get("stage") ?? "prep"), [])
  if (process.env.NODE_ENV === "production") notFound()
  const customers = [
    { id: "11", wants: 2, served: 1, leavesInMs: 48_000 },
    { id: "12", wants: 1, served: 0, leavesInMs: 30_000 },
    { id: "13", wants: 1, served: 0, leavesInMs: 9_000 }
  ]
  const prep: RolexPrep = { customerId: "12", eggs: 2, veg: stage !== "prep", whisked: false, crackAt: 0, vegAt: 0, whiskAt: 0 }
  return (
    <main className="fixed inset-0">
      <RolexStall3D
        customers={customers}
        received={started}
        prep={prep}
        next={stage === "prep" ? "board" : "pan"}
        cooking={stage === "cook" ? { since: started - 3600, customerId: "11" } : null}
        flip={stage === "flip" ? { result: "perfect", at: started + 1400, customerId: "11" } : null}
        loadout={DEFAULT_LOADOUT}
        onPick={() => {}}
        onTap={() => {}}
      />
    </main>
  )
}
