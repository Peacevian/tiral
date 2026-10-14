"use client"

import { useState } from "react"
import { notFound } from "next/navigation"
import { useEffect } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { BIKE_MODELS, BIKE_PAINTS, MUDFLAP_SLOGANS, RENTAL_BIKE_LOOK, SEAT_COVERS, type BikeLook } from "@tiral/game-core"
import { DEFAULT_LOADOUT } from "@tiral/avatars"
import { BikeRider } from "@/components/bike/BikeRider"

const VIEWS = {
  side: [3.2, 1.0, 0],
  front: [0, 1.2, 3.2],
  back: [0, 1.3, -3.2],
  three: [2.4, 1.6, 2.2],
  top: [0.01, 4, 0]
} as const

function CameraAt({ view }: { view: keyof typeof VIEWS }) {
  const { camera } = useThree()
  useEffect(() => {
    const [x, y, z] = VIEWS[view]
    camera.position.set(x, y, z)
    camera.lookAt(0, 0.8, 0)
  }, [camera, view])
  return null
}

// Development-only bench for tuning the bike model and riding poses.
export default function BikeBench() {
  if (process.env.NODE_ENV === "production") notFound()
  const [look, setLook] = useState<BikeLook>(RENTAL_BIKE_LOOK)
  const [passenger, setPassenger] = useState(true)
  const [rider, setRider] = useState(true)
  const [speed, setSpeed] = useState(0)
  const [view, setView] = useState<keyof typeof VIEWS>("side")
  const set = (patch: Partial<BikeLook>) => setLook((current) => ({ ...current, ...patch }))
  return (
    <main className="flex h-dvh w-screen bg-slate-900 text-white">
      <div className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto p-3 text-xs">
        <select value={look.model} onChange={(e) => set({ model: e.target.value as BikeLook["model"] })} className="rounded bg-slate-800 p-1">
          {BIKE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={look.paint} onChange={(e) => set({ paint: e.target.value })} className="rounded bg-slate-800 p-1">
          {BIKE_PAINTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={look.seat} onChange={(e) => set({ seat: e.target.value })} className="rounded bg-slate-800 p-1">
          {SEAT_COVERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={look.slogan ?? -1} onChange={(e) => set({ slogan: Number(e.target.value) < 0 ? null : Number(e.target.value) })} className="rounded bg-slate-800 p-1">
          <option value={-1}>No slogan</option>
          {MUDFLAP_SLOGANS.map((s, i) => <option key={s} value={i}>{s}</option>)}
        </select>
        {(["tassels", "rack", "crashBars"] as const).map((key) => (
          <label key={key}><input type="checkbox" checked={look[key]} onChange={(e) => set({ [key]: e.target.checked })} /> {key}</label>
        ))}
        <label><input type="checkbox" checked={look.underglow !== null} onChange={(e) => set({ underglow: e.target.checked ? "#22d3ee" : null })} /> underglow</label>
        <label><input type="checkbox" checked={rider} onChange={(e) => setRider(e.target.checked)} /> rider</label>
        <label><input type="checkbox" checked={passenger} onChange={(e) => setPassenger(e.target.checked)} /> passenger</label>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(VIEWS) as Array<keyof typeof VIEWS>).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded px-2 py-1 ${view === v ? "bg-amber-400 text-slate-900" : "bg-slate-800"}`}>{v}</button>
          ))}
        </div>
        <label>speed {speed}<input type="range" min={0} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
      </div>
      <div className="flex-1">
        <Canvas camera={{ position: [2.4, 1.6, 2.2], fov: 40 }} shadows>
          <hemisphereLight args={["#fff4d6", "#293548", 0.8]} />
          <directionalLight position={[4, 7, 5]} intensity={2.4} castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 8]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          {rider ? (
            <BikeRider look={look} rider={DEFAULT_LOADOUT} passenger={passenger} passengerSeed="bench" speed={speed} />
          ) : (
            <BikeRider look={look} rider={DEFAULT_LOADOUT} speed={speed} />
          )}
          <CameraAt view={view} />
        </Canvas>
      </div>
    </main>
  )
}
