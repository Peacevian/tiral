"use client"

import { useEffect, useRef } from "react"
import type maplibregl from "maplibre-gl"

export type BillboardPin = {
  slotId: string
  slotName: string
  lat: number
  lng: number
  kind: "ad" | "house"
  brandName?: string
  imagePath?: string | null
  link?: string
  campaignId?: string
}

const PIN_SIZE = 34

export function BillboardLayer({
  map,
  pins,
  onPinClick
}: {
  map: maplibregl.Map | null
  pins: BillboardPin[]
  onPinClick(pin: BillboardPin): void
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const pinsRef = useRef(pins)
  pinsRef.current = pins
  const onPinClickRef = useRef(onPinClick)
  onPinClickRef.current = onPinClick

  useEffect(() => {
    if (!map || !layerRef.current) return
    const layer = layerRef.current
    const pool = new Map<string, HTMLButtonElement>()
    let raf = 0

    const update = () => {
      raf = requestAnimationFrame(update)
      const seen = new Set<string>()
      for (const pin of pinsRef.current) {
        seen.add(pin.slotId)
        let el = pool.get(pin.slotId)
        if (!el) {
          el = document.createElement("button")
          el.type = "button"
          el.style.position = "absolute"
          el.style.transform = "translate(-50%,-100%)"
          el.style.width = `${PIN_SIZE}px`
          el.style.height = `${PIN_SIZE}px`
          el.style.borderRadius = "10px"
          el.style.overflow = "hidden"
          el.style.cursor = "pointer"
          el.style.padding = "0"
          el.addEventListener("click", (event) => {
            event.stopPropagation()
            const current = pinsRef.current.find((p) => p.slotId === pin.slotId)
            if (current) onPinClickRef.current(current)
          })
          pool.set(pin.slotId, el)
          layer.appendChild(el)
        }
        const point = map.project([pin.lng, pin.lat])
        el.style.left = `${point.x}px`
        el.style.top = `${point.y - 10}px`
        el.style.border = pin.kind === "ad" ? "2px solid #f59e0b" : "2px dashed rgba(255,255,255,0.5)"
        el.style.background = pin.kind === "ad" ? "#0f172a" : "rgba(2,6,23,0.6)"
        el.title = pin.kind === "ad" ? (pin.brandName ?? pin.slotName) : `${pin.slotName} — advertise here`
        const imgKey = pin.imagePath ?? pin.kind
        if (el.dataset.img !== imgKey) {
          el.dataset.img = imgKey
          el.innerHTML = ""
          if (pin.imagePath) {
            const img = document.createElement("img")
            img.src = pin.imagePath
            img.alt = pin.brandName ?? pin.slotName
            img.style.width = "100%"
            img.style.height = "100%"
            img.style.objectFit = "cover"
            el.appendChild(img)
          } else {
            el.textContent = pin.kind === "ad" ? "★" : "+"
            el.style.color = "#fff"
            el.style.fontSize = "18px"
            el.style.lineHeight = `${PIN_SIZE - 4}px`
            el.style.textAlign = "center"
          }
        }
      }
      for (const [id, el] of pool) {
        if (!seen.has(id)) {
          el.remove()
          pool.delete(id)
        }
      }
    }
    raf = requestAnimationFrame(update)

    return () => {
      cancelAnimationFrame(raf)
      for (const el of pool.values()) el.remove()
      pool.clear()
    }
  }, [map])

  return <div ref={layerRef} className="pointer-events-none absolute inset-0 z-[15] [&>button]:pointer-events-auto" />
}
