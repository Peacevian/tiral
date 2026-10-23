"use client"

import { useEffect, useState } from "react"
import { notFound } from "next/navigation"
import dynamic from "next/dynamic"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })
const ThreeLayer = dynamic(() => import("@/components/ThreeLayer").then((m) => m.ThreeLayer), { ssr: false })
const City = dynamic(() => import("@/components/city/City").then((m) => m.City), { ssr: false })

// Tiral's city on the map, to look at and measure (window.__cityStats).
// Development only. ?view=street: down at shop level; ?view=lugogo: Kyadondo's
// corner; ?view=kisenyi: dense houses; ?view=race: the race camera's zoom.

const VIEWS = {
  city: { lat: 0.3132, lng: 32.5828, zoom: 17.2, pitch: 62, bearing: -35 },
  street: { lat: 0.31318, lng: 32.58345, zoom: 18.9, pitch: 78, bearing: 65 },
  lugogo: { lat: 0.3252, lng: 32.6075, zoom: 17.4, pitch: 60, bearing: -20 },
  race: { lat: 0.3132, lng: 32.5828, zoom: 15, pitch: 48, bearing: -18 },
  kisenyi: { lat: 0.3075, lng: 32.5655, zoom: 17, pitch: 60, bearing: 20 },
  ntinda: { lat: 0.353, lng: 32.615, zoom: 16.5, pitch: 55, bearing: 0 },
  south: { lat: 0.2485, lng: 32.5655, zoom: 17, pitch: 60, bearing: 0 },
  southclose: { lat: 0.2492, lng: 32.5640, zoom: 18.6, pitch: 72, bearing: 30 },
  southwide: { lat: 0.2485, lng: 32.5655, zoom: 15.2, pitch: 50, bearing: 0 }
}

export default function CityBench() {
  if (process.env.NODE_ENV === "production") notFound()
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [view, setView] = useState<(typeof VIEWS)[keyof typeof VIEWS] | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setView(VIEWS[(params.get("view") ?? "city") as keyof typeof VIEWS] ?? VIEWS.city)
  }, [])
  return (
    <main className="relative h-dvh w-screen bg-sheet">
      {view && <MapView center={{ lat: view.lat, lng: view.lng }} zoom={view.zoom} pitch={view.pitch} bearing={view.bearing} onMapReady={setMap} />}
      {map && (
        <ThreeLayer map={map}>
          <City map={map} />
        </ThreeLayer>
      )}
      <Diagnostics />
    </main>
  )
}

/** What the city is doing in this browser (to debug a blank city from a screenshot). */
function Diagnostics() {
  const [text, setText] = useState("starting…")
  useEffect(() => {
    const errors: string[] = []
    const onError = (event: ErrorEvent) => errors.push(String(event.message).slice(0, 160))
    const onRejection = (event: PromiseRejectionEvent) => errors.push(`promise: ${String(event.reason?.message ?? event.reason).slice(0, 160)}`)
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    const timer = window.setInterval(() => {
      const w = window as unknown as { __cityStats?: unknown; __cityRenderer?: { info: { render: object }; getContext(): WebGLRenderingContext; domElement: HTMLCanvasElement } }
      const r = w.__cityRenderer
      const gl = r?.getContext()
      const canvas = r?.domElement
      const box = canvas?.getBoundingClientRect()
      const lines = [
        `stats ${JSON.stringify(w.__cityStats ?? null)}`,
        `renderer ${r ? JSON.stringify(r.info.render) : "none"} lost=${gl?.isContextLost() ?? "-"}`,
        `canvas ${canvas ? `${canvas.width}x${canvas.height} at ${Math.round(box!.width)}x${Math.round(box!.height)}` : "none"} · canvases on page ${document.querySelectorAll("canvas").length} · dpr ${devicePixelRatio}`,
        `errors ${errors.length ? errors.slice(-4).join(" | ") : "none"}`
      ]
      setText(lines.join("\n"))
    }, 1000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
  return <pre className="absolute left-2 top-2 z-50 max-w-[90vw] whitespace-pre-wrap rounded bg-black/75 p-2 text-[11px] leading-tight text-white">{text}</pre>
}
